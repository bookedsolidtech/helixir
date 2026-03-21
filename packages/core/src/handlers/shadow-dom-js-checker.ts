/**
 * Shadow DOM JS Checker — detects JavaScript anti-patterns that violate
 * Shadow DOM encapsulation from consumer code.
 *
 * Catches:
 * 1. shadowRoot.querySelector/querySelectorAll/getElementById — bypasses encapsulation
 * 2. shadowRoot.innerHTML — directly manipulating shadow internals
 * 3. attachShadow() — consumers should never create shadow roots on existing components
 * 4. innerHTML on web components — overwrites slotted content instead of using slots
 * 5. style.cssText on component host — prefer CSS custom properties
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShadowDomJsIssue {
  rule:
    | 'no-shadow-root-access'
    | 'no-attach-shadow'
    | 'no-inner-html-component'
    | 'prefer-css-properties';
  line: number;
  message: string;
  suggestion: string;
  code: string;
}

export interface ShadowDomJsResult {
  issues: ShadowDomJsIssue[];
  clean: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isCustomElementTag(str: string): boolean {
  // Custom element tags contain a hyphen
  return /[a-z][a-z0-9]*-[a-z0-9-]*/i.test(str);
}

// ─── Pattern Detectors ───────────────────────────────────────────────────────

function checkShadowRootAccess(lines: string[]): ShadowDomJsIssue[] {
  const issues: ShadowDomJsIssue[] = [];
  // Matches .shadowRoot.querySelector, .shadowRoot.querySelectorAll,
  // .shadowRoot.getElementById, .shadowRoot.innerHTML, .shadowRoot.children, etc.
  const pattern =
    /\.shadowRoot\.(querySelector|querySelectorAll|getElementById|innerHTML|children|firstChild|lastChild|append|prepend|insertBefore|removeChild|replaceChild)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      const method = match[1] ?? '';
      issues.push({
        line: i + 1,
        rule: 'no-shadow-root-access',
        message: `Accessing .shadowRoot.${method}() bypasses Shadow DOM encapsulation. Component internals are private and may change without notice.`,
        suggestion:
          "Use the component's public API (properties, methods, events, slots, CSS parts) instead of reaching into its shadow root.",
        code: line.trim(),
      });
    }
  }

  return issues;
}

function checkAttachShadow(lines: string[]): ShadowDomJsIssue[] {
  const issues: ShadowDomJsIssue[] = [];
  const pattern = /\.attachShadow\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      issues.push({
        line: i + 1,
        rule: 'no-attach-shadow',
        message:
          'Calling attachShadow() on an existing web component will throw an error — the component already has a shadow root.',
        suggestion:
          "Web components manage their own shadow roots. Use the component's public API instead.",
        code: line.trim(),
      });
    }
  }

  return issues;
}

function checkInnerHtmlOnComponent(lines: string[]): ShadowDomJsIssue[] {
  const issues: ShadowDomJsIssue[] = [];
  // Detect patterns like querySelector('sl-button').innerHTML = or
  // variable assignments after selecting a custom element
  const pattern = /querySelector(?:All)?\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.innerHTML\s*=/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      const selector = match[1] ?? '';
      if (isCustomElementTag(selector)) {
        issues.push({
          line: i + 1,
          rule: 'no-inner-html-component',
          message: `Setting innerHTML on <${selector}> overwrites slotted content. The component's shadow DOM manages its own internal structure.`,
          suggestion:
            "Use slot content by placing child elements inside the component tag, or use the component's properties/methods to update content.",
          code: line.trim(),
        });
      }
    }
  }

  return issues;
}

function checkStyleCssText(lines: string[], tagName?: string): ShadowDomJsIssue[] {
  const issues: ShadowDomJsIssue[] = [];
  // Detect .style.cssText = or .style.property = on component elements
  const pattern = /\.style\.cssText\s*=/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      // Only flag if we know the context is a web component
      if (tagName && isCustomElementTag(tagName)) {
        issues.push({
          line: i + 1,
          rule: 'prefer-css-properties',
          message:
            'Setting style.cssText on a web component host only affects the host box, not shadow internals. Most visual changes require CSS custom properties.',
          suggestion:
            "Use CSS custom properties: element.style.setProperty('--component-color', 'red') to pass values into the shadow DOM.",
          code: line.trim(),
        });
      }
    }
  }

  return issues;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export function checkShadowDomJs(code: string, tagName?: string): ShadowDomJsResult {
  const lines = code.split('\n');
  const issues: ShadowDomJsIssue[] = [];

  issues.push(...checkShadowRootAccess(lines));
  issues.push(...checkAttachShadow(lines));
  issues.push(...checkInnerHtmlOnComponent(lines));
  issues.push(...checkStyleCssText(lines, tagName));

  issues.sort((a, b) => a.line - b.line);

  return {
    issues,
    clean: issues.length === 0,
  };
}
