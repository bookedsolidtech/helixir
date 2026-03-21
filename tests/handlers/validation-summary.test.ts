import { describe, it, expect } from 'vitest';
import { summarizeValidation } from '../../packages/core/src/handlers/validation-summary.js';
import type { ValidateComponentCodeResult } from '../../packages/core/src/handlers/code-validator.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCleanResult(): ValidateComponentCodeResult {
  return { clean: true, totalIssues: 0 };
}

function makeResult(overrides: Partial<ValidateComponentCodeResult>): ValidateComponentCodeResult {
  return { clean: false, totalIssues: 1, ...overrides };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('summarizeValidation', () => {
  it('returns a clean summary when no issues exist', () => {
    const summary = summarizeValidation(makeCleanResult());
    expect(summary.clean).toBe(true);
    expect(summary.totalIssues).toBe(0);
    expect(summary.errors).toBe(0);
    expect(summary.warnings).toBe(0);
    expect(summary.info).toBe(0);
    expect(summary.topIssues).toHaveLength(0);
  });

  it('classifies shadow DOM issues as errors', () => {
    const result = makeResult({
      totalIssues: 1,
      shadowDom: {
        issues: [
          {
            rule: 'no-descendant-piercing',
            line: 1,
            message: 'Cannot pierce shadow DOM',
            suggestion: 'Use ::part()',
            code: '.inner { color: red; }',
          },
        ],
        clean: false,
      },
    });
    const summary = summarizeValidation(result);
    expect(summary.errors).toBe(1);
    expect(summary.topIssues[0]?.severity).toBe('error');
    expect(summary.topIssues[0]?.category).toBe('shadowDom');
  });

  it('classifies import issues as errors', () => {
    const result = makeResult({
      totalIssues: 1,
      imports: {
        unknownTags: ['fake-element'],
        knownTags: [],
      },
    });
    const summary = summarizeValidation(result);
    expect(summary.errors).toBe(1);
    expect(summary.topIssues[0]?.severity).toBe('error');
    expect(summary.topIssues[0]?.category).toBe('imports');
  });

  it('classifies JS shadow DOM bypass as errors', () => {
    const result = makeResult({
      totalIssues: 1,
      shadowDomJs: {
        issues: [
          {
            rule: 'no-shadow-root-access',
            line: 1,
            message: 'Do not access shadowRoot',
            suggestion: 'Use CSS parts',
            code: 'el.shadowRoot.querySelector(".inner")',
          },
        ],
        clean: false,
      },
    });
    const summary = summarizeValidation(result);
    expect(summary.errors).toBe(1);
  });

  it('classifies event usage issues as errors', () => {
    const result = makeResult({
      totalIssues: 1,
      eventUsage: {
        issues: [{ event: 'sl-click', message: 'Use addEventListener', line: 1 }],
        clean: false,
      },
    });
    const summary = summarizeValidation(result);
    expect(summary.errors).toBe(1);
  });

  it('classifies method call issues as errors', () => {
    const result = makeResult({
      totalIssues: 1,
      methodCalls: {
        issues: [
          {
            call: 'dialog.open()',
            message: 'open is a property',
            suggestion: 'Use dialog.open = true',
            line: 1,
          },
        ],
        clean: false,
      },
    });
    const summary = summarizeValidation(result);
    expect(summary.errors).toBe(1);
  });

  it('classifies a11y issues as warnings', () => {
    const result = makeResult({
      totalIssues: 1,
      a11yUsage: {
        issues: [{ rule: 'missing-label', message: 'Add aria-label', line: 1 }],
        clean: false,
      },
    });
    const summary = summarizeValidation(result);
    expect(summary.warnings).toBe(1);
    expect(summary.topIssues[0]?.severity).toBe('warning');
  });

  it('classifies token fallback issues as warnings', () => {
    const result = makeResult({
      totalIssues: 1,
      tokenFallbacks: {
        issues: [{ property: '--color', message: 'Missing fallback', line: 1 }],
        clean: false,
      },
    });
    const summary = summarizeValidation(result);
    expect(summary.warnings).toBe(1);
  });

  it('classifies theme compat issues as warnings', () => {
    const result = makeResult({
      totalIssues: 1,
      themeCompat: {
        issues: [
          {
            rule: 'hardcoded-theme-color',
            property: 'color',
            value: '#fff',
            message: 'Hardcoded color',
            line: 1,
          },
        ],
        clean: false,
      },
    });
    const summary = summarizeValidation(result);
    expect(summary.warnings).toBe(1);
  });

  it('classifies color contrast issues as warnings', () => {
    const result = makeResult({
      totalIssues: 1,
      colorContrast: {
        issues: [
          {
            rule: 'low-contrast-pair',
            selector: '.text',
            message: 'Low contrast',
            line: 1,
          },
        ],
        clean: false,
      },
    });
    const summary = summarizeValidation(result);
    expect(summary.warnings).toBe(1);
  });

  it('classifies specificity issues as info', () => {
    const result = makeResult({
      totalIssues: 1,
      specificity: {
        issues: [
          {
            type: 'important',
            selector: '.text',
            severity: 'warning',
            message: 'Avoid !important',
            line: 1,
          },
        ],
        summary: '1 issue found',
      },
    });
    const summary = summarizeValidation(result);
    expect(summary.info).toBe(1);
    expect(summary.topIssues[0]?.severity).toBe('info');
  });

  it('classifies transition animation issues as info', () => {
    const result = makeResult({
      totalIssues: 1,
      transitionAnimation: {
        issues: [
          {
            rule: 'host-transition',
            line: 1,
            message: 'Transition on host',
            suggestion: 'Use CSS custom properties',
            property: 'color',
            selector: 'my-button',
          },
        ],
        clean: false,
      },
    });
    const summary = summarizeValidation(result);
    expect(summary.info).toBe(1);
  });

  it('sorts topIssues by severity: errors first, then warnings, then info', () => {
    const result: ValidateComponentCodeResult = {
      clean: false,
      totalIssues: 3,
      specificity: {
        issues: [
          {
            type: 'important',
            selector: '.x',
            severity: 'warning',
            message: 'info issue',
            line: 1,
          },
        ],
        summary: '1 issue',
      },
      a11yUsage: {
        issues: [{ rule: 'missing-label', message: 'warning issue', line: 2 }],
        clean: false,
      },
      shadowDom: {
        issues: [
          {
            rule: 'no-descendant-piercing',
            line: 3,
            message: 'error issue',
            suggestion: 'fix',
            code: '.x {}',
          },
        ],
        clean: false,
      },
    };
    const summary = summarizeValidation(result);
    expect(summary.topIssues[0]?.severity).toBe('error');
    expect(summary.topIssues[1]?.severity).toBe('warning');
    expect(summary.topIssues[2]?.severity).toBe('info');
  });

  it('limits topIssues to 10 entries', () => {
    const manyIssues = Array.from({ length: 15 }, (_, i) => ({
      rule: 'no-descendant-piercing' as const,
      line: i + 1,
      message: `Issue ${i}`,
      suggestion: 'fix',
      code: `.x${i} {}`,
    }));
    const result = makeResult({
      totalIssues: 15,
      shadowDom: { issues: manyIssues, clean: false },
    });
    const summary = summarizeValidation(result);
    expect(summary.topIssues.length).toBeLessThanOrEqual(10);
  });

  it('includes a human-readable verdict string', () => {
    const result = makeResult({
      totalIssues: 3,
      shadowDom: {
        issues: [
          {
            rule: 'no-descendant-piercing',
            line: 1,
            message: 'Cannot pierce',
            suggestion: 'fix',
            code: '.x {}',
          },
        ],
        clean: false,
      },
      a11yUsage: {
        issues: [{ rule: 'missing-label', message: 'Add label', line: 2 }],
        clean: false,
      },
      specificity: {
        issues: [
          {
            rule: 'important',
            selector: '.x',
            message: '!important',
            suggestion: 'remove',
            line: 3,
          },
        ],
        summary: '1 issue',
      },
    });
    const summary = summarizeValidation(result);
    expect(typeof summary.verdict).toBe('string');
    expect(summary.verdict.length).toBeGreaterThan(0);
  });
});
