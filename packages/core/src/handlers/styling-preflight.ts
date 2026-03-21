/**
 * Styling Preflight — single-call tool that combines component API discovery,
 * CSS reference resolution, and validation into one response.
 *
 * Agents call this ONCE with their CSS (and optional HTML) to get:
 * 1. The component's full style API surface (parts, tokens, slots)
 * 2. Resolution of every ::part() and token reference (valid vs hallucinated)
 * 3. Validation issues (shadow DOM, theme, specificity)
 * 4. A correct CSS snippet to use as reference
 * 5. A pass/fail verdict
 *
 * This eliminates the "forgot to check the API first" failure mode.
 */

import type { ComponentMetadata } from './cem.js';
import { resolveCssApi, type CssApiResolution } from './css-api-resolver.js';
import { checkShadowDomUsage } from './shadow-dom-checker.js';
import { checkThemeCompatibility } from './theme-checker.js';
import { checkCssShorthand } from './shorthand-checker.js';
import { checkColorContrast } from './color-contrast-checker.js';
import { checkCssSpecificity } from './specificity-checker.js';
import { buildCssSnippet } from './styling-diagnostics.js';
import { checkTokenFallbacksFromMeta } from './token-fallback-checker.js';
import { checkCssScopeFromMeta } from './scope-checker.js';
import { suggestFix, type SuggestFixInput } from './suggest-fix.js';
import { checkDarkModePatterns } from './dark-mode-checker.js';
import { buildAntiPatternHints } from './quick-ref.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PreflightInput {
  css: string;
  html?: string;
  meta: ComponentMetadata;
}

export interface PreflightFix {
  suggestion: string;
  explanation: string;
}

export interface PreflightIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  line?: number;
  suggestion?: string;
  fix?: PreflightFix;
}

export interface PreflightComponentApi {
  tagName: string;
  description: string;
  parts: string[];
  tokens: string[];
  slots: string[];
  hasStyleApi: boolean;
}

