/**
 * Validation Summary — post-processes validate_component_code results into a
 * prioritized, severity-scored summary that agents can act on immediately.
 *
 * Severity levels:
 * - error: Will break at runtime or produce visually broken output
 * - warning: Will break in specific contexts (themes, a11y, screen readers)
 * - info: Best practice violation, may cause issues over time
 */

import type { ValidateComponentCodeResult } from './code-validator.js';
import { suggestFix } from './suggest-fix.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface PrioritizedIssue {
  severity: IssueSeverity;
  category: string;
  message: string;
  line?: number;
  suggestion?: string;
  /** Auto-generated corrected code when the issue has enough data for a fix. */
  fix?: string;
}

export interface ValidationSummary {
  clean: boolean;
  totalIssues: number;
  errors: number;
  warnings: number;
  info: number;
  topIssues: PrioritizedIssue[];
  verdict: string;
}

// ─── Severity Classification ────────────────────────────────────────────────

const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function summarizeValidation(result: ValidateComponentCodeResult): ValidationSummary {
  const issues: PrioritizedIssue[] = [];

  // ERROR-level: will break at runtime
  if (result.shadowDom) {
    for (const issue of result.shadowDom.issues) {
      const fix = tryAutoFix('shadow-dom', mapRuleToIssue(issue.rule), issue.code);
      issues.push({
        severity: 'error',
        category: 'shadowDom',
        message: issue.message,
        line: issue.line,
        suggestion: issue.suggestion,
        ...(fix ? { fix } : {}),
      });
    }
  }

  if (result.imports) {
    for (const tag of result.imports.unknownTags) {
      issues.push({
        severity: 'error',
        category: 'imports',
        message: `Unknown component tag: <${tag}>`,
      });
    }
  }

  if (result.shadowDomJs) {
    for (const issue of result.shadowDomJs.issues) {
      issues.push({
        severity: 'error',
        category: 'shadowDomJs',
        message: issue.message,
        line: issue.line,
        suggestion: issue.suggestion,
      });
    }
  }

  if (result.eventUsage) {
    for (const issue of result.eventUsage.issues) {
      issues.push({
        severity: 'error',
        category: 'eventUsage',
        message: issue.message,
        line: issue.line,
      });
    }
  }

  if (result.methodCalls) {
    for (const issue of result.methodCalls.issues) {
      issues.push({
        severity: 'error',
        category: 'methodCalls',
        message: issue.message,
        line: issue.line,
        ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
      });
    }
  }

  // WARNING-level: breaks in specific contexts
  if (result.a11yUsage) {
    for (const issue of result.a11yUsage.issues) {
      issues.push({
        severity: 'warning',
        category: 'a11y',
        message: issue.message,
        line: issue.line,
      });
    }
  }

  if (result.tokenFallbacks) {
    for (const issue of result.tokenFallbacks.issues) {
      const original = `${issue.property}: ${issue.value};`;
      const fix = tryAutoFix('token-fallback', issue.rule, original, issue.property);
      issues.push({
        severity: 'warning',
        category: 'tokenFallbacks',
        message: issue.message,
        line: issue.line,
        ...(fix ? { fix } : {}),
      });
    }
  }

  if (result.themeCompat) {
    for (const issue of result.themeCompat.issues) {
      issues.push({
        severity: 'warning',
        category: 'themeCompat',
        message: issue.message,
        line: issue.line,
      });
    }
  }

  if (result.colorContrast) {
    for (const issue of result.colorContrast.issues) {
      issues.push({
        severity: 'warning',
        category: 'colorContrast',
        message: issue.message,
        line: issue.line,
      });
    }
  }

  if (result.scope) {
    for (const issue of result.scope.issues) {
      issues.push({
        severity: 'warning',
        category: 'scope',
        message: issue.message,
        line: issue.line,
      });
    }
  }

  if (result.shorthand) {
    for (const issue of result.shorthand.issues) {
      issues.push({
        severity: 'warning',
        category: 'shorthand',
        message: issue.message,
        line: issue.line,
        suggestion: issue.suggestion,
      });
    }
  }

  if (result.slotChildren) {
    for (const issue of result.slotChildren.issues) {
      issues.push({
        severity: 'warning',
        category: 'slotChildren',
        message: issue.message,
        line: issue.line,
      });
    }
  }

  if (result.attributeConflicts) {
    for (const issue of result.attributeConflicts.issues) {
      issues.push({
        severity: 'warning',
        category: 'attributeConflicts',
        message: issue.message,
        line: issue.line,
      });
    }
  }

  // INFO-level: best practice violations
  if (result.specificity) {
    for (const issue of result.specificity.issues) {
      issues.push({
        severity: 'info',
        category: 'specificity',
        message: issue.message,
        line: issue.line,
      });
    }
  }

  if (result.layout) {
    for (const issue of result.layout.issues) {
      issues.push({
        severity: 'info',
        category: 'layout',
        message: issue.message,
        line: issue.line,
      });
    }
  }

  if (result.transitionAnimation) {
    for (const issue of result.transitionAnimation.issues) {
      issues.push({
        severity: 'info',
        category: 'transitionAnimation',
        message: issue.message,
        line: issue.line,
      });
    }
  }

  if (result.htmlUsage) {
    for (const issue of result.htmlUsage.issues) {
      issues.push({
        severity: 'info',
        category: 'htmlUsage',
        message: issue.message,
        line: issue.line,
      });
    }
  }

  if (result.cssVars) {
    for (const issue of result.cssVars.issues) {
      issues.push({
        severity: 'info',
        category: 'cssVars',
        message: issue.message,
        line: issue.line,
      });
    }
  }

  if (result.composition) {
    for (const issue of result.composition.issues) {
      issues.push({
        severity: 'info',
        category: 'composition',
        message: issue.message,
      });
    }
  }

  // Sort: errors first, then warnings, then info
  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const info = issues.filter((i) => i.severity === 'info').length;

  const topIssues = issues.slice(0, 10);

  const verdict = buildVerdict(errors, warnings, info);

  return {
    clean: issues.length === 0,
    totalIssues: issues.length,
    errors,
    warnings,
    info,
    topIssues,
    verdict,
  };
}

