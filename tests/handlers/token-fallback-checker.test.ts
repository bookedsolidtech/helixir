import { describe, it, expect } from 'vitest';
import { checkTokenFallbacks } from '../../packages/core/src/handlers/token-fallback-checker.js';
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
            { name: '--my-button-color', description: 'Text color.' },
            { name: '--my-button-bg', description: 'Background color.' },
            { name: '--my-button-border-color', description: 'Border color.' },
            { name: '--my-button-radius', description: 'Border radius.' },
            { name: '--my-button-font-size', description: 'Font size.' },
          ],
          cssParts: [{ name: 'base', description: 'The wrapper.' }],
        },
      ],
    },
  ],
};

// ─── Clean usage ──────────────────────────────────────────────────────────────

describe('checkTokenFallbacks — clean usage', () => {
  it('returns clean when all var() calls have fallbacks', () => {
    const css = `my-button {
  --my-button-color: var(--app-text, #333);
  --my-button-bg: var(--app-surface, white);
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    expect(result.clean).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns clean for var() with nested fallback chains', () => {
    const css = `my-button {
  --my-button-color: var(--brand-text, var(--app-text, #333));
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    const missingFallback = result.issues.filter((i) => i.rule === 'missing-fallback');
    expect(missingFallback).toHaveLength(0);
  });

  it('returns clean for plain non-color values (no var() calls)', () => {
    const css = `my-button {
  --my-button-radius: 4px;
  --my-button-font-size: 16px;
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    expect(result.clean).toBe(true);
  });
});

// ─── Missing fallback detection ──────────────────────────────────────────────

describe('checkTokenFallbacks — missing fallbacks', () => {
  it('catches var() without a fallback value', () => {
    const css = `my-button {
  --my-button-color: var(--app-text);
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    expect(result.issues.some((i) => i.rule === 'missing-fallback')).toBe(true);
    expect(result.issues[0]?.property).toBe('--app-text');
  });

  it('catches multiple missing fallbacks', () => {
    const css = `my-button {
  --my-button-color: var(--app-text);
  --my-button-bg: var(--app-surface);
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    const missing = result.issues.filter((i) => i.rule === 'missing-fallback');
    expect(missing).toHaveLength(2);
  });

  it('does NOT flag known component tokens used as values without fallback', () => {
    // Using a known token from the CEM as the var() reference is fine — it's a self-reference
    const css = `my-button {
  color: var(--my-button-color);
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    const missing = result.issues.filter((i) => i.rule === 'missing-fallback');
    expect(missing).toHaveLength(0);
  });
});

// ─── Hardcoded color detection ──────────────────────────────────────────────

describe('checkTokenFallbacks — hardcoded colors', () => {
  it('catches hardcoded hex colors on color properties', () => {
    const css = `my-button {
  --my-button-color: #ff0000;
  --my-button-bg: #ffffff;
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    const hardcoded = result.issues.filter((i) => i.rule === 'hardcoded-color');
    expect(hardcoded).toHaveLength(2);
  });

  it('catches hardcoded rgb/rgba colors', () => {
    const css = `my-button {
  --my-button-color: rgb(255, 0, 0);
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    const hardcoded = result.issues.filter((i) => i.rule === 'hardcoded-color');
    expect(hardcoded).toHaveLength(1);
  });

  it('catches hardcoded hsl/hsla colors', () => {
    const css = `my-button {
  --my-button-bg: hsl(0, 100%, 50%);
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    const hardcoded = result.issues.filter((i) => i.rule === 'hardcoded-color');
    expect(hardcoded).toHaveLength(1);
  });

  it('catches hardcoded colors in single-line CSS', () => {
    const css = 'my-button { --my-button-color: #ff0000; --my-button-bg: #ffffff; }';
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    const hardcoded = result.issues.filter((i) => i.rule === 'hardcoded-color');
    expect(hardcoded).toHaveLength(2);
  });

  it('does NOT flag non-color properties for hardcoded colors', () => {
    const css = `my-button {
  --my-button-radius: 4px;
  --my-button-font-size: 14px;
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    const hardcoded = result.issues.filter((i) => i.rule === 'hardcoded-color');
    expect(hardcoded).toHaveLength(0);
  });

  it('does NOT flag hardcoded colors used as fallbacks in var()', () => {
    const css = `my-button {
  --my-button-color: var(--app-text, #333);
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    const hardcoded = result.issues.filter((i) => i.rule === 'hardcoded-color');
    expect(hardcoded).toHaveLength(0);
  });
});

// ─── Theme-hostile patterns ─────────────────────────────────────────────────

describe('checkTokenFallbacks — theme-hostile patterns', () => {
  it('detects color properties set to named colors without tokens', () => {
    const css = `my-button {
  --my-button-color: black;
  --my-button-bg: white;
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    const hostile = result.issues.filter((i) => i.rule === 'hardcoded-color');
    expect(hostile).toHaveLength(2);
  });
});

// ─── Result structure ───────────────────────────────────────────────────────

describe('checkTokenFallbacks — result structure', () => {
  it('includes summary stats', () => {
    const css = `my-button {
  --my-button-color: var(--app-text);
  --my-button-bg: #fff;
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    expect(result.totalVarCalls).toBeGreaterThanOrEqual(1);
    expect(typeof result.totalVarCalls).toBe('number');
    expect(typeof result.clean).toBe('boolean');
  });

  it('includes line numbers for issues', () => {
    const css = `my-button {
  --my-button-color: var(--app-text);
}`;
    const result = checkTokenFallbacks(css, 'my-button', fixture);
    expect(result.issues[0]?.line).toBe(2);
  });
});
