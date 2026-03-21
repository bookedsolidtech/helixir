import { describe, it, expect } from 'vitest';
import { suggestFix } from '../../packages/core/src/handlers/suggest-fix.js';

// ─── Shadow DOM selector fixes ──────────────────────────────────────────────

describe('suggestFix — Shadow DOM selectors', () => {
  it('suggests ::part() for descendant selectors piercing shadow DOM', () => {
    const result = suggestFix({
      type: 'shadow-dom',
      issue: 'descendant-piercing',
      original: 'sl-button .button-label { color: red; }',
      tagName: 'sl-button',
      partNames: ['base', 'label', 'prefix', 'suffix'],
    });
    expect(result.suggestion).toContain('::part(');
    expect(result.explanation).toBeTruthy();
    expect(result.severity).toBe('error');
  });

  it('suggests host selector for direct element styling', () => {
    const result = suggestFix({
      type: 'shadow-dom',
      issue: 'direct-element-styling',
      original: 'sl-button button { background: blue; }',
      tagName: 'sl-button',
      partNames: ['base'],
    });
    expect(result.suggestion).toContain('::part(base)');
  });
});

// ─── Token fallback fixes ───────────────────────────────────────────────────

describe('suggestFix — token fallbacks', () => {
  it('adds fallback value to bare var() call', () => {
    const result = suggestFix({
      type: 'token-fallback',
      issue: 'missing-fallback',
      original: 'color: var(--sl-color-primary-600);',
    });
    expect(result.suggestion).toContain('var(--sl-color-primary-600,');
    expect(result.severity).toBe('warning');
  });

  it('replaces hardcoded color with var()', () => {
    const result = suggestFix({
      type: 'token-fallback',
      issue: 'hardcoded-color',
      original: 'background-color: #3b82f6;',
      property: 'background-color',
    });
    expect(result.suggestion).toContain('var(');
    expect(result.explanation).toContain('token');
  });
});

// ─── Theme compatibility fixes ──────────────────────────────────────────────

describe('suggestFix — theme compatibility', () => {
  it('suggests var() replacement for hardcoded background', () => {
    const result = suggestFix({
      type: 'theme-compat',
      issue: 'hardcoded-color',
      original: 'background: white;',
      property: 'background',
    });
    expect(result.suggestion).toContain('var(');
    expect(result.severity).toBe('warning');
  });

  it('suggests contrast-safe pairing for light-on-light', () => {
    const result = suggestFix({
      type: 'theme-compat',
      issue: 'contrast-pair',
      original: 'background: #f0f0f0; color: #e0e0e0;',
    });
    expect(result.explanation).toContain('contrast');
  });
});

// ─── Method call fixes ──────────────────────────────────────────────────────

describe('suggestFix — method calls', () => {
  it('suggests property assignment for property-as-method', () => {
    const result = suggestFix({
      type: 'method-call',
      issue: 'property-as-method',
      original: 'dialog.open();',
      memberName: 'open',
      tagName: 'sl-dialog',
    });
    expect(result.suggestion).toContain('dialog.open = true');
    expect(result.severity).toBe('error');
  });

  it('suggests method call for method-as-property', () => {
    const result = suggestFix({
      type: 'method-call',
      issue: 'method-as-property',
      original: 'dialog.show = true;',
      memberName: 'show',
      tagName: 'sl-dialog',
    });
    expect(result.suggestion).toContain('.show()');
  });

  it('suggests correct name for typos', () => {
    const result = suggestFix({
      type: 'method-call',
      issue: 'typo',
      original: 'dialog.hde();',
      memberName: 'hde',
      suggestedName: 'hide',
    });
    expect(result.suggestion).toContain('hide');
  });
});

// ─── Event usage fixes ──────────────────────────────────────────────────────

describe('suggestFix — event usage', () => {
  it('suggests addEventListener for React onXxx prop on custom event', () => {
    const result = suggestFix({
      type: 'event-usage',
      issue: 'react-custom-event',
      original: '<SlButton onSlClick={handler}>',
      eventName: 'sl-click',
    });
    expect(result.suggestion).toContain('addEventListener');
    expect(result.explanation).toContain('React');
  });
});

// ─── Result structure ───────────────────────────────────────────────────────

describe('suggestFix — result structure', () => {
  it('always returns suggestion, explanation, and severity', () => {
    const result = suggestFix({
      type: 'shadow-dom',
      issue: 'descendant-piercing',
      original: 'sl-button .inner { color: red; }',
      tagName: 'sl-button',
      partNames: ['base'],
    });
    expect(result).toHaveProperty('suggestion');
    expect(result).toHaveProperty('explanation');
    expect(result).toHaveProperty('severity');
    expect(['error', 'warning', 'info']).toContain(result.severity);
  });

  it('returns original code in the result', () => {
    const result = suggestFix({
      type: 'shadow-dom',
      issue: 'descendant-piercing',
      original: 'sl-button .inner { color: red; }',
      tagName: 'sl-button',
      partNames: ['base'],
    });
    expect(result.original).toBe('sl-button .inner { color: red; }');
  });
});
