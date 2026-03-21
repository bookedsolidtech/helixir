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

// ─── Shadow DOM advanced fixes ──────────────────────────────────────────────

describe('suggestFix — Shadow DOM advanced', () => {
  it('suggests CSS custom properties for deprecated /deep/ combinator', () => {
    const result = suggestFix({
      type: 'shadow-dom',
      issue: 'deprecated-deep',
      original: 'my-button /deep/ .inner { color: red; }',
      tagName: 'my-button',
      partNames: ['base'],
    });
    expect(result.suggestion).toContain('::part(');
    expect(result.explanation).toContain('deprecated');
    expect(result.severity).toBe('error');
  });

  it('suggests removing class after ::part()', () => {
    const result = suggestFix({
      type: 'shadow-dom',
      issue: 'part-structural',
      original: 'my-button::part(base).active { color: red; }',
      tagName: 'my-button',
    });
    expect(result.explanation).toContain('class');
    expect(result.severity).toBe('error');
  });

  it('suggests exportparts for ::part() chaining', () => {
    const result = suggestFix({
      type: 'shadow-dom',
      issue: 'part-chain',
      original: 'my-card::part(body)::part(inner) { color: red; }',
      tagName: 'my-card',
    });
    expect(result.explanation).toContain('exportparts');
    expect(result.severity).toBe('error');
  });

  it('suggests alternative to display:contents on host', () => {
    const result = suggestFix({
      type: 'shadow-dom',
      issue: 'display-contents-host',
      original: 'my-button { display: contents; }',
      tagName: 'my-button',
    });
    expect(result.explanation).toContain('display: contents');
    expect(result.severity).toBe('error');
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

// ─── Specificity fixes ─────────────────────────────────────────────────────

describe('suggestFix — specificity', () => {
  it('removes !important from CSS', () => {
    const result = suggestFix({
      type: 'specificity',
      issue: 'important',
      original: 'my-button { color: red !important; }',
      tagName: 'my-button',
    });
    expect(result.suggestion).not.toContain('!important');
    expect(result.severity).toBe('error');
  });

  it('suggests class selector instead of ID selector', () => {
    const result = suggestFix({
      type: 'specificity',
      issue: 'id-selector',
      original: '#app my-button { color: red; }',
    });
    expect(result.suggestion).toContain('.app');
    expect(result.suggestion).not.toContain('#app');
  });

  it('suggests flattened selector for deep nesting', () => {
    const result = suggestFix({
      type: 'specificity',
      issue: 'deep-nesting',
      original: '.page .section .card .header my-button { color: red; }',
      tagName: 'my-button',
    });
    expect(result.suggestion).toContain('my-button');
    expect(result.explanation).toContain('nested');
  });

  it('suggests stylesheet for inline styles', () => {
    const result = suggestFix({
      type: 'specificity',
      issue: 'inline-style',
      original: '<my-button style="color: red;">Click</my-button>',
      tagName: 'my-button',
    });
    expect(result.suggestion).toContain('stylesheet');
    expect(result.severity).toBe('warning');
  });
});

// ─── Layout fixes ──────────────────────────────────────────────────────────

describe('suggestFix — layout', () => {
  it('suggests wrapper for display override', () => {
    const result = suggestFix({
      type: 'layout',
      issue: 'host-display',
      original: 'my-card { display: flex; }',
      tagName: 'my-card',
    });
    expect(result.suggestion).toContain('wrapper');
    expect(result.severity).toBe('warning');
  });

  it('suggests max-width for fixed dimensions', () => {
    const result = suggestFix({
      type: 'layout',
      issue: 'fixed-dimensions',
      original: 'my-card { width: 400px; }',
      tagName: 'my-card',
      property: 'width',
    });
    expect(result.suggestion).toContain('max-width');
  });

  it('suggests wrapper for position override', () => {
    const result = suggestFix({
      type: 'layout',
      issue: 'position-override',
      original: 'my-card { position: absolute; }',
      tagName: 'my-card',
    });
    expect(result.suggestion).toContain('container');
  });

  it('suggests wrapper for overflow hidden', () => {
    const result = suggestFix({
      type: 'layout',
      issue: 'overflow-hidden',
      original: 'my-card { overflow: hidden; }',
      tagName: 'my-card',
    });
    expect(result.explanation).toContain('dropdown');
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
