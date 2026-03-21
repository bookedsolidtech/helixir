import { describe, it, expect } from 'vitest';
import {
  detectThemeSupport,
  categorizeTokens,
} from '../../packages/core/src/handlers/theme-detection.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCem(cssProperties: Array<{ name: string; description: string }>): Cem {
  return {
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
            cssProperties,
            cssParts: [],
          },
        ],
      },
    ],
  };
}

const richCem = makeCem([
  { name: '--my-color-primary', description: 'Primary color' },
  { name: '--my-color-secondary', description: 'Secondary color' },
  { name: '--my-color-text', description: 'Text color' },
  { name: '--my-color-bg', description: 'Background color' },
  { name: '--my-spacing-sm', description: 'Small spacing' },
  { name: '--my-spacing-md', description: 'Medium spacing' },
  { name: '--my-spacing-lg', description: 'Large spacing' },
  { name: '--my-font-family', description: 'Font family' },
  { name: '--my-font-size-base', description: 'Base font size' },
  { name: '--my-border-radius-sm', description: 'Small border radius' },
  { name: '--my-elevation-1', description: 'Low elevation shadow' },
  { name: '--my-z-index-modal', description: 'Modal z-index' },
]);

const colorOnlyCem = makeCem([
  { name: '--my-color-red', description: 'Red' },
  { name: '--my-color-blue', description: 'Blue' },
]);

const emptyCem = makeCem([]);

// ─── Token Categorization ───────────────────────────────────────────────────

describe('categorizeTokens', () => {
  it('groups tokens into standard categories', () => {
    const cats = categorizeTokens(richCem);
    expect(cats.color.length).toBeGreaterThanOrEqual(4);
    expect(cats.spacing.length).toBe(3);
    expect(cats.typography.length).toBe(2);
    expect(cats.borderRadius.length).toBe(1);
    expect(cats.elevation.length).toBe(1);
  });

  it('returns empty arrays for empty CEM', () => {
    const cats = categorizeTokens(emptyCem);
    expect(cats.color).toHaveLength(0);
    expect(cats.spacing).toHaveLength(0);
    expect(cats.typography).toHaveLength(0);
  });

  it('categorizes tokens based on name segments', () => {
    const cats = categorizeTokens(colorOnlyCem);
    expect(cats.color.length).toBe(2);
    expect(cats.spacing.length).toBe(0);
  });
});

// ─── Theme Support Detection ────────────────────────────────────────────────

describe('detectThemeSupport', () => {
  it('returns tokenPrefix detected from CEM', () => {
    const result = detectThemeSupport(richCem);
    expect(result.tokenPrefix).toBe('--my-');
  });

  it('returns category coverage', () => {
    const result = detectThemeSupport(richCem);
    expect(result.categories).toBeDefined();
    expect(result.categories.color).toBeGreaterThanOrEqual(4);
    expect(result.categories.spacing).toBe(3);
  });

  it('detects semantic naming patterns', () => {
    const result = detectThemeSupport(richCem);
    expect(result.semanticNaming).toBe(true);
  });

  it('reports non-semantic naming for raw color names', () => {
    const result = detectThemeSupport(colorOnlyCem);
    expect(result.semanticNaming).toBe(false);
  });

  it('returns totalTokens count', () => {
    const result = detectThemeSupport(richCem);
    expect(result.totalTokens).toBe(12);
  });

  it('returns totalTokens = 0 for empty CEM', () => {
    const result = detectThemeSupport(emptyCem);
    expect(result.totalTokens).toBe(0);
  });

  it('detects dark mode readiness based on token patterns', () => {
    const darkModeCem = makeCem([
      { name: '--my-color-primary', description: 'Primary color' },
      { name: '--my-color-bg', description: 'Background' },
      { name: '--my-color-text', description: 'Text' },
      { name: '--my-color-surface', description: 'Surface color' },
    ]);
    const result = detectThemeSupport(darkModeCem);
    expect(result.darkModeReady).toBe(true);
  });

  it('reports not dark-mode-ready when only decorative tokens', () => {
    const result = detectThemeSupport(colorOnlyCem);
    expect(result.darkModeReady).toBe(false);
  });

  it('includes theming recommendations', () => {
    const result = detectThemeSupport(richCem);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it('returns coverageScore between 0 and 100', () => {
    const result = detectThemeSupport(richCem);
    expect(result.coverageScore).toBeGreaterThanOrEqual(0);
    expect(result.coverageScore).toBeLessThanOrEqual(100);
  });
});
