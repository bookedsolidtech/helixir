/**
 * Shadow DOM Usage Checker — detects anti-patterns in consumer CSS code
 * that violate Shadow DOM encapsulation rules.
 *
 * Scans CSS text and flags:
 * 1. Descendant selectors trying to reach shadow internals
 * 2. ::slotted() used in consumer CSS (only valid inside shadow DOM)
 * 3. ::slotted() with descendant/child selectors (can't style slotted children)
 * 4. ::slotted() with compound selectors (only simple selectors allowed)
 * 5. :host/:host-context() in consumer CSS (only valid inside shadow DOM)
 * 6. ::part() with descendant selectors (invalid chaining)
 * 7. ::part() with class/attribute selectors (parts are in different DOM tree)
 * 8. ::part()::part() chaining (parts don't forward through nested shadows)
 * 9. Deprecated /deep/, >>>, ::deep selectors
 * 10. !important on CSS custom properties (unnecessary)
 * 11. display: contents on component host (breaks shadow DOM)
 * 12. CEM-based: unknown ::part() names
 * 13. CEM-based: fuzzy-matched misspelled CSS custom properties
 */

import type { ComponentMetadata } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShadowDomIssue {
  line: number;
  column: number;
  severity: 'error' | 'warning';
  rule: string;
  message: string;
  suggestion: string;
  code: string;
}

export interface ShadowDomCheckResult {
  tagName: string | null;
  issues: ShadowDomIssue[];
  clean: boolean;
}

// ─── Levenshtein distance for fuzzy matching ─────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 0; i <= m; i++) {
    const row = dp[i];
    if (row) row[0] = i;
  }
  for (let j = 0; j <= n; j++) {
    const row = dp[0];
    if (row) row[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const prevRow = dp[i - 1];
      const currRow = dp[i];
      if (prevRow && currRow) {
        currRow[j] = Math.min(
          (prevRow[j] ?? 0) + 1,
          (currRow[j - 1] ?? 0) + 1,
          (prevRow[j - 1] ?? 0) + cost,
        );
      }
    }
  }

  const lastRow = dp[m];
  return lastRow ? (lastRow[n] ?? 0) : 0;
}

// ─── Pattern Detectors ───────────────────────────────────────────────────────

function checkDescendantSelectors(lines: string[], tagName: string): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  const pattern = new RegExp(`${escapeRegex(tagName)}\\s+(?!::part|::slotted)[.#a-z]`, 'i');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      issues.push({
        line: i + 1,
        column: match.index + 1,
        severity: 'error',
        rule: 'no-shadow-pierce',
        message: `Descendant selector cannot reach inside ${tagName}'s Shadow DOM.`,
        suggestion: `Use CSS custom properties or ::part() to style ${tagName}'s internals.`,
        code: line.trim(),
      });
    }
  }

  return issues;
}

function checkSlottedMisuse(lines: string[]): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  const pattern = /::slotted\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      issues.push({
        line: i + 1,
        column: match.index + 1,
        severity: 'error',
        rule: 'no-external-slotted',
        message: '::slotted() only works inside a shadow root stylesheet, not in consumer CSS.',
        suggestion:
          'Style slotted elements directly in your page CSS by targeting them before they are slotted.',
        code: line.trim(),
      });
    }
  }

  return issues;
}

function checkPartDescendants(lines: string[]): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  // ::part(name) followed by whitespace then a selector (not { or , or : or ;)
  // Also catches child combinator: ::part(name) > selector
  const pattern = /::part\([^)]+\)\s+(?:>?\s*)?[a-zA-Z.#[]/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      issues.push({
        line: i + 1,
        column: match.index + 1,
        severity: 'error',
        rule: 'no-part-descendant',
        message:
          '::part() cannot be chained with descendant or child selectors. You can only style the part itself.',
        suggestion: 'Remove the descendant/child selector and style the part directly.',
        code: line.trim(),
      });
    }
  }

  return issues;
}

