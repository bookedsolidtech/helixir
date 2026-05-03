/**
 * Component-extension contract verification (M5)
 *
 * Compares a subclass's contract surface against its declared parent
 * and emits findings for the contract-preservation defect classes:
 *
 *   - 05-aria-regression           → subclass drops parent's role / aria-*
 *   - 06-forced-colors-missing     → subclass overrides parent CSS
 *                                    without re-declaring forced-colors block
 *   - 07-touch-target-undersized   → subclass shrinks parent's interactive
 *                                    touch target below 44 px
 *   - 08-accessible-label-pattern  → subclass re-implements label resolution
 *                                    without preserving devWarn semantics
 *   - 09-slot-contract-drift       → subclass renames or removes parent slot
 *   - 10-element-internals-dropped → subclass loses formAssociated
 *   - 11-event-contract-suppressed → subclass swallows parent's events
 *
 * Inputs are the parent and subclass declarations + (optionally) the
 * subclass source text for AST-light heuristics. Pure function.
 */

import type { CemDeclaration } from './cem.js';
import type { AuditFinding } from './audit-cache.js';
import { extractContractSurface } from './contract-surface.js';
import type { ContractSurface } from './contract-surface.js';

// ─── Public types ───────────────────────────────────────────────────────────

export interface VerifyExtensionInput {
  /** The parent component being extended (resolved from the CEM). */
  parent: CemDeclaration;
  /** The extending subclass declaration. */
  subclass: CemDeclaration;
  /**
   * Optional subclass source text. When supplied, the forced-colors,
   * accessible-label, and event-suppression checks deepen — they
   * grep the source for known patterns rather than relying on CEM
   * surface alone (CEM doesn't carry CSS-rule contents or method bodies).
   */
  subclassSources?: {
    /** Component .ts/.js source. */
    code?: string;
    /** Component .css / styles.ts source. */
    styles?: string;
  };
}

export interface VerifyExtensionResult {
  findings: AuditFinding[];
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function verifyExtension(input: VerifyExtensionInput): VerifyExtensionResult {
  const parentSurface = extractContractSurface(input.parent);
  const subclassSurface = extractContractSurface(input.subclass);
  const findings: AuditFinding[] = [];

  findings.push(...checkSlotContract(parentSurface, subclassSurface));
  findings.push(...checkAriaWiring(parentSurface, subclassSurface));
  findings.push(...checkFormAssociation(parentSurface, subclassSurface));
  findings.push(...checkEventContract(parentSurface, subclassSurface, input.subclassSources));
  findings.push(...checkAccessibleLabelPattern(parentSurface, input.subclassSources));
  findings.push(...checkForcedColors(parentSurface, input.subclassSources));
  findings.push(...checkTouchTarget(parentSurface, input.subclassSources));

  return { findings };
}

// ─── 09-slot-contract-drift ────────────────────────────────────────────────

function checkSlotContract(parent: ContractSurface, subclass: ContractSurface): AuditFinding[] {
  if (parent.slots.length === 0) return [];
  // CEM tools commonly emit only the subclass DELTA — when the subclass
  // declares zero slots of its own, treat as "inherits everything"
  // rather than "drops everything." Without this guard, every
  // delta-only CEM triggers bogus P1s. Codex round-26 (M3-M6 local
  // preview) P1: preserve absent-vs-inherited.
  if (subclass.slots.length === 0) return [];
  const subclassSlotNames = new Set(subclass.slots.map((s) => s.name));
  const missing: string[] = [];
  for (const slot of parent.slots) {
    if (!subclassSlotNames.has(slot.name)) missing.push(slot.name || '(default)');
  }
  if (missing.length === 0) return [];
  return [
    {
      severity: 'P1',
      classId: '09-slot-contract-drift',
      title: `Subclass drops parent slot${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      body: [
        `Parent \`${parent.tagName}\` declares slot${missing.length > 1 ? 's' : ''} \`${missing.join('`, `')}\` in its CEM. Subclass \`${subclass.tagName}\` shadow template omits ${missing.length > 1 ? 'them' : 'it'}.`,
        '',
        `Every consumer that wrote markup against the parent — \`<${parent.tagName}><svg slot="${missing[0]}"/></${parent.tagName}>\` — will render empty under the subclass. No build error, no test failure, silent breakage.`,
        '',
        `Fix: re-declare the missing slot${missing.length > 1 ? 's' : ''} in the subclass shadow template, OR document the intentional removal with an \`@override-slot\` JSDoc tag (acknowledges the breaking change).`,
      ].join('\n'),
      file: null,
      line: null,
    },
  ];
}