export interface PreflightResult {
  componentApi: PreflightComponentApi;
  resolution: CssApiResolution;
  issues: PreflightIssue[];
  antiPatterns: string[];
  correctSnippet: string;
  verdict: string;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function runStylingPreflight(input: PreflightInput): PreflightResult {
  const { css, html, meta } = input;
  const issues: PreflightIssue[] = [];

  // 1. Resolve CSS references against CEM
  const resolution = resolveCssApi(css, meta, html);

  // 2. Run all CSS validators (if CSS is non-empty)
  if (css.trim()) {
    // Shadow DOM anti-patterns
    safeRun(() => {
      const shadowResult = checkShadowDomUsage(css, meta.tagName, meta);
      for (const issue of shadowResult.issues) {
        issues.push({
          severity: issue.severity === 'error' ? 'error' : 'warning',
          category: 'shadowDom',
          message: issue.message,
          line: issue.line,
          suggestion: issue.suggestion,
        });
      }
    });

    // Theme compatibility (hardcoded colors, mixed token sources, dark mode shadows)
    safeRun(() => {
      const themeResult = checkThemeCompatibility(css);
      for (const issue of themeResult.issues) {
        issues.push({
          severity: 'warning',
          category: 'themeCompat',
          message: issue.message,
          line: issue.line,
        });
      }
    });

    // Token fallbacks (var() without fallbacks, hardcoded colors on theme properties)
    safeRun(() => {
      const knownTokens = new Set(meta.cssProperties.map((p) => p.name));
      const fallbackResult = checkTokenFallbacksFromMeta(css, knownTokens);
      for (const issue of fallbackResult.issues) {
        issues.push({
          severity: 'warning',
          category: 'tokenFallbacks',
          message: issue.message,
          line: issue.line,
        });
      }
    });

    // Scope validation (component tokens on :root instead of host)
    safeRun(() => {
      const scopeResult = checkCssScopeFromMeta(css, meta.tagName, meta.cssProperties);
      for (const issue of scopeResult.issues) {
        issues.push({
          severity: 'warning',
          category: 'scope',
          message: issue.message,
          line: issue.line,
        });
      }
    });

    // Shorthand + var() risky combinations
    safeRun(() => {
      const shorthandResult = checkCssShorthand(css);
      for (const issue of shorthandResult.issues) {
        issues.push({
          severity: 'warning',
          category: 'shorthand',
          message: issue.message,
          line: issue.line,
          suggestion: issue.suggestion,
        });
      }
    });

    // Color contrast issues (low-contrast pairs, mixed sources)
    safeRun(() => {
      const contrastResult = checkColorContrast(css);
      for (const issue of contrastResult.issues) {
        issues.push({
          severity: 'warning',
          category: 'colorContrast',
          message: issue.message,
          line: issue.line,
        });
      }
    });

    // CSS specificity anti-patterns (!important, ID selectors, deep nesting)
    safeRun(() => {
      const specResult = checkCssSpecificity(css);
      for (const issue of specResult.issues) {
        issues.push({
          severity: 'info',
          category: 'specificity',
          message: issue.message,
          line: issue.line,
        });
      }
    });

    // Dark mode patterns (theme-scoped standard properties, shadow piercing)
    safeRun(() => {
      const darkResult = checkDarkModePatterns(css);
      for (const issue of darkResult.issues) {
        issues.push({
          severity: 'warning',
          category: 'darkMode',
          message: issue.message,
          line: issue.line,
          suggestion: issue.suggestion,
        });
      }
    });
  }

  // 3. Generate inline fixes for actionable issues
  for (const issue of issues) {
    safeRun(() => {
      const fixInput = mapIssueToFixInput(issue, css, meta);
      if (fixInput) {
        const fixResult = suggestFix(fixInput);
        if (fixResult.suggestion !== fixResult.original) {
          issue.fix = {
            suggestion: fixResult.suggestion,
            explanation: fixResult.explanation,
          };
        }
      }
    });
  }

  // 4. Build the component API summary
  const componentApi: PreflightComponentApi = {
    tagName: meta.tagName,
    description: meta.description,
    parts: meta.cssParts.map((p) => p.name),
    tokens: meta.cssProperties.map((p) => p.name),
    slots: meta.slots.map((s) => (s.name === '' ? '(default)' : s.name)),
    hasStyleApi: meta.cssParts.length > 0 || meta.cssProperties.length > 0 || meta.slots.length > 0,
  };

  // 5. Generate anti-patterns (component-specific "don't do this" examples)
  const antiPatterns = buildAntiPatternHints(meta);

  // 6. Generate correct CSS snippet
  const correctSnippet = buildCssSnippet(meta);

  // 7. Build verdict
  const verdict = buildVerdict(resolution, issues);

  return {
    componentApi,
    resolution,
    issues,
    antiPatterns,
    correctSnippet,
    verdict,
  };
}

// ─── Safe Runner ─────────────────────────────────────────────────────────────

function safeRun(fn: () => void): void {
  try {
    fn();
  } catch {
    // Individual checker failed — skip and continue with other checks
  }
}

// ─── Issue → Fix Mapping ────────────────────────────────────────────────────

/** Maps category to suggest_fix type and extracts the original CSS from the issue. */
function mapIssueToFixInput(
  issue: PreflightIssue,
  css: string,
  meta: ComponentMetadata,
): SuggestFixInput | null {
  const partNames = meta.cssParts.map((p) => p.name);
  const tagName = meta.tagName;

  // Extract the CSS rule at the issue's line (or use a heuristic from the message)
  const original = issue.line ? extractLineContent(css, issue.line) : '';
  if (!original && issue.category !== 'specificity') return null;

  switch (issue.category) {
    case 'shadowDom':
      return {
        type: 'shadow-dom',
        issue: detectShadowDomIssueType(issue.message),
        original,
        tagName,
        partNames,
      };
    case 'themeCompat':
      return {
        type: 'theme-compat',
        issue: 'hardcoded-color',
        original,
        tagName,
      };
    case 'tokenFallbacks':
      return {
        type: 'token-fallback',
        issue: issue.message.includes('fallback') ? 'missing-fallback' : 'hardcoded-color',
        original,
        tagName,
      };
    case 'darkMode':
      return {
        type: 'dark-mode',
        issue: issue.message.includes('descendant')
          ? 'theme-scope-shadow-piercing'
          : 'theme-scope-standard-property',
        original,
        tagName,
        property: extractPropertyFromMessage(issue.message),
      };
    case 'specificity':
      if (issue.message.includes('!important')) {
        const importantOriginal = original || extractImportantRule(css);
        if (!importantOriginal) return null;
        return {
          type: 'specificity',
          issue: 'important',
          original: importantOriginal,
          tagName,
        };
      }
      return null;
    default:
      return null;
  }
}

function extractLineContent(css: string, lineNum: number): string {
  const lines = css.split('\n');
  if (lineNum < 1 || lineNum > lines.length) return '';
  return (lines[lineNum - 1] ?? '').trim();
}

function extractImportantRule(css: string): string {
  const match = css.match(/[^{}]*!important[^}]*/);
  return match ? match[0].trim() : '';
}

function extractPropertyFromMessage(message: string): string | undefined {
  const match = message.match(/"([a-z-]+)" on/);
  return match?.[1];
}

function detectShadowDomIssueType(message: string): string {
  if (message.includes('descendant') || message.includes('child')) return 'descendant-piercing';
  if (message.includes('::part') && message.includes('class')) return 'part-structural';
  if (message.includes('/deep/') || message.includes('>>>')) return 'deprecated-deep';
  if (message.includes('::slotted')) return 'slotted-descendant';
  return 'descendant-piercing';
}

// ─── Verdict Builder ────────────────────────────────────────────────────────

function buildVerdict(resolution: CssApiResolution, issues: PreflightIssue[]): string {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const invalidRefs = resolution.invalidCount;

  if (errors === 0 && warnings === 0 && invalidRefs === 0) {
    return 'pass — CSS references are valid and no anti-patterns detected.';
  }

  const parts: string[] = [];
  if (invalidRefs > 0) {
    parts.push(
      `${invalidRefs} invalid CSS reference${invalidRefs > 1 ? 's' : ''} (hallucinated part/token/slot names)`,
    );
  }
  if (errors > 0) {
    parts.push(`${errors} error${errors > 1 ? 's' : ''} (will break at runtime)`);
  }
  if (warnings > 0) {
    parts.push(`${warnings} warning${warnings > 1 ? 's' : ''} (theme/dark mode risk)`);
  }

  return 'fail — ' + parts.join(', ') + '.';
}