function checkPartStructural(lines: string[]): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  // ::part(name) followed immediately by .class or [attr] (no whitespace)
  // But NOT followed by : (pseudo-class like :hover) or :: (pseudo-element like ::before)
  const pattern = /::part\([^)]+\)(?:\.[a-zA-Z]|\[[a-zA-Z])/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      issues.push({
        line: i + 1,
        column: match.index + 1,
        severity: 'error',
        rule: 'no-part-structural',
        message:
          '::part() cannot be combined with class or attribute selectors. Parts exist in a different DOM tree.',
        suggestion:
          'Remove the class/attribute selector. Use CSS custom properties or the part name to differentiate styles.',
        code: line.trim(),
      });
    }
  }

  return issues;
}

function checkPartChaining(lines: string[]): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  // ::part(name)::part(name) — parts cannot be chained through nested shadow roots
  const pattern = /::part\([^)]+\)::part\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      issues.push({
        line: i + 1,
        column: match.index + 1,
        severity: 'error',
        rule: 'no-part-chain',
        message:
          '::part() cannot be chained. Parts do not forward through nested shadow roots automatically.',
        suggestion:
          'The outer component must use the "exportparts" attribute to re-export inner parts. Then style the forwarded part name directly.',
        code: line.trim(),
      });
    }
  }

  return issues;
}

function checkDeprecatedDeep(lines: string[]): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  // /deep/, >>>, ::deep — all deprecated shadow-piercing selectors
  const pattern = /(?:\/deep\/|>>>|::deep)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      issues.push({
        line: i + 1,
        column: match.index + 1,
        severity: 'error',
        rule: 'deprecated-deep',
        message: `"${match[0]}" is a deprecated shadow-piercing combinator. It has been removed from all browsers.`,
        suggestion:
          'Use CSS custom properties to pass values through the shadow boundary, or use ::part() to style exposed parts.',
        code: line.trim(),
      });
    }
  }

  return issues;
}

function checkDisplayContentsOnHost(lines: string[], tagName: string): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  // Detect tagname { ... display: contents ... }
  // This is a simplified check — looks for the tag as a selector then display:contents in that block
  const blockPattern = new RegExp(`(?:^|[},])\\s*${escapeRegex(tagName)}\\s*\\{([^}]*)\\}`, 'gi');
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockPattern.exec(lines.join('\n'))) !== null) {
    const blockContent = blockMatch[1] ?? '';
    if (/display\s*:\s*contents/i.test(blockContent)) {
      const blockStart = blockMatch.index;
      const preceding = lines.join('\n').slice(0, blockStart);
      const line = (preceding.match(/\n/g) ?? []).length + 1;

      issues.push({
        line,
        column: 1,
        severity: 'error',
        rule: 'no-display-contents-host',
        message: `Setting "display: contents" on <${tagName}> removes the host element from the layout box tree, which can break Shadow DOM rendering and accessibility.`,
        suggestion: `Use "display: block" or "display: inline-block" instead. If you need to remove the wrapper, consider CSS custom properties or ::part() styling.`,
        code: `${tagName} { display: contents; }`,
      });
    }
  }

  return issues;
}

function checkHostMisuse(lines: string[]): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  // :host, :host(), :host-context() — only work inside shadow DOM stylesheets
  const pattern =
    /(?:^|[{},;\s])(:host(?:-context)?\s*(?:\([^)]*\))?\s*\{|:host(?:-context)?\s*\()/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      issues.push({
        line: i + 1,
        column: (match.index ?? 0) + 1,
        severity: 'error',
        rule: 'no-external-host',
        message:
          ':host and :host-context() only work inside a shadow root stylesheet, not in consumer CSS.',
        suggestion:
          'Target the component tag name directly instead (e.g., "my-button { display: block; }").',
        code: line.trim(),
      });
    }
  }

  return issues;
}

