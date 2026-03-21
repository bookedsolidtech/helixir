/**
 * CSS Custom Property Checker — validates consumer CSS for custom property
 * usage against the CEM.
 *
 * Detects:
 * 1. Unknown CSS custom properties (not in CEM) with typo suggestions
 * 2. !important on custom properties (anti-pattern for tokens)
 */

import { parseCem } from './cem.js';
import type { Cem } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CssVarIssue {
  rule: 'unknown-property' | 'important-on-token';
  property: string;
  suggestion: string | null;
  line: number;
  message: string;
}

export interface CssVarCheckResult {
  issues: CssVarIssue[];
  knownProperties: string[];
  defaultValues: Record<string, string>;
  clean: boolean;
}

// ─── Levenshtein distance ────────────────────────────────────────────────────

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

  return bestDist <= 4 ? best : null;
}

// ─── CSS Parsing ────────────────────────────────────────────────────────────

interface CssDeclaration {
  property: string;
  value: string;
  hasImportant: boolean;
  line: number;
}

/**
 * Extract custom property declarations from CSS text.
 * Handles both multi-line and single-line CSS (e.g. `my-button { --color: red; }`).
 */
function extractCustomPropertyDeclarations(css: string): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];

  // Match CSS custom property declarations anywhere in CSS
  const declPattern = /(?:^|[{;])\s*(--[a-z][a-z0-9-]*)\s*:\s*([^;{}]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = declPattern.exec(css)) !== null) {
    const property = (match[1] ?? '').trim();
    const rawValue = (match[2] ?? '').trim();
    if (!property || !rawValue) continue;

    const hasImportant = /!important/.test(rawValue);

    // Line number from position of the property name in source
    const propStart = match.index + match[0].indexOf(property);
    const preceding = css.slice(0, propStart);
    const line = (preceding.match(/\n/g) ?? []).length + 1;

    declarations.push({
      property,
      value: rawValue.replace(/\s*!important\s*/, '').trim(),
      hasImportant,
      line,
    });
  }

  return declarations;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkCssVars(cssText: string, tagName: string, cem: Cem): CssVarCheckResult {
  const meta = parseCem(tagName, cem);
  const knownProps = new Set(meta.cssProperties.map((p) => p.name));
  const knownPropList = Array.from(knownProps);

  // Build default values map
  const defaultValues: Record<string, string> = {};
  for (const prop of meta.cssProperties) {
    if (prop.default) {
      defaultValues[prop.name] = prop.default;
    }
  }

  const declarations = extractCustomPropertyDeclarations(cssText);
  const issues: CssVarIssue[] = [];

  for (const decl of declarations) {
    const isKnown = knownProps.has(decl.property);

    if (!isKnown) {
      // Only flag properties that look like they belong to this component
      // (share a prefix with known properties)
      const tagPrefix = `--${tagName.replace(/^--/, '')}`;
      const looksRelated =
        decl.property.startsWith(tagPrefix) ||
        knownPropList.some((k) => {
          const prefix = k.split('-').slice(0, 3).join('-');
          return decl.property.startsWith(prefix);
        });

      if (looksRelated) {
        const suggestion = findClosestMatch(decl.property, knownPropList);
        issues.push({
          rule: 'unknown-property',
          property: decl.property,
          suggestion,
          line: decl.line,
          message: suggestion
            ? `Unknown CSS custom property "${decl.property}". Did you mean "${suggestion}"?`
            : `Unknown CSS custom property "${decl.property}". Check the component docs for valid properties.`,
        });
      }
    }

    if (decl.hasImportant && isKnown) {
      issues.push({
        rule: 'important-on-token',
        property: decl.property,
        suggestion: null,
        line: decl.line,
        message: `Avoid !important on "${decl.property}". CSS custom properties cascade by design — specificity battles indicate a structural issue.`,
      });
    }
  }

  return {
    issues,
    knownProperties: knownPropList,
    defaultValues,
    clean: issues.length === 0,
  };
}
