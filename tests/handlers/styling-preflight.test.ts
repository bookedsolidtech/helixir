import { describe, it, expect } from 'vitest';
import { runStylingPreflight } from '../../packages/core/src/handlers/styling-preflight.js';
import type { ComponentMetadata } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const buttonMeta: ComponentMetadata = {
  tagName: 'hx-button',
  name: 'HxButton',
  description: 'A button component',
  members: [
    {
      name: 'variant',
      kind: 'field',
      type: "'primary' | 'secondary' | 'danger'",
      description: 'Visual style variant',
    },
    {
      name: 'disabled',
      kind: 'field',
      type: 'boolean',
      description: 'Disables the button',
    },
  ],
  events: [{ name: 'hx-click', type: 'CustomEvent', description: 'Fired on click' }],
  slots: [
    { name: '', description: 'Default slot for label text' },
    { name: 'prefix', description: 'Icon before the label' },
  ],
  cssProperties: [
    { name: '--hx-button-bg', description: 'Background color' },
    { name: '--hx-button-color', description: 'Text color' },
    { name: '--hx-button-radius', description: 'Border radius', default: '4px' },
  ],
  cssParts: [
    { name: 'base', description: 'The button wrapper' },
    { name: 'label', description: 'The label container' },
  ],
};

const bareMeta: ComponentMetadata = {
  tagName: 'x-bare',
  name: 'XBare',
  description: 'A bare component with no CSS API',
  members: [],
  events: [],
  slots: [],
  cssProperties: [],
  cssParts: [],
};

// ─── Result Shape ────────────────────────────────────────────────────────────

describe('runStylingPreflight — result shape', () => {
  it('returns component API summary', () => {
    const result = runStylingPreflight({
      css: 'hx-button { --hx-button-bg: blue; }',
      meta: buttonMeta,
    });
    expect(result.componentApi.tagName).toBe('hx-button');
    expect(result.componentApi.parts).toEqual(['base', 'label']);
    expect(result.componentApi.tokens).toEqual([
      '--hx-button-bg',
      '--hx-button-color',
      '--hx-button-radius',
    ]);
    expect(result.componentApi.slots).toEqual(['(default)', 'prefix']);
  });

  it('returns resolution results', () => {
    const result = runStylingPreflight({
      css: 'hx-button::part(base) { --hx-button-bg: blue; }',
      meta: buttonMeta,
    });
    expect(result.resolution).toBeDefined();
    expect(result.resolution.valid).toBe(true);
  });

  it('returns issues array', () => {
    const result = runStylingPreflight({
      css: 'hx-button .inner { color: red; }',
      meta: buttonMeta,
    });
    expect(result.issues).toBeDefined();
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('returns correct CSS snippet', () => {
    const result = runStylingPreflight({
      css: '',
      meta: buttonMeta,
    });
    expect(result.correctSnippet).toBeDefined();
    expect(result.correctSnippet).toContain('hx-button');
  });
});

// ─── Validation Integration ──────────────────────────────────────────────────

describe('runStylingPreflight — validation', () => {
  it('catches descendant selector piercing shadow DOM', () => {
    const result = runStylingPreflight({
      css: 'hx-button .inner { color: red; }',
      meta: buttonMeta,
    });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.category === 'shadowDom')).toBe(true);
  });

  it('catches unknown ::part() names', () => {
    const result = runStylingPreflight({
      css: 'hx-button::part(footer) { color: red; }',
      meta: buttonMeta,
    });
    expect(result.resolution.valid).toBe(false);
    expect(result.resolution.parts.resolved[0]?.valid).toBe(false);
  });

  it('catches unknown CSS custom properties', () => {
    const result = runStylingPreflight({
      css: 'hx-button { --hx-button-fake: red; }',
      meta: buttonMeta,
    });
    expect(result.resolution.valid).toBe(false);
    expect(result.resolution.tokens.resolved[0]?.valid).toBe(false);
  });

  it('catches hardcoded colors in theme-sensitive properties', () => {
    const result = runStylingPreflight({
      css: 'hx-button { color: #333333; background: white; }',
      meta: buttonMeta,
    });
    expect(result.issues.some((i) => i.category === 'themeCompat')).toBe(true);
  });

  it('reports clean for valid CSS', () => {
    const result = runStylingPreflight({
      css: 'hx-button::part(base) { --hx-button-bg: var(--my-theme-color, blue); }',
      meta: buttonMeta,
    });
    expect(result.resolution.valid).toBe(true);
  });
});

// ─── HTML Validation ─────────────────────────────────────────────────────────

describe('runStylingPreflight — HTML validation', () => {
  it('validates slot names in HTML', () => {
    const result = runStylingPreflight({
      css: '',
      html: '<hx-button><span slot="nonexistent">X</span></hx-button>',
      meta: buttonMeta,
    });
    expect(result.resolution.slots.resolved[0]?.valid).toBe(false);
  });

  it('validates valid slot names', () => {
    const result = runStylingPreflight({
      css: '',
      html: '<hx-button><span slot="prefix">X</span></hx-button>',
      meta: buttonMeta,
    });
    expect(result.resolution.slots.resolved[0]?.valid).toBe(true);
  });
});

// ─── Bare Components ─────────────────────────────────────────────────────────

describe('runStylingPreflight — bare component', () => {
  it('warns when trying to style a component with no CSS API', () => {
    const result = runStylingPreflight({
      css: 'x-bare::part(base) { color: red; }',
      meta: bareMeta,
    });
    expect(result.componentApi.hasStyleApi).toBe(false);
    expect(result.resolution.valid).toBe(false);
  });

  it('returns empty API surface', () => {
    const result = runStylingPreflight({
      css: '',
      meta: bareMeta,
    });
    expect(result.componentApi.parts).toHaveLength(0);
    expect(result.componentApi.tokens).toHaveLength(0);
    expect(result.componentApi.slots).toHaveLength(0);
  });
});

// ─── Overall Verdict ─────────────────────────────────────────────────────────

describe('runStylingPreflight — verdict', () => {
  it('includes a human-readable verdict', () => {
    const result = runStylingPreflight({
      css: 'hx-button .inner { color: red; }',
      meta: buttonMeta,
    });
    expect(typeof result.verdict).toBe('string');
    expect(result.verdict.length).toBeGreaterThan(0);
  });

  it('reports pass verdict for clean CSS', () => {
    const result = runStylingPreflight({
      css: 'hx-button { --hx-button-bg: blue; }',
      meta: buttonMeta,
    });
    expect(result.verdict).toContain('pass');
  });

  it('reports fail verdict for issues', () => {
    const result = runStylingPreflight({
      css: 'hx-button .inner { color: red; }',
      meta: buttonMeta,
    });
    expect(result.verdict.toLowerCase()).toMatch(/fail|issue|error/);
  });
});
