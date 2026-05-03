/**
 * Token-extension verification (M4)
 *
 * Walks the design-token usage of a single component (an extending
 * subclass, in the typical case) and emits findings against the four
 * defect classes M4 closes:
 *
 *   - 01-token-deprecated-alias  → use of an alias instead of canonical
 *   - 02-token-cascade-gap       → token used but missing under
 *                                  dark / high-contrast overlay
 *   - 03-token-color-literal     → raw #hex / rgb() / hsl() where a
 *                                  token exists for the role
 *   - 14-cssprop-deprecation-drift → cssprop documented but deprecated
 *
 * Inputs:
 *   - The component declaration (CemDeclaration) — provides the
 *     authored CSS-prop list and the source CSS file references.
 *   - The deprecated-aliases map (loaded once via loadDeprecatedAliases).
 *   - The design-tokens list (parseTokens).
 *
 * Output: AuditFinding[] in the same shape M3 uses, so consumers
 * (rea push-gate, helixir audit dashboards) get a uniform finding feed.
 */

import type { CemDeclaration } from './cem.js';
import type { AuditFinding } from './audit-cache.js';
import type { CanonicalityResult, DeprecatedAlias } from './token-canonicality.js';
import { resolveCanonicality } from './token-canonicality.js';
import type { DesignToken } from './tokens.js';

// ─── Public types ───────────────────────────────────────────────────────────

export interface VerifyTokenInheritanceInput {
  /** The component being audited (subclass in the extension case). */
  decl: CemDeclaration;
  /** Loaded alias map (loadDeprecatedAliases). */
  aliases: DeprecatedAlias[];
  /** Loaded canonical token list (parseTokens). */
  tokens: DesignToken[];
  /**
   * Optional: raw CSS source text(s) for the component. When supplied,
   * the color-literal scan runs across them. When omitted, only the
   * CEM-declared cssProperties surface is inspected.
   */
  cssSources?: string[];
  /**
   * Optional theme-overlay defined-keys map. Used by the cascade-gap
   * check (defect class 02) to detect tokens referenced in the
   * component but missing under dark / high-contrast overlays.
   * Each overlay is a Set of CSS-prop names that exist in that theme.
   */
  overlays?: {
    dark?: Set<string>;
    highContrast?: Set<string>;
  };
}

