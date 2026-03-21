import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { validateCssFile } from '../../packages/core/src/handlers/css-file-validator.js';
import { CemSchema } from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

const FIXTURE_CEM: Cem = CemSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'custom-elements.json'), 'utf-8')),
);

// ─── Auto-detection ─────────────────────────────────────────────────────────

describe('validateCssFile — component auto-detection', () => {
  it('detects components from tag name selectors', () => {
    const result = validateCssFile('my-button { --my-button-bg: red; }', FIXTURE_CEM);
    expect(result.componentsFound).toContain('my-button');
  });

  it('detects components from ::part() selectors', () => {
    const result = validateCssFile('my-button::part(base) { color: red; }', FIXTURE_CEM);
    expect(result.componentsFound).toContain('my-button');
  });

  it('detects multiple components in one file', () => {
    const css = `
      my-button { --my-button-bg: red; }
      my-card { padding: 1rem; }
    `;
    const result = validateCssFile(css, FIXTURE_CEM);
    expect(result.componentsFound).toContain('my-button');
    expect(result.componentsFound).toContain('my-card');
  });

  it('ignores selectors for non-component elements', () => {
    const result = validateCssFile('.wrapper { display: flex; } div { margin: 0; }', FIXTURE_CEM);
    expect(result.componentsFound).toHaveLength(0);
  });
});

// ─── Per-component validation ───────────────────────────────────────────────

describe('validateCssFile — per-component validation', () => {
  it('validates each component separately', () => {
    const css = `
      my-button::part(base) { color: red; }
      my-button::part(nonexistent) { color: blue; }
    `;
    const result = validateCssFile(css, FIXTURE_CEM);
    expect(result.components['my-button']).toBeDefined();
    expect(result.components['my-button']!.issues.length).toBeGreaterThan(0);
  });

  it('catches shadow DOM violations per component', () => {
    const css = 'my-button .inner { color: red; }';
    const result = validateCssFile(css, FIXTURE_CEM);
    const buttonResult = result.components['my-button'];
    expect(buttonResult).toBeDefined();
    expect(buttonResult!.issues.some((i) => i.category === 'shadowDom')).toBe(true);
  });
});

// ─── Global issues ──────────────────────────────────────────────────────────

describe('validateCssFile — global CSS issues', () => {
  it('catches !important as a global issue', () => {
    const css = 'my-button { color: red !important; }';
    const result = validateCssFile(css, FIXTURE_CEM);
    expect(result.globalIssues.some((i) => i.category === 'specificity')).toBe(true);
  });

  it('catches color contrast issues globally', () => {
    const css = 'my-button { color: #eeeeee; background: #ffffff; }';
    const result = validateCssFile(css, FIXTURE_CEM);
    expect(result.globalIssues.some((i) => i.category === 'colorContrast')).toBe(true);
  });
});

// ─── Verdict ────────────────────────────────────────────────────────────────

describe('validateCssFile — verdict', () => {
  it('returns clean for valid CSS', () => {
    const css = 'my-button::part(base) { font-weight: bold; }';
    const result = validateCssFile(css, FIXTURE_CEM);
    expect(result.clean).toBe(true);
  });

  it('returns not clean for invalid CSS', () => {
    const css = 'my-button .inner { color: red; }';
    const result = validateCssFile(css, FIXTURE_CEM);
    expect(result.clean).toBe(false);
  });

  it('includes a verdict string', () => {
    const css = 'my-button .inner { color: red; }';
    const result = validateCssFile(css, FIXTURE_CEM);
    expect(typeof result.verdict).toBe('string');
    expect(result.verdict.length).toBeGreaterThan(0);
  });

  it('includes total issue count', () => {
    const css = 'my-button .inner { color: red; }';
    const result = validateCssFile(css, FIXTURE_CEM);
    expect(result.totalIssues).toBeGreaterThan(0);
  });
});
