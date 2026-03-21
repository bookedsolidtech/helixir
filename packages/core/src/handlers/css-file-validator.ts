/**
 * CSS File Validator — validates an entire CSS file containing styles for
 * multiple web components. Auto-detects which components are referenced,
 * runs per-component validation (shadow DOM, API resolution), and runs
 * global validators (specificity, color contrast, shorthand, theme).
 *
 * This is the "just validate my whole file" tool — agents don't need to
 * know which components are used or call validators individually.
 */

import type { Cem } from './cem.js';
import { parseCem } from './cem.js';
import { checkShadowDomUsage } from './shadow-dom-checker.js';
import { resolveCssApi } from './css-api-resolver.js';
import { checkThemeCompatibility } from './theme-checker.js';
import { checkCssSpecificity } from './specificity-checker.js';
import { checkColorContrast } from './color-contrast-checker.js';
import { checkCssShorthand } from './shorthand-checker.js';
import { checkCssScopeFromMeta } from './scope-checker.js';
import { checkTokenFallbacksFromMeta } from './token-fallback-checker.js';
import { buildAntiPatternHints } from './quick-ref.js';
import { suggestFix, type SuggestFixInput } from './suggest-fix.js';
import { checkDarkModePatterns } from './dark-mode-checker.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CssFileFix {
  suggestion: string;
  explanation: string;
}

export interface CssFileIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  line?: number;
  suggestion?: string;
  component?: string;
  fix?: CssFileFix;
}

export interface ComponentValidation {
  tagName: string;
  issues: CssFileIssue[];
  invalidParts: string[];
  invalidTokens: string[];
  antiPatterns: string[];
}

export interface CssFileValidationResult {
  clean: boolean;
  totalIssues: number;
  componentsFound: string[];
  components: Record<string, ComponentValidation>;
  globalIssues: CssFileIssue[];
  verdict: string;
}

// ─── Component Detection ────────────────────────────────────────────────────

/**
 * Extracts web component tag names from CSS selectors.
 * Matches: tag-name {, tag-name::part(x) {, tag-name.class {, tag-name[attr] {
 */