export interface VerifyTokenInheritanceResult {
  findings: AuditFinding[];
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run M4's token-extension verification. Pure function — no I/O.
 * Caller loads the aliases, tokens, and (optionally) CSS sources up
 * front so the same data can be reused across components.
 */
export function verifyTokenInheritance(
  input: VerifyTokenInheritanceInput,
): VerifyTokenInheritanceResult {
  const findings: AuditFinding[] = [];

  const cssProps = input.decl.cssProperties ?? [];
  // Normalize DTCG dot-notation token names (`color.primary.400`) to
  // CSS-variable form (`--color-primary-400`). Without this,
  // component cssProperties like `--hx-color-action-primary-bg`
  // never match the parsed token list, and defect class 02 / 03
  // / 14 lookups silently miss every real token. Codex round-31 P1.
  const tokenIndex = new Map<string, DesignToken>();
  for (const t of input.tokens) {
    const cssVar = '--' + t.name.replace(/\./g, '-');
    tokenIndex.set(cssVar, t);
  }

  // ── 01-token-deprecated-alias + 14-cssprop-deprecation-drift ─────────
  // For every CSS prop declared on the component, check whether it
  // resolves to a deprecated alias.
  for (const prop of cssProps) {
    const name = prop.name;
    if (!name.startsWith('--')) continue;
    const canon = resolveCanonicality(name, input.aliases);
    if (canon.canonical) continue;

    findings.push(buildAliasFinding(name, canon));
    findings.push(buildCssPropDeprecationFinding(name, canon, prop.description));
  }

  // ── 02-token-cascade-gap ────────────────────────────────────────────
  // Limit cascade-gap checks to props that are actual THEME tokens —
  // i.e. the design-token list contains a matching entry. Component
  // CSS props for spacing / sizing / animation timing aren't
  // overlay-driven and would produce noise. Codex round-30 P2.
  if (input.overlays) {
    for (const prop of cssProps) {
      const name = prop.name;
      if (!name.startsWith('--')) continue;
      // Only check tokens we recognize as theme-driven (color or
      // surface-tier). The token index keys are `--<name>`; the
      // `category` heuristic catches helix's `color.*`,
      // `surface.*`, `border.*` groups that participate in dark/HC
      // overlays. Spacing / sizing / motion are excluded.
      const token = tokenIndex.get(name);
      if (token === undefined) continue;
      const cat = token.category.toLowerCase();
      const isOverlayDriven =
        cat.startsWith('color') ||
        cat.startsWith('surface') ||
        cat.startsWith('border') ||
        cat.startsWith('shadow') ||
        cat.startsWith('outline');
      if (!isOverlayDriven) continue;

      const missingOverlays: string[] = [];
      if (input.overlays.dark && !input.overlays.dark.has(name)) {
        missingOverlays.push('dark');
      }
      if (input.overlays.highContrast && !input.overlays.highContrast.has(name)) {
        missingOverlays.push('high-contrast');
      }
      for (const overlay of missingOverlays) {
        findings.push({
          severity: overlay === 'high-contrast' ? 'P1' : 'P2',
          classId: '02-token-cascade-gap',
          title: `Token ${name} has no value under ${overlay} overlay`,
          body: [
            `\`${name}\` is referenced by component \`${input.decl.tagName ?? input.decl.name}\` but the ${overlay} theme overlay does not redefine it. The cascade falls through to the default value, which can break WCAG contrast guarantees in the ${overlay} theme.`,
            '',
            `Fix: add an explicit override in the ${overlay} overlay block, OR confirm the default value is intentional for ${overlay} mode and document the decision.`,
          ].join('\n'),
          file: null,
          line: null,
        });
      }
    }
  }

  // ── 03-token-color-literal ──────────────────────────────────────────
  if (input.cssSources && input.cssSources.length > 0) {
    const colorLiteralFindings = scanColorLiterals(
      input.cssSources,
      tokenIndex,
      input.decl.tagName ?? input.decl.name,
    );
    findings.push(...colorLiteralFindings);
  }

  return { findings };
}

// ─── Finding builders ───────────────────────────────────────────────────────

function buildAliasFinding(name: string, canon: CanonicalityResult): AuditFinding {
  const provenance = formatProvenance(canon);
  const replacement = canon.replacedBy ?? '<unknown>';
  return {
    severity: 'P2',
    classId: '01-token-deprecated-alias',
    title: `Use canonical token instead of deprecated alias \`${name}\``,
    body: [
      `\`${name}\` is a deprecated alias${provenance ? ' ' + provenance : ''}.`,
      '',
      `Use the canonical replacement: \`${replacement}\`.`,
      canon.rationale ? '\n' + canon.rationale : '',
      canon.removalScheduledFor
        ? `\nRemoval is scheduled for helix \`${canon.removalScheduledFor}\`.`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    file: null,
    line: null,
  };
}

function buildCssPropDeprecationFinding(
  name: string,
  canon: CanonicalityResult,
  declaredDescription: string | undefined,
): AuditFinding {
  return {
    severity: 'P2',
    classId: '14-cssprop-deprecation-drift',
    title: `\`@cssprop ${name}\` is documented but deprecated`,
    body: [
      `The component declares \`${name}\` as a public CSS property in its CEM, but this token has been deprecated upstream${formatProvenance(canon, ' ')}.`,
      '',
      `The CEM description (\`${(declaredDescription ?? '').trim() || '<empty>'}\`) does not flag deprecation, so consumers reading the docs would believe \`${name}\` is the current API.`,
      '',
      `Fix: either remove the \`@cssprop\` from the component (forcing consumers onto the canonical \`${canon.replacedBy ?? '<unknown>'}\`), or annotate the JSDoc with \`@deprecated\` so the CEM reflects the upstream deprecation.`,
    ].join('\n'),
    file: null,
    line: null,
  };
}

function formatProvenance(canon: CanonicalityResult, prefix = ''): string {
  const parts: string[] = [];
  if (canon.deprecatedSinceVersion !== null) {
    parts.push(`since helix \`${canon.deprecatedSinceVersion}\``);
  }
  if (canon.deprecatedSinceRound !== null) {
    parts.push(`(${canon.deprecatedSinceRound})`);
  }
  if (canon.deprecatedSinceCommit !== null) {
    parts.push(`commit \`${canon.deprecatedSinceCommit.slice(0, 9)}\``);
  }
  if (parts.length === 0) return '';
  return prefix + parts.join(' ');
}

// ─── Color literal scanner ──────────────────────────────────────────────────

const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_PATTERN = /\brgba?\s*\([^)]*\)/g;
const HSL_PATTERN = /\bhsla?\s*\([^)]*\)/g;

function scanColorLiterals(
  cssSources: string[],
  tokenIndex: Map<string, DesignToken>,
  componentName: string,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  // Heuristic only fires when at least ONE color token exists; if the
  // library has no color tokens at all, raw literals are the only
  // option and flagging them is noise.
  const colorTokens = [...tokenIndex.values()].filter((t) => t.category === 'color');
  if (colorTokens.length === 0) return findings;

  for (const css of cssSources) {
    // Strip out tokens defined via `:root { ... }` declarations — those
    // are the source-of-truth literals, not consumer-side usage.
    const consumerCss = stripRootTokenBlocks(css);
    const literals = new Set<string>();
    for (const m of consumerCss.match(HEX_PATTERN) ?? []) literals.add(m);
    for (const m of consumerCss.match(RGB_PATTERN) ?? []) literals.add(m);
    for (const m of consumerCss.match(HSL_PATTERN) ?? []) literals.add(m);

    for (const literal of literals) {
      findings.push({
        severity: 'P2',
        classId: '03-token-color-literal',
        title: `Color literal \`${literal}\` used in \`${componentName}\` CSS`,
        body: [
          `A color literal (\`${literal}\`) appears in the component CSS while design tokens for color exist in the library. Raw literals desync from the palette over time — when helix shifts a primary color in a future release, every other component recolors and this one does not.`,
          '',
          'Fix: replace the literal with the corresponding `--hx-color-*` token. If no token covers this exact role, add one to the design system instead of inlining the literal.',
        ].join('\n'),
        file: null,
        line: null,
      });
    }
  }

  return findings;
}

function stripRootTokenBlocks(css: string): string {
  // Remove `:root { ... }` blocks since those are the canonical token
  // definitions — finding literals inside them is noise.
  return css.replace(/:root\s*\{[^}]*\}/g, '');
}
