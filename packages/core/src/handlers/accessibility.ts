import type { CemDeclaration } from './cem.js';

// ─── Return types ─────────────────────────────────────────────────────────────

export interface AccessibilityDimensionResult {
  passed: boolean;
  points: number;
  maxPoints: number;
  note: string;
}

export interface AccessibilityProfile {
  tagName: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: {
    hasAriaRole: AccessibilityDimensionResult;
    hasAriaAttributes: AccessibilityDimensionResult;
    hasFormAssociation: AccessibilityDimensionResult;
    hasKeyboardEvents: AccessibilityDimensionResult;
    hasFocusMethod: AccessibilityDimensionResult;
    hasDisabled: AccessibilityDimensionResult;
    hasLabelSupport: AccessibilityDimensionResult;
    accessibilityDescription: AccessibilityDimensionResult;
  };
  summary: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function gradeLabel(score: number): string {
  const labels: Record<string, string> = {
    A: 'Excellent',
    B: 'Good',
    C: 'Fair',
    D: 'Poor',
    F: 'Failing',
  };
  return labels[computeGrade(score)] ?? 'Unknown';
}

function dim(
  passed: boolean,
  maxPoints: number,
  passNote: string,
  failNote: string,
): AccessibilityDimensionResult {
  return {
    passed,
    points: passed ? maxPoints : 0,
    maxPoints,
    note: passed ? passNote : failNote,
  };
}

// Tag-name patterns that imply an ARIA role
const ARIA_ROLE_TAG_PATTERNS: RegExp[] = [
  /-button$/i,
  /-(dialog|modal)$/i,
  /-checkbox$/i,
  /-radio$/i,
  /-(switch|toggle)$/i,
  /-(tab|tabpanel)$/i,
  /-(menu|menuitem)$/i,
  /-(alert|toast)$/i,
  /-(combobox|select)$/i,
  /-(slider|range)$/i,
  /-tooltip$/i,
  /-(tree|treeitem)$/i,
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyzes accessibility profile of a single CEM component declaration.
 *
 * Scoring weights (total: 100):
 *   hasDisabled:             25 — most reliable a11y signal in CEM (primary)
 *   hasLabelSupport:         20 — second most reliable (primary)
 *   hasFocusMethod:          20 — broadened to catch setFocus() and focus-related names (primary)
 *   accessibilityDescription:10 — description mentions accessibility terms (primary)
 *   hasFormAssociation:      10 — broadened: name+value+disabled, form field, description (bonus)
 *   hasAriaRole:              5 — bonus: CEM rarely captures; also infers from tag-name
 *   hasAriaAttributes:        5 — bonus: properties named aria-*
 *   hasKeyboardEvents:        5 — bonus: broadened to focus/blur events and key-named events
 */
export function analyzeAccessibility(decl: CemDeclaration): AccessibilityProfile {
  const members = decl.members ?? [];
  const events = decl.events ?? [];
  const slots = decl.slots ?? [];
  const cssProperties = decl.cssProperties ?? [];
  const description = decl.description ?? '';
  const tagName = decl.tagName ?? '';

  // 1. ARIA role: cssProperty named "role", description mentions aria/role, or tag-name inference
  const ariaRoleInCss = cssProperties.some((p) => p.name.toLowerCase().includes('role'));
  const ariaRoleInDesc = /\[role=|\baria-role\b|\brole\s*=\s*["']/i.test(description);
  const ariaRoleFromTagName = ARIA_ROLE_TAG_PATTERNS.some((p) => p.test(tagName));
  const hasAriaRole = ariaRoleInCss || ariaRoleInDesc || ariaRoleFromTagName;

  // 2. aria-* attributes: member names starting with "aria-"
  const ariaMembers = members.filter((m) => m.name.toLowerCase().startsWith('aria-'));
  const hasAriaAttributes = ariaMembers.length > 0;

  // 3. Form association: member named "formAssociated" or "internals", form field,
  //    name+value+disabled triple, or description mentioning form association
  const memberNames = new Set(members.map((m) => m.name));
  const hasNameValueDisabled =
    memberNames.has('name') && memberNames.has('value') && memberNames.has('disabled');
  const hasFormField = memberNames.has('form');
  const hasFormAssociation =
    memberNames.has('formAssociated') ||
    memberNames.has('internals') ||
    /\bformAssociated\b|\bform[-\s]?associat/i.test(description) ||
    hasNameValueDisabled ||
    hasFormField;

  // 4. Keyboard events: keydown/keyup/keypress event names, events containing "key",
  //    focus/blur events (proxy for keyboard handling), or description mentioning keyboard
  const keyboardEventNames = ['keydown', 'keyup', 'keypress'];
  const hasKeyboardEvents =
    events.some((e) => keyboardEventNames.some((k) => e.name.toLowerCase().includes(k))) ||
    events.some((e) => /key/i.test(e.name)) ||
    events.some((e) => /focus|blur/i.test(e.name)) ||
    /\bkeyboard\b|\bkeydown\b|\bkeyup\b|\bkeypress\b/i.test(description);

  // 5. Focus method: method named "focus", "setFocus", or any method with "focus" in name
  const hasFocusMethod = members.some(
    (m) => m.kind === 'method' && m.name.toLowerCase().includes('focus'),
  );

  // 6. Disabled state: field named "disabled"
  const hasDisabled = members.some((m) => m.kind === 'field' && m.name === 'disabled');

  // 7. Label support: slot named "label" or member named "label"
  const hasLabelSupport =
    slots.some((s) => s.name === 'label') || members.some((m) => m.name === 'label');

  // 8. Accessibility description: mentions common a11y terms
  const a11yTerms = /\b(aria|accessible|accessibility|keyboard|focus|screen.?reader|a11y|wcag)\b/i;
  const accessibilityDescription = a11yTerms.test(description);

  // Weights — primary signals first, bonus signals last; total = 100
  const W = {
    hasDisabled: 25,
    hasLabelSupport: 20,
    hasFocusMethod: 20,
    accessibilityDescription: 10,
    hasFormAssociation: 10,
    hasAriaRole: 5,
    hasAriaAttributes: 5,
    hasKeyboardEvents: 5,
  };

  const score =
    (hasAriaRole ? W.hasAriaRole : 0) +
    (hasAriaAttributes ? W.hasAriaAttributes : 0) +
    (hasFormAssociation ? W.hasFormAssociation : 0) +
    (hasKeyboardEvents ? W.hasKeyboardEvents : 0) +
    (hasFocusMethod ? W.hasFocusMethod : 0) +
    (hasDisabled ? W.hasDisabled : 0) +
    (hasLabelSupport ? W.hasLabelSupport : 0) +
    (accessibilityDescription ? W.accessibilityDescription : 0);

  const grade = computeGrade(score);

  const dimensions: AccessibilityProfile['dimensions'] = {
    hasAriaRole: dim(
      hasAriaRole,
      W.hasAriaRole,
      'ARIA role documented or inferred from tag name',
      'No ARIA role documented in CEM',
    ),
    hasAriaAttributes: dim(
      hasAriaAttributes,
      W.hasAriaAttributes,
      `Has ${ariaMembers.length} aria-* attribute(s) documented`,
      'No aria-* attributes documented',
    ),
    hasFormAssociation: dim(
      hasFormAssociation,
      W.hasFormAssociation,
      'Form association detected',
      'No form association detected',
    ),
    hasKeyboardEvents: dim(
      hasKeyboardEvents,
      W.hasKeyboardEvents,
      'Keyboard/focus/blur events documented',
      'No keyboard or focus events documented',
    ),
    hasFocusMethod: dim(
      hasFocusMethod,
      W.hasFocusMethod,
      'Exposes focus-related method',
      'No focus method documented',
    ),
    hasDisabled: dim(hasDisabled, W.hasDisabled, 'Has disabled property', 'No disabled property'),
    hasLabelSupport: dim(
      hasLabelSupport,
      W.hasLabelSupport,
      'Has label slot or label property',
      'No label slot or label property',
    ),
    accessibilityDescription: dim(
      accessibilityDescription,
      W.accessibilityDescription,
      'Description mentions accessibility',
      'Description does not mention accessibility — consider adding aria-label guidance',
    ),
  };

  return {
    tagName: decl.tagName ?? decl.name,
    score,
    grade,
    dimensions,
    summary: `${score}/100 (${gradeLabel(score)})`,
  };
}

/**
 * Analyzes accessibility for all components in a list of CEM declarations.
 * Skips declarations without a tagName.
 */
export function analyzeAllAccessibility(decls: CemDeclaration[]): AccessibilityProfile[] {
  return decls.filter((d) => d.tagName !== undefined).map((d) => analyzeAccessibility(d));
}