// ─── 05-aria-regression ────────────────────────────────────────────────────

function checkAriaWiring(parent: ContractSurface, subclass: ContractSurface): AuditFinding[] {
  const parentAriaAttrs = parent.attributes.filter(
    (a) => a.name === 'role' || a.name.startsWith('aria-'),
  );
  if (parentAriaAttrs.length === 0) return [];
  const subclassAriaAttrs = subclass.attributes.filter(
    (a) => a.name === 'role' || a.name.startsWith('aria-'),
  );
  // Delta-only CEM: subclass declares no ARIA attrs of its own → assume
  // it inherits the parent's. Codex round-26 (M3-M6 local preview) P1.
  if (subclassAriaAttrs.length === 0) return [];
  const subclassAriaNames = new Set(subclassAriaAttrs.map((a) => a.name));
  const missing = parentAriaAttrs.filter((a) => !subclassAriaNames.has(a.name));
  if (missing.length === 0) return [];
  // Round-27 P2 vs round-36 P2 codex flip on partial ARIA deltas.
  // Compromise: ALWAYS report the missing attrs, but downgrade severity
  // when the subclass clearly looks like it's extending (declared
  // < half of parent's ARIA — likely added one new attr while
  // inheriting the rest) rather than redeclaring (declared ≥ half —
  // looks intentional and the gap is a real drop). This preserves
  // round-36's "report partial redeclarations" while honoring round-27's
  // "don't false-P1 on extension". Severity ladder: P1 when subclass
  // appears to redeclare ≥ half, P2 (advisory) when it looks like
  // pure extension. Pinned per runbook §6 step 3.
  const declaredFromParent = parentAriaAttrs.filter((a) => subclassAriaNames.has(a.name)).length;
  const looksLikeRedeclaration = declaredFromParent >= parentAriaAttrs.length / 2;
  const severity: 'P1' | 'P2' = looksLikeRedeclaration ? 'P1' : 'P2';
  return [
    {
      severity,
      classId: '05-aria-regression',
      title: `Subclass drops parent ARIA wiring: ${missing.map((a) => a.name).join(', ')}`,
      body: [
        `Parent \`${parent.tagName}\` declares ARIA attributes ${missing.map((a) => '`' + a.name + '`').join(', ')} in its CEM. Subclass \`${subclass.tagName}\` does not redeclare them.`,
        '',
        `Helix has shipped per-component a11y audits (commits 5f6f3da5c on hx-date-picker role=gridcell, 3953a8348 on hx-select aria-selected) precisely because these regressions are silent — AT renders an inconsistent state and visual smoke tests pass.`,
        '',
        `Fix: redeclare the ARIA attributes on the subclass with the same semantics, OR explicitly document the intentional change with \`@override-aria\` and a rationale (the consumer's a11y contract changed).`,
      ].join('\n'),
      file: null,
      line: null,
    },
  ];
}

// ─── 10-element-internals-dropped ──────────────────────────────────────────

function checkFormAssociation(parent: ContractSurface, subclass: ContractSurface): AuditFinding[] {
  if (parent.formAssociated !== true) return [];
  // Codex round-28 P1: in custom elements, `constructor.formAssociated`
  // is read via normal prototype lookup, so subclasses INHERIT the
  // parent's static flag. A delta-only CEM that omits the field is
  // still form-associated at runtime. Only flag when the subclass
  // explicitly OPTS OUT (formAssociated: false) — that's a real
  // intentional drop. Null / undefined = inheriting, no finding.
  if (subclass.formAssociated !== false) return [];
  return [
    {
      severity: 'P1',
      classId: '10-element-internals-dropped',
      title: `Subclass loses form-association inherited from \`${parent.tagName}\``,
      body: [
        `Parent \`${parent.tagName}\` declares \`static formAssociated = true\` (visible in CEM). Subclass \`${subclass.tagName}\` does not.`,
        '',
        `Lit / Custom Elements behavior: the subclass loses form-association inherited from the parent (some browsers traverse, but the spec doesn't guarantee inheritance of \`formAssociated\`). The subclass renders fine, but \`<form>\` submissions silently drop its value from FormData.`,
        '',
        `Pattern enforced by helix's FS-021 form integration tests (commit 024825264).`,
        '',
        `Fix: re-declare \`static formAssociated = true\` on the subclass. If the subclass legitimately wants to opt out of form participation, document with \`@form-associated false\` JSDoc.`,
      ].join('\n'),
      file: null,
      line: null,
    },
  ];
}

