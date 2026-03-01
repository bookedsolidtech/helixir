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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyzes accessibility profile of a single CEM component declaration.
 *
 * Scoring weights (total: 100):
 *   hasAriaRole:             20 — ARIA role in cssProperties or description
 *   hasAriaAttributes:       15 — properties named aria-*
 *   hasFormAssociation:      10 — formAssociated field or internals property
 *   hasKeyboardEvents:       10 — keydown/keyup/keypress events listed
 *   hasFocusMethod:          15 — exposes focus() method
 *   hasDisabled:             15 — has disabled property
 *   hasLabelSupport:         10 — slot named "label" or property named "label"
 *   accessibilityDescription: 5 — description mentions accessibility terms
 */
export function analyzeAccessibility(decl: CemDeclaration): AccessibilityProfile {
  const members = decl.members ?? [];
  const events = decl.events ?? [];
  const slots = decl.slots ?? [];
  const cssProperties = decl.cssProperties ?? [];
  const description = decl.description ?? '';

  // 1. ARIA role: cssProperty named "role" or description mentions aria/role context
  const ariaRoleInCss = cssProperties.some((p) => p.name.toLowerCase().includes('role'));
  const ariaRoleInDesc = /\[role=|\baria-role\b|\brole\s*=\s*["']/i.test(description);
  const hasAriaRole = ariaRoleInCss || ariaRoleInDesc;

  // 2. aria-* attributes: member names starting with "aria-"
  const ariaMembers = members.filter((m) => m.name.toLowerCase().startsWith('aria-'));
  const hasAriaAttributes = ariaMembers.length > 0;

  // 3. Form association: member named "formAssociated" or "internals"
  const hasFormAssociation =
    members.some((m) => m.name === 'formAssociated') ||
    members.some((m) => m.name === 'internals') ||
    /\bformAssociated\b/i.test(description);

  // 4. Keyboard events: keydown, keyup, or keypress event names
  const keyboardEventNames = ['keydown', 'keyup', 'keypress'];
  const hasKeyboardEvents = events.some((e) =>
    keyboardEventNames.some((k) => e.name.toLowerCase().includes(k)),
  );

  // 5. Focus method: method named "focus"
  const hasFocusMethod = members.some((m) => m.kind === 'method' && m.name === 'focus');

  // 6. Disabled state: field named "disabled"
  const hasDisabled = members.some((m) => m.kind === 'field' && m.name === 'disabled');

  // 7. Label support: slot named "label" or member named "label"
  const hasLabelSupport =
    slots.some((s) => s.name === 'label') || members.some((m) => m.name === 'label');

  // 8. Accessibility description: mentions common a11y terms
  const a11yTerms = /\b(aria|accessible|accessibility|keyboard|focus|screen.?reader|a11y|wcag)\b/i;
  const accessibilityDescription = a11yTerms.test(description);

  // Weights
  const W = {
    hasAriaRole: 20,
    hasAriaAttributes: 15,
    hasFormAssociation: 10,
    hasKeyboardEvents: 10,
    hasFocusMethod: 15,
    hasDisabled: 15,
    hasLabelSupport: 10,
    accessibilityDescription: 5,
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
      'ARIA role documented in CEM',
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
      'Keyboard events (keydown/keyup/keypress) documented',
      'No keyboard events (keydown/keyup/keypress) documented',
    ),
    hasFocusMethod: dim(
      hasFocusMethod,
      W.hasFocusMethod,
      'Exposes focus() method',
      'No focus() method documented',
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