// ─── Auto-Fix Helpers ───────────────────────────────────────────────────────

/**
 * Maps shadow-dom-checker rule names to suggest_fix issue types.
 */
function mapRuleToIssue(rule: string): string {
  const ruleMap: Record<string, string> = {
    'no-descendant-piercing': 'descendant-piercing',
    'no-direct-element-styling': 'direct-element-styling',
    'no-deprecated-deep': 'deprecated-deep',
    'no-part-structural': 'part-structural',
    'no-part-chain': 'part-chain',
    'no-display-contents-host': 'display-contents-host',
    'no-external-host': 'external-host',
    'no-slotted-descendant': 'slotted-descendant',
    'no-slotted-compound': 'slotted-compound',
  };
  return ruleMap[rule] ?? rule;
}

/**
 * Attempts to generate an auto-fix for a validation issue.
 * Returns the corrected code string, or undefined if no fix is possible.
 */
function tryAutoFix(
  type: string,
  issue: string,
  original?: string,
  property?: string,
): string | undefined {
  if (!original) return undefined;
  try {
    const result = suggestFix({
      type: type as 'shadow-dom' | 'token-fallback' | 'theme-compat' | 'specificity' | 'layout',
      issue,
      original,
      ...(property ? { property } : {}),
    });
    // Only return fix if it's actually different from the original
    if (result.suggestion !== original) {
      return result.suggestion;
    }
  } catch {
    // suggestFix failed — no auto-fix available
  }
  return undefined;
}

// ─── Verdict Builder ────────────────────────────────────────────────────────

function buildVerdict(errors: number, warnings: number, info: number): string {
  if (errors === 0 && warnings === 0 && info === 0) {
    return 'Clean — no issues detected.';
  }

  const parts: string[] = [];

  if (errors > 0) {
    parts.push(
      `${errors} error${errors > 1 ? 's' : ''} (will break at runtime — fix before shipping)`,
    );
  }
  if (warnings > 0) {
    parts.push(
      `${warnings} warning${warnings > 1 ? 's' : ''} (may break in dark mode, a11y, or theme changes)`,
    );
  }
  if (info > 0) {
    parts.push(`${info} info (best practice suggestions)`);
  }

  return parts.join(', ') + '.';
}