function checkSlottedDescendant(lines: string[]): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  // ::slotted(selector) followed by whitespace then another selector (descendant/child)
  const pattern = /::slotted\([^)]+\)\s+(?:>?\s*)?[a-zA-Z.#[*]/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      issues.push({
        line: i + 1,
        column: match.index + 1,
        severity: 'error',
        rule: 'no-slotted-descendant',
        message:
          '::slotted() cannot target descendants of slotted content. It only styles the direct slotted element itself.',
        suggestion:
          'Style only the slotted element: "::slotted(div) { ... }". To style children, use light DOM CSS outside the component.',
        code: line.trim(),
      });
    }
  }

  return issues;
}

function checkSlottedCompound(lines: string[]): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  // ::slotted() only accepts simple selectors (one element, class, or attribute — not compounds)
  // Invalid: ::slotted(div.foo), ::slotted(div span), ::slotted(.a.b)
  // Valid: ::slotted(div), ::slotted(.foo), ::slotted([attr]), ::slotted(*)
  const slottedPattern = /::slotted\(([^)]+)\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let match: RegExpExecArray | null;
    slottedPattern.lastIndex = 0;
    while ((match = slottedPattern.exec(line)) !== null) {
      const inner = (match[1] ?? '').trim();
      // A simple selector is: a single tag, class, id, attribute, or *
      // Compound has multiple parts: "div.foo", "div span", ".a.b", "div > span"
      const isCompound =
        /\s/.test(inner) || // space (descendant)
        /[>+~]/.test(inner) || // combinators
        /^[a-zA-Z][a-zA-Z0-9-]*[.#[]/.test(inner) || // tag + class/id/attr
        /^\.[a-zA-Z][a-zA-Z0-9-]*\./.test(inner); // .class.class

      if (isCompound) {
        issues.push({
          line: i + 1,
          column: match.index + 1,
          severity: 'error',
          rule: 'no-slotted-compound',
          message: `::slotted() only accepts simple selectors. "${inner}" is a compound selector.`,
          suggestion:
            'Use a single simple selector inside ::slotted(), e.g., "::slotted(div)" or "::slotted(.my-class)".',
          code: line.trim(),
        });
      }
    }
  }

  return issues;
}

function checkImportantOnTokens(lines: string[]): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  const pattern = /--[\w-]+\s*:\s*[^;]*!important/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = pattern.exec(line);
    if (match) {
      issues.push({
        line: i + 1,
        column: match.index + 1,
        severity: 'warning',
        rule: 'no-important-on-tokens',
        message:
          '!important is unnecessary on CSS custom properties. Custom properties always inherit through shadow boundaries.',
        suggestion: 'Remove !important — the custom property will work without it.',
        code: line.trim(),
      });
    }
  }

  return issues;
}

function checkUnknownParts(lines: string[], meta: ComponentMetadata): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  const validParts = new Set(meta.cssParts.map((p) => p.name));
  const pattern = new RegExp(`${escapeRegex(meta.tagName)}::part\\(([^)]+)\\)`, 'g');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(line)) !== null) {
      const partName = (match[1] ?? '').trim();
      if (!validParts.has(partName)) {
        const closest = findClosestMatch(partName, Array.from(validParts));
        const suggestion = closest
          ? `Did you mean "::part(${closest})"? Available parts: ${Array.from(validParts).join(', ')}`
          : `Available parts: ${Array.from(validParts).join(', ') || 'none'}`;
        issues.push({
          line: i + 1,
          column: match.index + 1,
          severity: 'error',
          rule: 'unknown-part',
          message: `"${partName}" is not a known CSS part of <${meta.tagName}>.`,
          suggestion,
          code: line.trim(),
        });
      }
    }
  }

  return issues;
}