function detectComponentsInCss(css: string, cem: Cem): string[] {
  // Build a set of known tag names from the CEM
  const knownTags = new Set<string>();
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if ('tagName' in decl && decl.tagName) {
        knownTags.add(decl.tagName);
      }
    }
  }

  // Find all custom element tags referenced in selectors
  // Custom elements must contain a hyphen
  const tagPattern = /(?:^|[},;\s])([a-z][a-z0-9]*-[a-z0-9-]*)(?=[.:{\s,[[])/gm;
  const found = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(css)) !== null) {
    const tag = (match[1] ?? '').trim();
    if (knownTags.has(tag)) {
      found.add(tag);
    }
  }

  return [...found].sort();
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function validateCssFile(css: string, cem: Cem): CssFileValidationResult {
  const componentsFound = detectComponentsInCss(css, cem);
  const components: Record<string, ComponentValidation> = {};
  const globalIssues: CssFileIssue[] = [];

  // Per-component validation
  for (const tagName of componentsFound) {
    const issues: CssFileIssue[] = [];
    const invalidParts: string[] = [];
    const invalidTokens: string[] = [];

    try {
      const meta = parseCem(tagName, cem);

      // Shadow DOM anti-patterns
      safeRun(() => {
        const shadowResult = checkShadowDomUsage(css, tagName, meta);
        for (const issue of shadowResult.issues) {
          issues.push({
            severity: issue.severity === 'error' ? 'error' : 'warning',
            category: 'shadowDom',
            message: issue.message,
            line: issue.line,
            suggestion: issue.suggestion,
            component: tagName,
          });
        }
      });

      // CSS API resolution (parts, tokens, slots)
      safeRun(() => {
        const resolution = resolveCssApi(css, meta);
        for (const part of resolution.parts.resolved) {
          if (!part.valid) {
            invalidParts.push(part.name);
            issues.push({
              severity: 'error',
              category: 'invalidPart',
              message: `::part(${part.name}) does not exist on <${tagName}>. ${part.suggestion ? `Did you mean: ${part.suggestion}` : `Valid parts: ${meta.cssParts.map((p) => p.name).join(', ') || 'none'}`}`,
              component: tagName,
            });
          }
        }
        for (const token of resolution.tokens.resolved) {
          if (!token.valid) {
            invalidTokens.push(token.name);
            issues.push({
              severity: 'error',
              category: 'invalidToken',
              message: `CSS custom property "${token.name}" does not exist on <${tagName}>. ${token.suggestion ? `Did you mean: ${token.suggestion}` : ''}`,
              component: tagName,
            });
          }
        }
      });

      // Token fallbacks
      safeRun(() => {
        const knownTokens = new Set(meta.cssProperties.map((p) => p.name));
        const fallbackResult = checkTokenFallbacksFromMeta(css, knownTokens);
        for (const issue of fallbackResult.issues) {
          issues.push({
            severity: 'warning',
            category: 'tokenFallbacks',
            message: issue.message,
            line: issue.line,
            component: tagName,
          });
        }
      });

      // Scope validation
      safeRun(() => {
        const scopeResult = checkCssScopeFromMeta(css, tagName, meta.cssProperties);
        for (const issue of scopeResult.issues) {
          issues.push({
            severity: 'warning',
            category: 'scope',
            message: issue.message,
            line: issue.line,
            component: tagName,
          });
        }
      });
      // Generate inline fixes for actionable issues
      for (const issue of issues) {
        safeRun(() => {
          const fixInput = mapIssueToFixInput(
            issue,
            css,
            meta.tagName,
            meta.cssParts.map((p) => p.name),
          );
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

      // Build anti-patterns
      const antiPatterns = buildAntiPatternHints(meta);
      components[tagName] = { tagName, issues, invalidParts, invalidTokens, antiPatterns };
    } catch {
      // Tag not in CEM — skip per-component validation
      components[tagName] = { tagName, issues, invalidParts, invalidTokens, antiPatterns: [] };
    }
  }

  // Global CSS validation (not component-specific)
  safeRun(() => {
    const themeResult = checkThemeCompatibility(css);
    for (const issue of themeResult.issues) {
      globalIssues.push({
        severity: 'warning',
        category: 'themeCompat',
        message: issue.message,
        line: issue.line,
      });
    }
  });

  safeRun(() => {
    const specResult = checkCssSpecificity(css);
    for (const issue of specResult.issues) {
      globalIssues.push({
        severity: 'info',
        category: 'specificity',
        message: issue.message,
        line: issue.line,
      });
    }
  });

  safeRun(() => {
    const contrastResult = checkColorContrast(css);
    for (const issue of contrastResult.issues) {
      globalIssues.push({
        severity: 'warning',
        category: 'colorContrast',
        message: issue.message,
        line: issue.line,
      });
    }
  });

  safeRun(() => {
    const shorthandResult = checkCssShorthand(css);
    for (const issue of shorthandResult.issues) {
      globalIssues.push({
        severity: 'warning',
        category: 'shorthand',
        message: issue.message,
        line: issue.line,
        suggestion: issue.suggestion,
      });
    }
  });

  safeRun(() => {
    const darkResult = checkDarkModePatterns(css);
    for (const issue of darkResult.issues) {
      globalIssues.push({
        severity: 'warning',
        category: 'darkMode',
        message: issue.message,
        line: issue.line,
        suggestion: issue.suggestion,
      });
    }
  });

  // Aggregate
  const allIssues = [...globalIssues, ...Object.values(components).flatMap((c) => c.issues)];
  const totalIssues = allIssues.length;
  const clean = totalIssues === 0;
  const verdict = buildVerdict(componentsFound, components, globalIssues, totalIssues);

  return {
    clean,
    totalIssues,
    componentsFound,
    components,
    globalIssues,
    verdict,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeRun(fn: () => void): void {
  try {
    fn();
  } catch {
    // Individual checker failed — skip
  }
}

function mapIssueToFixInput(
  issue: CssFileIssue,
  css: string,
  tagName: string,
  partNames: string[],
): SuggestFixInput | null {
  const original = issue.line ? extractLineContent(css, issue.line) : '';
  if (!original && issue.category !== 'specificity') return null;

  switch (issue.category) {
    case 'shadowDom':
      return {
        type: 'shadow-dom',
        issue: 'descendant-piercing',
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
    case 'specificity':
      if (issue.message.includes('!important')) {
        const importantOriginal = original || extractImportantRule(css);
        if (!importantOriginal) return null;
        return { type: 'specificity', issue: 'important', original: importantOriginal, tagName };
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

function buildVerdict(
  componentsFound: string[],
  components: Record<string, ComponentValidation>,
  globalIssues: CssFileIssue[],
  totalIssues: number,
): string {
  if (totalIssues === 0) {
    return componentsFound.length > 0
      ? `Clean — ${componentsFound.length} component${componentsFound.length > 1 ? 's' : ''} validated, no issues.`
      : 'Clean — no web components detected in CSS.';
  }

  const errors = [
    ...globalIssues.filter((i) => i.severity === 'error'),
    ...Object.values(components).flatMap((c) => c.issues.filter((i) => i.severity === 'error')),
  ].length;

  const warnings = [
    ...globalIssues.filter((i) => i.severity === 'warning'),
    ...Object.values(components).flatMap((c) => c.issues.filter((i) => i.severity === 'warning')),
  ].length;

  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors > 1 ? 's' : ''}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);

  const componentSummary = Object.entries(components)
    .filter(([, v]) => v.issues.length > 0)
    .map(([tag, v]) => `<${tag}>: ${v.issues.length}`)
    .join(', ');

  return `${parts.join(', ')} across ${componentsFound.length} component${componentsFound.length > 1 ? 's' : ''}${componentSummary ? ` (${componentSummary})` : ''}.`;
}