// ─── 11-event-contract-suppressed ──────────────────────────────────────────

function checkEventContract(
  parent: ContractSurface,
  subclass: ContractSurface,
  sources: VerifyExtensionInput['subclassSources'],
): AuditFinding[] {
  if (parent.events.length === 0) return [];
  // Delta-only CEM: subclass declares no events of its own → assume
  // it inherits the parent's surface. Don't flag P2 noise just for
  // CEM emission style. The source-level escalation check still
  // runs against the missing events when source is supplied.
  // Codex round-26 (M3-M6 local preview) P1.
  const subclassEventNames = new Set(subclass.events.map((e) => e.name));
  const missing = parent.events.filter((e) => !subclassEventNames.has(e.name));
  if (subclass.events.length === 0 && sources?.code === undefined) return [];

  // CEM-level finding: subclass CEM has its OWN events but doesn't
  // redeclare a parent event. Always P2 — could be intentional override.
  const findings: AuditFinding[] = (subclass.events.length === 0 ? [] : missing).map((e) => ({
    severity: 'P2',
    classId: '11-event-contract-suppressed',
    title: `Subclass does not redeclare parent event \`${e.name}\``,
    body: [
      `Parent \`${parent.tagName}\` declares custom event \`${e.name}\` (\`${e.type ?? 'CustomEvent'}\`). Subclass \`${subclass.tagName}\` CEM does not list it.`,
      '',
      `If the subclass overrides the dispatch site without calling \`super\` or re-dispatching, consumers listening for \`${e.name}\` on the subclass receive nothing. Existing apps silently lose state-sync.`,
      '',
      `Fix: re-document the inherited event with \`@fires ${e.name}\` JSDoc on the subclass, OR if the override intentionally suppresses the event, document with \`@suppresses-event ${e.name}\` and a migration path for consumers.`,
    ].join('\n'),
    file: null,
    line: null,
  }));

  // Source-level deepening: escalate to P1 ONLY when the subclass
  // overrides a method that LOOKS like a dispatch path AND has no
  // super call / dispatchEvent in the override. Pure render() /
  // firstUpdated() / styles() overrides don't touch event dispatch
  // and shouldn't escalate. Codex round-27 P2 + round-28 P1.
  if (sources?.code !== undefined && missing.length > 0) {
    const code = sources.code;
    // Heuristic for "this method might be the dispatch path." `handle*`
    // alone is too broad — `handleFocus`, `handleBlur`, `handleClick`
    // are common helpers that don't touch event dispatch. Tighten to:
    //   - method name LITERALLY mentions one of the parent's event
    //     names (e.g. `handleChange` when parent fires `hx-change` /
    //     `change`), OR
    //   - explicit dispatch-verb prefix on a private helper
    //     (`_emit*`, `_dispatch*`, `_fire*`), OR
    //   - reactive setter (`set value()`, `set checked()`, etc.) that
    //     the parent typically emits from.
    // Codex round-31 P2.
    const eventVocab = missing
      .map((e) => e.name.replace(/^[a-z]+-/, '').replace(/-/g, ''))
      .filter((s) => s.length >= 3)
      .map((s) => s.toLowerCase());
    const methodMatchesEvent = (() => {
      if (eventVocab.length === 0) return false;
      const methodNames = [...code.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*\{/g)].map((m) =>
        (m[1] ?? '').toLowerCase(),
      );
      return methodNames.some((mn) => eventVocab.some((v) => mn.includes(v)));
    })();
    const overridesDispatchSite =
      methodMatchesEvent ||
      /\b_(emit|dispatch|fire)[A-Z]?[\w$]*\s*\([^)]*\)\s*\{/.test(code) ||
      /\bset\s+(value|checked|selected|expanded|open|disabled)\s*\([^)]*\)\s*\{/.test(code);
    const hasSuperCall = /\bsuper\s*\.\s*[a-zA-Z_$][\w$]*\s*\(/.test(code);
    const dispatchesEvent = /\bdispatchEvent\s*\(/.test(code);
    if (overridesDispatchSite && !hasSuperCall && !dispatchesEvent) {
      findings.push({
        severity: 'P1',
        classId: '11-event-contract-suppressed',
        title: `Subclass overrides method without super-call or dispatchEvent`,
        body: [
          `Subclass \`${subclass.tagName}\` source overrides a method (shadowing the parent's dispatch path) but contains no \`super.foo()\` calls and no \`dispatchEvent\`. Combined with missing event redeclaration in the CEM, this is the suppression pattern: subclass inherits the parent's reactive surface but silently never re-emits the events consumers depend on.`,
          '',
          "Fix: in any subclass override that runs in the parent's dispatch path, either call `super.<method>(...)` to delegate, OR re-dispatch the event explicitly with `this.dispatchEvent(new CustomEvent('<event-name>', { detail }))`.",
        ].join('\n'),
        file: null,
        line: null,
      });
    }
  }

  return findings;
}

// ─── 08-accessible-label-pattern ───────────────────────────────────────────

function checkAccessibleLabelPattern(
  parent: ContractSurface,
  sources: VerifyExtensionInput['subclassSources'],
): AuditFinding[] {
  // Heuristic: parent uses the helix accessible-label pattern when its
  // members include `_effectiveLabel` (the helper) or `accessibleLabel`
  // (the public surface). Both are conventions per commits f875573dc /
  // 735eb0650 / 22da14f37.
  const parentHasPattern =
    parent.members.some((m) => m.name === 'accessibleLabel') ||
    parent.attributes.some((a) => a.name === 'accessible-label');
  if (!parentHasPattern) return [];
  if (sources?.code === undefined) return [];

  const code = sources.code;
  // Subclass OVERRIDES _effectiveLabel? Match only definition forms
  // (method, getter, setter, arrow assignment), not bare references
  // like `super._effectiveLabel` or `this._effectiveLabel` reads.
  // Codex round-34 P2.
  const overridesEffectiveLabel =
    /(^|[\n;{}])\s*_effectiveLabel\s*\([^)]*\)\s*\{/.test(code) ||
    /(^|[\n;{}])\s*get\s+_effectiveLabel\s*\([^)]*\)\s*\{/.test(code) ||
    /(^|[\n;{}])\s*set\s+_effectiveLabel\s*\([^)]*\)\s*\{/.test(code) ||
    /(^|[\n;{}])\s*_effectiveLabel\s*=\s*\(?[^)]*\)?\s*=>/.test(code);
  if (!overridesEffectiveLabel) return [];

  const hasTrim = /\.\s*trim\s*\(\)/.test(code);
  const hasDevWarn = /\bdevWarn\b|\bconsole\.warn\b/.test(code);
  const missing: string[] = [];
  if (!hasTrim) missing.push('whitespace trim on the label string');
  if (!hasDevWarn) missing.push('one-shot devWarn for missing accessible name');
  if (missing.length === 0) return [];
  return [
    {
      severity: 'P2',
      classId: '08-accessible-label-pattern',
      title: 'Subclass overrides _effectiveLabel without preserving devWarn pattern',
      body: [
        `Parent \`${parent.tagName}\` uses the helix accessible-label devWarn pattern (commits f875573dc, 735eb0650, 22da14f37): trim whitespace-only labels and emit a one-shot dev warning when no accessible name resolves.`,
        '',
        `Subclass overrides \`_effectiveLabel\` but is missing: ${missing.join(', ')}.`,
        '',
        `Fix: in the override, \`return (this.accessibleLabel ?? '').trim() || super._effectiveLabel?.()\` and call \`super.warnIfMissingLabel?.()\` (or equivalent) on \`firstUpdated\`. Without this, \`accessible-label="   "\` (whitespace) silently passes the truthy check and AT announces no name.`,
      ].join('\n'),
      file: null,
      line: null,
    },
  ];
}

// ─── 06-forced-colors-missing ──────────────────────────────────────────────

function checkForcedColors(
  parent: ContractSurface,
  sources: VerifyExtensionInput['subclassSources'],
): AuditFinding[] {
  // Heuristic: assume parent has forced-colors compliance when it has
  // any CSS-prop on its surface AND we have subclass styles to inspect.
  // This is intentionally inclusive — most helix interactive components
  // declare forced-colors blocks per commits d95f193a8, c474abc64.
  if (parent.cssProperties.length === 0) return [];
  if (sources?.styles === undefined) return [];

  const styles = sources.styles;
  // Subclass overrides paint properties? (color, background, border-color, outline-color)
  // Codex round-27 P3: include border-color and outline-color
  // explicitly. The shorthand-only check missed subclasses that
  // override only the color component of border / outline.
  const overridesPaint =
    /\b(color|background|background-color|border|border-color|outline|outline-color)\s*:/.test(
      styles,
    );
  if (!overridesPaint) return [];

  const hasForcedColorsBlock = /@media\s*\(\s*forced-colors\s*:\s*active\s*\)/.test(styles);
  if (hasForcedColorsBlock) return [];

  return [
    {
      severity: 'P1',
      classId: '06-forced-colors-missing',
      title: `Subclass overrides paint properties without forced-colors block`,
      body: [
        `Parent \`${parent.tagName}\` declares CSS custom properties (CSS surface) and helix's a11y sweep (commits d95f193a8, c474abc64) added \`@media (forced-colors: active)\` blocks across interactive components.`,
        '',
        `Subclass overrides paint properties (\`color\`, \`background\`, \`border\`, \`outline\`) but does NOT include a \`@media (forced-colors: active)\` block. When the user enables Windows High Contrast Mode, the browser strips the subclass's gradients/colors and the parent's forced-colors fallback no longer applies (cascade specificity).`,
        '',
        `Fix: add a \`@media (forced-colors: active)\` block to the subclass styles that re-establishes \`Highlight\` / \`HighlightText\` / \`ButtonBorder\` system-color fallbacks for any selector the subclass overrides.`,
      ].join('\n'),
      file: null,
      line: null,
    },
  ];
}

// ─── 07-touch-target-undersized ────────────────────────────────────────────

function checkTouchTarget(
  parent: ContractSurface,
  sources: VerifyExtensionInput['subclassSources'],
): AuditFinding[] {
  // Helix enforces a 44px touch-target floor on interactive components
  // via --hx-touch-target-min (commit acc56e6a7). Heuristic: parse
  // style rule blocks, identify ones whose selector targets an
  // interactive element (button / link / role-button / [tabindex] /
  // input / :host of an interactive component), and only flag
  // undersized size rules inside those blocks. Decorative descendants
  // like .icon { width: 1rem } are correctly excluded. Codex round-34 P2.
  if (sources?.styles === undefined) return [];
  const styles = sources.styles;

  // Match selector-block pairs `selector { body }` (no nesting). The
  // body capture is the content between { and the next }.
  const RULE_PATTERN = /([^{}]+)\{([^{}]*)\}/g;
  const INTERACTIVE_SELECTOR =
    /(?:^|[\s,>+~])(button|a|input|select|textarea|summary|label|\[role\s*=\s*["']?(button|link|menuitem|tab|option|switch|checkbox|radio)["']?\]|\[tabindex(?:=|\])|:host\b)/i;
  const SIZE_RULE = /\b(min-width|min-height|width|height)\s*:\s*([\d.]+)(px|rem)\b/g;

  const undersized: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = RULE_PATTERN.exec(styles)) !== null) {
    const selector = m[1] ?? '';
    const body = m[2] ?? '';
    if (!INTERACTIVE_SELECTOR.test(selector)) continue;
    let s: RegExpExecArray | null;
    while ((s = SIZE_RULE.exec(body)) !== null) {
      const value = parseFloat(s[2] ?? '0');
      const unit = s[3] ?? 'px';
      const px = unit === 'rem' ? value * 16 : value;
      if (px > 0 && px < 44) {
        undersized.push(`${selector.trim()} { ${s[1]}: ${value}${unit} }`);
      }
    }
  }
  if (undersized.length === 0) return [];

  return [
    {
      severity: 'P1',
      classId: '07-touch-target-undersized',
      title: `Subclass shrinks touch target below 44 px`,
      body: [
        `Parent \`${parent.tagName}\` likely guarantees a 44 px touch target via \`--hx-touch-target-min\` (commit acc56e6a7). Subclass styles include sub-44 px size rules: ${undersized.join('; ')}.`,
        '',
        `WCAG 2.5.8 (Level AA) requires interactive targets to be at least 44×44 px. Shrinking with \`width: 1.5rem\` or similar overrides the parent's min-size guarantee and fails the audit.`,
        '',
        `Fix: keep the visual element at any size you like, but expand the click/touch surface to 44 px via padding or an absolutely-positioned ::before pseudo-element. Or use \`min-width: var(--hx-touch-target-min, 2.75rem)\` to inherit the parent's floor.`,
      ].join('\n'),
      file: null,
      line: null,
    },
  ];
}
