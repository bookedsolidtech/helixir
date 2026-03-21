import { describe, it, expect } from 'vitest';
import { checkCssScope } from '../../packages/core/src/handlers/scope-checker.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURE_CEM = resolve(import.meta.dirname, '../__fixtures__/custom-elements.json');
const fixture = JSON.parse(readFileSync(FIXTURE_CEM, 'utf-8'));

// ─── Correctly scoped tokens ────────────────────────────────────────────────

describe('checkCssScope — correct scoping', () => {
  it('returns clean for component tokens on the component host', () => {
    const css = `my-button {
  --my-button-color: red;
  --my-button-bg: blue;
}`;
    const result = checkCssScope(css, 'my-button', fixture);
    expect(result.clean).toBe(true);
  });

  it('returns clean for design system tokens on :root', () => {
    const css = `:root {
  --app-primary: #3b82f6;
  --app-surface: #ffffff;
}`;
    const result = checkCssScope(css, 'my-button', fixture);
    expect(result.clean).toBe(true);
  });
});

// ─── Scope mismatches ───────────────────────────────────────────────────────

describe('checkCssScope — scope mismatches', () => {
  it('catches component tokens on :root', () => {
    const css = `:root {
  --my-button-color: red;
}`;
    const result = checkCssScope(css, 'my-button', fixture);
    expect(result.clean).toBe(false);
    expect(result.issues.some((i) => i.rule === 'scope-mismatch')).toBe(true);
    expect(result.issues[0]?.message).toContain('my-button');
  });

  it('catches component tokens on html selector', () => {
    const css = `html {
  --my-button-color: red;
}`;
    const result = checkCssScope(css, 'my-button', fixture);
    expect(result.clean).toBe(false);
  });

  it('catches component tokens on body selector', () => {
    const css = `body {
  --my-button-bg: blue;
}`;
    const result = checkCssScope(css, 'my-button', fixture);
    expect(result.clean).toBe(false);
  });

  it('catches component tokens on * selector', () => {
    const css = `* {
  --my-button-color: red;
}`;
    const result = checkCssScope(css, 'my-button', fixture);
    expect(result.clean).toBe(false);
  });
});

// ─── Single-line CSS ────────────────────────────────────────────────────────

describe('checkCssScope — single-line CSS', () => {
  it('catches scope mismatch in single-line CSS', () => {
    const css = ':root { --my-button-color: red; }';
    const result = checkCssScope(css, 'my-button', fixture);
    expect(result.clean).toBe(false);
  });
});

// ─── Result structure ───────────────────────────────────────────────────────

describe('checkCssScope — result structure', () => {
  it('returns expected fields', () => {
    const css = 'my-button { --my-button-color: red; }';
    const result = checkCssScope(css, 'my-button', fixture);
    expect(result).toHaveProperty('clean');
    expect(result).toHaveProperty('issues');
    expect(typeof result.clean).toBe('boolean');
    expect(Array.isArray(result.issues)).toBe(true);
  });
});
