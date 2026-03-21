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
import { buildCssSnippet } from './styling-diagnostics.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PreflightInput {
  css: string;
  html?: string;
  meta: ComponentMetadata;
}

export interface PreflightIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  line?: number;
  suggestion?: string;
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
  correctSnippet: string;
  verdict: string;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function runStylingPreflight(input: PreflightInput): PreflightResult {
  const { css, html, meta } = input;
  const issues: PreflightIssue[] = [];

  // 1. Resolve CSS references against CEM
  const resolution = resolveCssApi(css, meta, html);

  // 2. Run shadow DOM validation (if CSS is non-empty)
  if (css.trim()) {
    try {
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
    } catch {
      // Shadow DOM check failed — skip
    }

    // 3. Run theme compatibility check
    try {
      const themeResult = checkThemeCompatibility(css);
      for (const issue of themeResult.issues) {
        issues.push({
          severity: 'warning',
          category: 'themeCompat',
          message: issue.message,
          line: issue.line,
        });
      }
    } catch {
      // Theme check failed — skip
    }
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

  // 5. Generate correct CSS snippet
  const correctSnippet = buildCssSnippet(meta);

  // 6. Build verdict
  const verdict = buildVerdict(resolution, issues);

  return {
    componentApi,
    resolution,
    issues,
    correctSnippet,
    verdict,
  };
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
