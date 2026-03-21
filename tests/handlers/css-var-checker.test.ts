import { describe, it, expect } from 'vitest';
import { checkCssVars } from '../../packages/core/src/handlers/css-var-checker.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fixture: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module' as const,
      path: 'src/my-button.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyButton',
          tagName: 'my-button',
          members: [],
          events: [],
          slots: [],
          cssProperties: [
            {
              name: '--my-button-color',
              description: 'The button text color.',
              default: 'var(--my-color-primary)',
            },
            {
              name: '--my-button-bg',
              description: 'The button background.',
            },
            {
              name: '--my-button-border-radius',
              description: 'The button border radius.',
              default: '4px',
            },
          ],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-card.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyCard',
          tagName: 'my-card',
          members: [],
          events: [],
          slots: [],
          cssProperties: [
            { name: '--my-card-padding', description: 'Card padding.' },
            { name: '--my-card-shadow', description: 'Card box shadow.' },
          ],
          cssParts: [],
        },
      ],
    },
  ],
};

// ─── Valid usage ────────────────────────────────────────────────────────────

describe('checkCssVars — valid usage', () => {
  it('reports no issues for known properties', () => {
    const css = `my-button {
  --my-button-color: red;
  --my-button-bg: blue;
}`;
    const result = checkCssVars(css, 'my-button', fixture);
    expect(result.issues).toHaveLength(0);
    expect(result.clean).toBe(true);
  });

  it('handles var() references gracefully', () => {
    const css = `my-button {
  --my-button-color: var(--my-theme-primary);
}`;
    const result = checkCssVars(css, 'my-button', fixture);
    expect(result.issues).toHaveLength(0);
  });
});

// ─── Unknown properties ────────────────────────────────────────────────────

describe('checkCssVars — unknown properties', () => {
  it('flags unknown custom properties', () => {
    const css = `my-button {
  --my-button-shadow: 0 2px 4px;
}`;
    const result = checkCssVars(css, 'my-button', fixture);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.property).toBe('--my-button-shadow');
    expect(result.issues[0]?.rule).toBe('unknown-property');
    expect(result.clean).toBe(false);
  });

  it('suggests close matches for typos', () => {
    const css = `my-button {
  --my-button-colr: red;
}`;
    const result = checkCssVars(css, 'my-button', fixture);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.suggestion).toBe('--my-button-color');
  });

  it('detects multiple unknown properties', () => {
    const css = `my-button {
  --my-button-shadow: none;
  --my-button-font: sans-serif;
}`;
    const result = checkCssVars(css, 'my-button', fixture);
    expect(result.issues).toHaveLength(2);
  });
});

// ─── !important anti-pattern ───────────────────────────────────────────────

describe('checkCssVars — !important', () => {
  it('flags !important on custom properties', () => {
    const css = `my-button {
  --my-button-color: red !important;
}`;
    const result = checkCssVars(css, 'my-button', fixture);
    const importantIssues = result.issues.filter((i) => i.rule === 'important-on-token');
    expect(importantIssues).toHaveLength(1);
    expect(importantIssues[0]?.property).toBe('--my-button-color');
  });

  it('no issue for known property without !important', () => {
    const css = `my-button {
  --my-button-color: red;
}`;
    const result = checkCssVars(css, 'my-button', fixture);
    expect(result.issues.filter((i) => i.rule === 'important-on-token')).toHaveLength(0);
  });
});

// ─── Result structure ──────────────────────────────────────────────────────

describe('checkCssVars — result structure', () => {
  it('returns knownProperties list', () => {
    const css = `my-button { --my-button-color: red; }`;
    const result = checkCssVars(css, 'my-button', fixture);
    expect(result.knownProperties).toContain('--my-button-color');
  });

  it('includes line numbers', () => {
    const css = `my-button {
  --my-button-unknown: red;
}`;
    const result = checkCssVars(css, 'my-button', fixture);
    expect(result.issues[0]?.line).toBe(2);
  });

  it('handles single-line CSS', () => {
    const css = 'my-button { --my-button-unknown: red; }';
    const result = checkCssVars(css, 'my-button', fixture);
    expect(result.issues.some((i) => i.rule === 'unknown-property')).toBe(true);
  });

  it('includes default values when known', () => {
    const css = `my-button { --my-button-border-radius: 8px; }`;
    const result = checkCssVars(css, 'my-button', fixture);
    expect(result.defaultValues).toBeDefined();
    expect(result.defaultValues?.['--my-button-border-radius']).toBe('4px');
  });
});
