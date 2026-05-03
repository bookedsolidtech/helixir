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

  // Build the audit set: declared @cssprops UNION actual var()
  // references in the component's CSS. The CEM @cssprop list is the
  // PUBLIC contract surface — what consumers can override — but
  // subclasses commonly use tokens internally that aren't redeclared
  // as @cssprop. Codex round-34 P1: scanning only @cssprop misses
  // those internal usages, leaving deprecated aliases / cascade gaps
  // silently active in real CSS. Now scan both surfaces and
  // deduplicate by CSS-var name.
  //
  // Each entry tracks whether the var appears as a PRIMARY reference
  // (`var(--x, ...)` first arg) or only as a FALLBACK position
  // (`var(--canonical, var(--alias))`). Aliases used only as
  // migration-support fallbacks are intentional and must not flag
  // 01-token-deprecated-alias. Codex round-44 P2.
  const auditedCssProps = new Map<
    string,
    { description: string | undefined; declared: boolean; primary: boolean }
  >();
  for (const prop of cssProps) {
    if (!prop.name.startsWith('--')) continue;
    auditedCssProps.set(prop.name, {
      description: prop.description,
      declared: true,
      primary: true,
    });
  }
  if (input.cssSources && input.cssSources.length > 0) {
    for (const css of input.cssSources) {
      const refs = scanVarReferences(css);
      for (const [varName, { primary }] of refs) {
        const existing = auditedCssProps.get(varName);
        if (existing === undefined) {
          auditedCssProps.set(varName, {
            description: undefined,
            declared: false,
            primary,
          });
        } else if (primary && !existing.primary) {
          existing.primary = true;
        }
      }
    }
  }

  // ── 01-token-deprecated-alias + 14-cssprop-deprecation-drift ─────────
  for (const [name, { description, declared, primary }] of auditedCssProps) {
    const canon = resolveCanonicality(name, input.aliases);
    if (canon.canonical) continue;
    // Skip aliases that only appear in `var(--canonical, var(--alias))`
    // fallback position — that's the canonical migration pattern,
    // not a deprecated-alias usage. Codex round-44 P2.
    if (!primary) continue;
    findings.push(buildAliasFinding(name, canon));
    // Only emit the cssprop-deprecation finding when the token is
    // actually declared as a public @cssprop (otherwise there's no
    // documentation surface to flag deprecation on).
    if (declared) {
      findings.push(buildCssPropDeprecationFinding(name, canon, description));
    }
  }

  // ── 02-token-cascade-gap ────────────────────────────────────────────
  // Limit cascade-gap checks to props that are actual THEME tokens —
  // i.e. the design-token list contains a matching entry. Component
  // CSS props for spacing / sizing / animation timing aren't
  // overlay-driven and would produce noise. Codex round-30 P2.
  if (input.overlays) {
    for (const [name] of auditedCssProps) {
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

// ─── var() reference scanner ────────────────────────────────────────────────

/**
 * Scan CSS source for `var(--name, fallback)` calls and classify each
 * referenced custom-property name as either PRIMARY (first arg of any
 * var() call) or FALLBACK-ONLY (only ever appears nested inside the
 * fallback portion of another var()).
 *
 * The `var(--canonical, var(--alias))` pattern is the standard
 * migration shape — `--alias` exists only as a safety net while
 * consumers transition. Flagging it as a deprecated-alias usage is
 * a false positive. Codex round-44 P2.
 */
function scanVarReferences(css: string): Map<string, { primary: boolean }> {
  const out = new Map<string, { primary: boolean }>();
  const visit = (text: string, position: 'primary' | 'fallback'): void => {
    let i = 0;
    while (i < text.length) {
      const idx = text.indexOf('var(', i);
      if (idx === -1) break;
      let depth = 1;
      let j = idx + 4;
      while (j < text.length && depth > 0) {
        const ch = text[j];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (depth === 0) break;
        j++;
      }
      const inner = text.slice(idx + 4, j);
      const nameMatch = /^\s*(--[a-zA-Z0-9_-]+)/.exec(inner);
      if (nameMatch && nameMatch[1] !== undefined) {
        const name = nameMatch[1];
        if (position === 'primary') {
          out.set(name, { primary: true });
        } else {
          const existing = out.get(name);
          if (existing === undefined) out.set(name, { primary: false });
        }
        const commaIdx = findTopLevelComma(inner);
        if (commaIdx !== -1) {
          visit(inner.slice(commaIdx + 1), 'fallback');
        }
      }
      i = j + 1;
    }
  };
  visit(css, 'primary');
  return out;
}

function findTopLevelComma(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) return i;
  }
  return -1;
}
