/**
 * Layout Pattern Checker — detects layout anti-patterns when styling web
 * component host elements.
 *
 * Catches:
 * - Display override on host (components manage their own display internally)
 * - Fixed pixel dimensions on host (breaks responsive behavior)
 * - Position absolute/fixed on host (may conflict with component's own positioning)
 * - Overflow: hidden on host (may clip shadow DOM content like popups/tooltips)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LayoutIssue {
  type: 'host-display-override' | 'fixed-dimension' | 'position-override' | 'overflow-clip';
  selector: string;
  property: string;
  value: string;
  severity: 'warning' | 'info';
  message: string;
  line?: number;
}

export interface LayoutCheckResult {
  issues: LayoutIssue[];
  summary: string;
}

// ─── Custom element detection ────────────────────────────────────────────────

const CUSTOM_ELEMENT_HOST_RE = /^([a-z][a-z0-9]*-[a-z0-9-]*)(?:\s*$|(?:\s*\[|\s*\.))/;

function isHostSelector(selector: string): boolean {
  // Check if the selector directly targets a custom element (not ::part or :host)
  if (/::part/i.test(selector)) return false;
  if (/^:host/i.test(selector)) return false;
  return CUSTOM_ELEMENT_HOST_RE.test(selector.trim());
}

// ─── CSS rule parser ─────────────────────────────────────────────────────────

interface CssRule {
  selector: string;
  declarations: Array<{ property: string; value: string }>;
  line: number;
}

function parseCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const pattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(css)) !== null) {
    const selector = (match[1] ?? '').trim();
    const body = (match[2] ?? '').trim();
    const before = css.slice(0, match.index);
    const line = (before.match(/\n/g) ?? []).length + 1;

    const declarations: Array<{ property: string; value: string }> = [];
    const declPattern = /([a-z-]+)\s*:\s*([^;]+)/gi;
    let declMatch: RegExpExecArray | null;
    while ((declMatch = declPattern.exec(body)) !== null) {
      declarations.push({
        property: (declMatch[1] ?? '').trim().toLowerCase(),
        value: (declMatch[2] ?? '').trim(),
      });
    }

    if (selector) {
      rules.push({ selector, declarations, line });
    }
  }

  return rules;
}

// ─── Safe display values ─────────────────────────────────────────────────────

const SAFE_DISPLAY_VALUES = new Set(['none', 'contents', 'inherit', 'initial', 'unset', 'revert']);

// ─── Fixed dimension pattern ─────────────────────────────────────────────────

const FIXED_PIXEL_RE = /^\d+(\.\d+)?px$/;

function isFixedDimension(value: string): boolean {
  // Fixed pixel values are problematic
  if (FIXED_PIXEL_RE.test(value)) return true;
  return false;
}

function isFlexibleValue(value: string): boolean {
  // Percentages, relative units, var(), auto, min/max-content are OK
  return /(%|em|rem|vw|vh|var\(|auto|min-content|max-content|fit-content)/i.test(value);
}

// ─── Checks ──────────────────────────────────────────────────────────────────

function checkHostRules(rules: CssRule[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];

  for (const rule of rules) {
    if (!isHostSelector(rule.selector)) continue;

    for (const decl of rule.declarations) {
      // Skip custom properties
      if (decl.property.startsWith('--')) continue;

      // Display override check
      if (decl.property === 'display' && !SAFE_DISPLAY_VALUES.has(decl.value.toLowerCase())) {
        issues.push({
          type: 'host-display-override',
          selector: rule.selector,
          property: decl.property,
          value: decl.value,
          severity: 'warning',
          message: `Setting display: ${decl.value} on <${rule.selector.split(/[\s.[:#]/)[0]}> overrides the component's internal layout. Web components manage their own display property. Use a wrapper element or custom properties instead.`,
          line: rule.line,
        });
      }

      // Fixed dimension check
      if (
        (decl.property === 'width' || decl.property === 'height') &&
        isFixedDimension(decl.value) &&
        !isFlexibleValue(decl.value)
      ) {
        issues.push({
          type: 'fixed-dimension',
          selector: rule.selector,
          property: decl.property,
          value: decl.value,
          severity: 'warning',
          message: `Fixed ${decl.property}: ${decl.value} on <${rule.selector.split(/[\s.[:#]/)[0]}> — use relative units (%, rem, vw) or CSS custom properties for responsive sizing.`,
          line: rule.line,
        });
      }

      // Position override check
      if (decl.property === 'position' && (decl.value === 'absolute' || decl.value === 'fixed')) {
        issues.push({
          type: 'position-override',
          selector: rule.selector,
          property: decl.property,
          value: decl.value,
          severity: 'warning',
          message: `Setting position: ${decl.value} on <${rule.selector.split(/[\s.[:#]/)[0]}> — components like dialogs, dropdowns, and tooltips manage their own positioning. This may conflict with internal behavior.`,
          line: rule.line,
        });
      }

      // Overflow clip check
      if (decl.property === 'overflow' && decl.value === 'hidden') {
        issues.push({
          type: 'overflow-clip',
          selector: rule.selector,
          property: decl.property,
          value: decl.value,
          severity: 'warning',
          message: `overflow: hidden on <${rule.selector.split(/[\s.[:#]/)[0]}> may clip shadow DOM content that renders outside the host (tooltips, dropdown menus, validation messages).`,
          line: rule.line,
        });
      }
    }
  }

  return issues;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkLayoutPatterns(css: string): LayoutCheckResult {
  const rules = parseCssRules(css);
  const issues = checkHostRules(rules);

  let summary: string;
  if (issues.length === 0) {
    summary = 'No layout issues detected.';
  } else {
    const types = [...new Set(issues.map((i) => i.type))];
    summary = `Found ${issues.length} layout issue${issues.length > 1 ? 's' : ''}: ${types.join(', ')}`;
  }

  return { issues, summary };
}
