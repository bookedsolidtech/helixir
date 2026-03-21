/**
 * CSS Specificity Checker — detects CSS specificity anti-patterns that cause
 * styling issues with web components.
 *
 * Catches:
 * - !important usage (nuclear option that prevents overrides)
 * - ID selectors targeting components (too specific, hard to override)
 * - Deeply nested selectors (4+ levels, brittle and over-qualified)
 * - Inline style attributes on web components (highest specificity, unmaintainable)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SpecificityIssue {
  type: 'important' | 'id-selector' | 'deep-nesting' | 'inline-style';
  selector: string;
  severity: 'error' | 'warning';
  message: string;
  line?: number;
}

export interface SpecificityCheckResult {
  issues: SpecificityIssue[];
  summary: string;
}

export interface SpecificityCheckOptions {
  /** Set to 'html' to detect inline style attributes on web components */
  mode?: 'css' | 'html';
}

// ─── Custom element tag pattern ──────────────────────────────────────────────

const CUSTOM_ELEMENT_RE = /[a-z][a-z0-9]*-[a-z0-9-]*/;

// ─── CSS rule parser (simple block-level) ────────────────────────────────────

interface CssRule {
  selector: string;
  body: string;
  line: number;
}

function parseCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  // Match selector { body } patterns
  const pattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(css)) !== null) {
    const selector = (match[1] ?? '').trim();
    const body = (match[2] ?? '').trim();
    // Approximate line number
    const before = css.slice(0, match.index);
    const line = (before.match(/\n/g) ?? []).length + 1;

    if (selector) {
      rules.push({ selector, body, line });
    }
  }

  return rules;
}

// ─── !important detector ─────────────────────────────────────────────────────

function checkImportant(rules: CssRule[]): SpecificityIssue[] {
  const issues: SpecificityIssue[] = [];

  for (const rule of rules) {
    if (/!important/i.test(rule.body)) {
      issues.push({
        type: 'important',
        selector: rule.selector,
        severity: 'error',
        message: `!important in "${rule.selector}" — prevents all future overrides and breaks component theming. Use more specific selectors or CSS custom properties instead.`,
        line: rule.line,
      });
    }
  }

  return issues;
}

// ─── ID selector detector ────────────────────────────────────────────────────

function checkIdSelectors(rules: CssRule[]): SpecificityIssue[] {
  const issues: SpecificityIssue[] = [];

  for (const rule of rules) {
    // Check if selector contains #id and targets a custom element
    if (/#[a-z][a-z0-9_-]*/i.test(rule.selector) && CUSTOM_ELEMENT_RE.test(rule.selector)) {
      issues.push({
        type: 'id-selector',
        selector: rule.selector,
        severity: 'warning',
        message: `ID selector in "${rule.selector}" — ID selectors have very high specificity (0,1,0,0) making them hard to override. Use class selectors or custom properties instead.`,
        line: rule.line,
      });
    }
  }

  return issues;
}

// ─── Deep nesting detector ───────────────────────────────────────────────────

function checkDeepNesting(rules: CssRule[]): SpecificityIssue[] {
  const issues: SpecificityIssue[] = [];

  for (const rule of rules) {
    // Split selector by combinators (space, >, +, ~) and count segments
    const segments = rule.selector.split(/\s*[>+~]\s*|\s+/).filter((s) => s.length > 0);

    if (segments.length >= 4 && CUSTOM_ELEMENT_RE.test(rule.selector)) {
      issues.push({
        type: 'deep-nesting',
        selector: rule.selector,
        severity: 'warning',
        message: `Deeply nested selector "${rule.selector}" (${segments.length} levels) — overly specific selectors are brittle and break when DOM structure changes. Prefer flat selectors or custom properties.`,
        line: rule.line,
      });
    }
  }

  return issues;
}

// ─── Inline style detector (HTML mode) ──────────────────────────────────────

function checkInlineStyles(html: string): SpecificityIssue[] {
  const issues: SpecificityIssue[] = [];
  const pattern = /<([a-z][a-z0-9]*-[a-z0-9-]*)[^>]*\sstyle\s*=\s*["'][^"']*["']/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const tagName = match[1] ?? 'unknown-element';
    const before = html.slice(0, match.index);
    const line = (before.match(/\n/g) ?? []).length + 1;

    issues.push({
      type: 'inline-style',
      selector: `<${tagName} style="...">`,
      severity: 'warning',
      message: `Inline style on <${tagName}> — inline styles have the highest specificity and cannot be overridden by external CSS. Use CSS custom properties or classes instead.`,
      line,
    });
  }

  return issues;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkCssSpecificity(
  code: string,
  options?: SpecificityCheckOptions,
): SpecificityCheckResult {
  const mode = options?.mode ?? 'css';
  const issues: SpecificityIssue[] = [];

  if (mode === 'html') {
    issues.push(...checkInlineStyles(code));
  } else {
    const rules = parseCssRules(code);
    issues.push(...checkImportant(rules));
    issues.push(...checkIdSelectors(rules));
    issues.push(...checkDeepNesting(rules));
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  let summary: string;
  if (issues.length === 0) {
    summary = 'No specificity issues detected.';
  } else {
    const parts: string[] = [];
    if (errorCount > 0) parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
    if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    summary = `Found ${parts.join(' and ')}: ${issues.map((i) => i.type).join(', ')}`;
  }

  return { issues, summary };
}
