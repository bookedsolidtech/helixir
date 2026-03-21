import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateComponentCode } from '../../packages/core/src/handlers/code-validator.js';

const FIXTURE_CEM = resolve(import.meta.dirname, '../__fixtures__/custom-elements.json');
const cem = JSON.parse(readFileSync(FIXTURE_CEM, 'utf-8'));

// ─── Clean code passes all validators ───────────────────────────────────────

describe('validate_component_code — clean code', () => {
  it('passes with correct HTML, CSS custom properties, and proper events', () => {
    const result = validateComponentCode({
      html: '<my-button>Click me</my-button>',
      css: 'my-button { --my-button-color: var(--brand-color, #333); }',
      code: `const btn = document.querySelector('my-button');`,
      tagName: 'my-button',
      cem,
    });
    expect(result.clean).toBe(true);
    expect(result.totalIssues).toBe(0);
  });
});

// ─── Common mistake: descendant selector piercing shadow DOM ────────────────

describe('validate_component_code — shadow DOM mistakes', () => {
  it('catches descendant selector piercing shadow DOM', () => {
    const result = validateComponentCode({
      html: '<my-button>Click</my-button>',
      css: 'my-button .button-label { color: red; }',
      tagName: 'my-button',
      cem,
    });
    expect(result.clean).toBe(false);
    expect(result.shadowDom).toBeDefined();
    expect(result.shadowDom!.issues.length).toBeGreaterThan(0);
  });
});

// ─── Common mistake: !important on component CSS ────────────────────────────

describe('validate_component_code — specificity issues', () => {
  it('catches !important on component styling', () => {
    const result = validateComponentCode({
      html: '<my-button>Click</my-button>',
      css: 'my-button { --my-button-color: red !important; }',
      tagName: 'my-button',
      cem,
    });
    expect(result.clean).toBe(false);
    expect(result.specificity).toBeDefined();
  });
});

// ─── Common mistake: hardcoded colors breaking dark mode ────────────────────

describe('validate_component_code — theme issues', () => {
  it('catches hardcoded colors via specificity + layout checks', () => {
    // The theme checker detects hardcoded colors on theme-sensitive properties
    // Testing with a pattern that triggers multiple CSS validators
    const result = validateComponentCode({
      html: '<my-card>Content</my-card>',
      css: 'my-card { display: grid; background: #ffffff; color: #000000; overflow: hidden; }',
      tagName: 'my-card',
      cem,
    });
    expect(result.clean).toBe(false);
    // Layout checker catches display + overflow on host
    expect(result.layout).toBeDefined();
    expect(result.layout!.issues.length).toBeGreaterThan(0);
  });
});

// ─── Common mistake: display override on host ───────────────────────────────

describe('validate_component_code — layout issues', () => {
  it('catches display override on web component host', () => {
    const result = validateComponentCode({
      html: '<my-card>Content</my-card>',
      css: 'my-card { display: flex; width: 400px; }',
      tagName: 'my-card',
      cem,
    });
    expect(result.clean).toBe(false);
    expect(result.layout).toBeDefined();
  });
});

// ─── Common mistake: inline styles on web components ────────────────────────

describe('validate_component_code — inline styles', () => {
  it('catches inline style attributes on web components', () => {
    const result = validateComponentCode({
      html: '<my-button style="color: red;">Click</my-button>',
      tagName: 'my-button',
      cem,
    });
    expect(result.clean).toBe(false);
    expect(result.specificity).toBeDefined();
    expect(result.specificity!.issues.some((i) => i.type === 'inline-style')).toBe(true);
  });
});

// ─── Common mistake: missing var() fallback ─────────────────────────────────

describe('validate_component_code — token fallbacks', () => {
  it('catches hardcoded hex color on color property', () => {
    const result = validateComponentCode({
      html: '<my-button>Click</my-button>',
      css: `my-button {
  color: #ff0000;
  background: #0000ff;
}`,
      tagName: 'my-button',
      cem,
    });
    expect(result.clean).toBe(false);
    // Theme checker catches hardcoded colors on theme-sensitive properties
    expect(result.themeCompat).toBeDefined();
    expect(result.themeCompat!.issues.length).toBeGreaterThan(0);
  });
});

// ─── Aggregation: multiple issues detected at once ──────────────────────────

describe('validate_component_code — multiple issues', () => {
  it('catches shadow DOM, specificity, theme, and layout issues in one call', () => {
    const result = validateComponentCode({
      html: '<my-card style="padding: 20px;">Content</my-card>',
      css: `
        #app my-card .inner { color: red !important; }
        my-card { display: grid; background: white; width: 500px; }
      `,
      tagName: 'my-card',
      cem,
    });
    expect(result.clean).toBe(false);
    expect(result.totalIssues).toBeGreaterThanOrEqual(3);
  });
});

// ─── Result completeness ────────────────────────────────────────────────────

describe('validate_component_code — result structure', () => {
  it('includes all possible result fields', () => {
    const result = validateComponentCode({
      html: '<my-button>Click</my-button>',
      css: 'my-button { color: red; }',
      code: `const btn = document.querySelector('my-button');`,
      tagName: 'my-button',
      cem,
    });
    expect(result).toHaveProperty('clean');
    expect(result).toHaveProperty('totalIssues');
    expect(typeof result.clean).toBe('boolean');
    expect(typeof result.totalIssues).toBe('number');
  });
});