function checkMisspelledTokens(lines: string[], meta: ComponentMetadata): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  if (meta.cssProperties.length === 0) return issues;

  const validTokens = meta.cssProperties.map((p) => p.name);
  const varPattern = /var\(\s*(--[\w-]+)\s*\)/g;
  const declPattern = /(--[\w-]+)\s*:/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const tokensInLine = new Set<string>();

    let match: RegExpExecArray | null;
    varPattern.lastIndex = 0;
    while ((match = varPattern.exec(line)) !== null) {
      tokensInLine.add(match[1] ?? '');
    }
    declPattern.lastIndex = 0;
    while ((match = declPattern.exec(line)) !== null) {
      tokensInLine.add(match[1] ?? '');
    }

    for (const token of tokensInLine) {
      if (validTokens.includes(token)) continue;

      const closest = findClosestMatch(token, validTokens);
      if (closest && closest !== token) {
        const dist = levenshtein(token, closest);
        if (dist <= 3 && dist > 0) {
          issues.push({
            line: i + 1,
            column: line.indexOf(token) + 1,
            severity: 'warning',
            rule: 'possible-typo',
            message: `"${token}" is not a known CSS property of this component. Did you mean "${closest}"?`,
            suggestion: `Replace "${token}" with "${closest}"`,
            code: line.trim(),
          });
        }
      }
    }
  }

  return issues;
}

function checkRootScopeTokens(lines: string[], meta: ComponentMetadata): ShadowDomIssue[] {
  const issues: ShadowDomIssue[] = [];
  const validTokens = new Set(meta.cssProperties.map((p) => p.name));
  if (validTokens.size === 0) return issues;

  // Find :root blocks and check for component tokens inside them
  const text = lines.join('\n');
  const rootBlockPattern = /:root\s*\{([^}]*)}/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = rootBlockPattern.exec(text)) !== null) {
    const blockContent = blockMatch[1] ?? '';
    const blockStartOffset = blockMatch.index;
    const linesBeforeBlock = text.slice(0, blockStartOffset).split('\n').length;

    // Find each token declaration inside this :root block
    const tokenPattern = /(--[\w-]+)\s*:/g;
    let tokenMatch: RegExpExecArray | null;

    while ((tokenMatch = tokenPattern.exec(blockContent)) !== null) {
      const tokenName = tokenMatch[1] ?? '';
      if (validTokens.has(tokenName)) {
        // Calculate line number: lines before block + lines within block content before this token
        const contentBefore = blockContent.slice(0, tokenMatch.index);
        const extraLines = (contentBefore.match(/\n/g) ?? []).length;
        const line = linesBeforeBlock + extraLines;

        issues.push({
          line,
          column: 1,
          severity: 'error',
          rule: 'no-root-scope-token',
          message: `Component token "${tokenName}" set on :root has no effect through Shadow DOM.`,
          suggestion: `Set it on the host element instead: ${meta.tagName} { ${tokenName}: value; }`,
          code: `:root { ${tokenName}: ...; }`,
        });
      }
    }
  }

  return issues;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findClosestMatch(input: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;

  let best: string | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshtein(input, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return bestDist <= 3 ? best : null;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export function checkShadowDomUsage(
  cssText: string,
  tagName?: string,
  meta?: ComponentMetadata,
): ShadowDomCheckResult {
  const lines = cssText.split('\n');
  const issues: ShadowDomIssue[] = [];

  issues.push(...checkSlottedMisuse(lines));
  issues.push(...checkSlottedDescendant(lines));
  issues.push(...checkSlottedCompound(lines));
  issues.push(...checkHostMisuse(lines));
  issues.push(...checkPartDescendants(lines));
  issues.push(...checkPartStructural(lines));
  issues.push(...checkPartChaining(lines));
  issues.push(...checkDeprecatedDeep(lines));
  issues.push(...checkImportantOnTokens(lines));

  if (tagName) {
    issues.push(...checkDescendantSelectors(lines, tagName));
    issues.push(...checkDisplayContentsOnHost(lines, tagName));
  }

  if (meta) {
    issues.push(...checkUnknownParts(lines, meta));
    issues.push(...checkMisspelledTokens(lines, meta));
    issues.push(...checkRootScopeTokens(lines, meta));
  }

  issues.sort((a, b) => a.line - b.line || a.column - b.column);

  return {
    tagName: tagName ?? null,
    issues,
    clean: issues.length === 0,
  };
}
