import { describe, it, expect } from 'vitest';
import { resolveCssApi } from '../../packages/core/src/handlers/css-api-resolver.js';
import type { ComponentMetadata } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const dialogMeta: ComponentMetadata = {
  tagName: 'sl-dialog',
  name: 'SlDialog',
  description: 'A dialog component',
  members: [
    { name: 'open', kind: 'field', type: 'boolean', description: 'Open state' },
    { name: 'label', kind: 'field', type: 'string', description: 'Dialog label' },
  ],
  events: [
    { name: 'sl-show', type: 'CustomEvent', description: 'Emitted when shown' },
    { name: 'sl-hide', type: 'CustomEvent', description: 'Emitted when hidden' },
  ],
  slots: [
    { name: '', description: 'Default slot for dialog content' },
    { name: 'label', description: 'The dialog label' },
    { name: 'header-actions', description: 'Actions in the header' },
    { name: 'footer', description: 'The dialog footer' },
  ],
  cssProperties: [
    { name: '--width', description: 'Dialog width', default: '31rem' },
    { name: '--header-spacing', description: 'Header padding' },
    { name: '--body-spacing', description: 'Body padding' },
    { name: '--footer-spacing', description: 'Footer padding' },
  ],
  cssParts: [
    { name: 'base', description: 'The component base wrapper' },
    { name: 'overlay', description: 'The overlay backdrop' },
    { name: 'panel', description: 'The dialog panel' },
    { name: 'header', description: 'The header area' },
    { name: 'header-actions', description: 'Header action buttons' },
    { name: 'title', description: 'The title text' },
    { name: 'body', description: 'The body content area' },
    { name: 'footer', description: 'The footer area' },
    { name: 'close-button', description: 'The close button' },
    { name: 'close-button__base', description: 'The close button base' },
  ],
};

const bareMeta: ComponentMetadata = {
  tagName: 'x-bare',
  name: 'XBare',
  description: '',
  members: [],
  events: [],
  slots: [],
  cssProperties: [],
  cssParts: [],
};

// ─── Part Resolution ─────────────────────────────────────────────────────────

describe('resolveCssApi — part resolution', () => {
  it('resolves valid ::part() references', () => {
    const css = `
      sl-dialog::part(panel) { background: white; }
      sl-dialog::part(overlay) { opacity: 0.5; }
    `;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.parts.resolved).toHaveLength(2);
    expect(result.parts.resolved[0]?.name).toBe('panel');
    expect(result.parts.resolved[0]?.valid).toBe(true);
    expect(result.parts.resolved[1]?.name).toBe('overlay');
  });

  it('flags unknown ::part() names', () => {
    const css = `sl-dialog::part(content) { padding: 1rem; }`;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.parts.resolved).toHaveLength(1);
    expect(result.parts.resolved[0]?.valid).toBe(false);
    expect(result.parts.resolved[0]?.name).toBe('content');
    // "content" is too far from any valid part to suggest an alternative
    expect(result.parts.resolved[0]?.suggestion).toBeUndefined();
  });

  it('suggests closest part name for typos', () => {
    const css = `sl-dialog::part(headr) { color: red; }`;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.parts.resolved[0]?.valid).toBe(false);
    expect(result.parts.resolved[0]?.suggestion).toBe('header');
  });

  it('lists all available parts', () => {
    const css = `sl-dialog::part(panel) { color: red; }`;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.parts.available).toEqual(dialogMeta.cssParts.map((p) => p.name));
  });

  it('reports no parts available for bare components', () => {
    const css = `x-bare::part(base) { color: red; }`;
    const result = resolveCssApi(css, bareMeta);
    expect(result.parts.available).toHaveLength(0);
    expect(result.parts.resolved[0]?.valid).toBe(false);
    expect(result.parts.resolved[0]?.suggestion).toBeUndefined();
  });
});

// ─── Token Resolution ────────────────────────────────────────────────────────

describe('resolveCssApi — token resolution', () => {
  it('resolves valid CSS custom property references', () => {
    const css = `sl-dialog { --width: 40rem; --body-spacing: 2rem; }`;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.tokens.resolved).toHaveLength(2);
    expect(result.tokens.resolved[0]?.name).toBe('--width');
    expect(result.tokens.resolved[0]?.valid).toBe(true);
    expect(result.tokens.resolved[1]?.name).toBe('--body-spacing');
    expect(result.tokens.resolved[1]?.valid).toBe(true);
  });

  it('flags unknown CSS custom properties', () => {
    const css = `sl-dialog { --padding: 1rem; }`;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.tokens.resolved).toHaveLength(1);
    expect(result.tokens.resolved[0]?.valid).toBe(false);
    expect(result.tokens.resolved[0]?.name).toBe('--padding');
  });

  it('suggests closest token name for typos', () => {
    const css = `sl-dialog { --widht: 40rem; }`;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.tokens.resolved[0]?.valid).toBe(false);
    expect(result.tokens.resolved[0]?.suggestion).toBe('--width');
  });

  it('lists all available tokens', () => {
    const css = `sl-dialog { --width: 40rem; }`;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.tokens.available).toEqual(dialogMeta.cssProperties.map((p) => p.name));
  });

  it('ignores non-component tokens (global design tokens)', () => {
    const css = `sl-dialog { color: var(--sl-color-primary-600); }`;
    const result = resolveCssApi(css, dialogMeta);
    // var() references to global tokens are not component-scoped — don't validate them
    expect(result.tokens.resolved).toHaveLength(0);
  });
});

// ─── Slot Resolution ─────────────────────────────────────────────────────────

describe('resolveCssApi — slot resolution', () => {
  it('resolves slot attribute usage in HTML', () => {
    const css = ``;
    const html = `<div slot="footer">Footer</div><div slot="label">Title</div>`;
    const result = resolveCssApi(css, dialogMeta, html);
    expect(result.slots.resolved).toHaveLength(2);
    expect(result.slots.resolved[0]?.name).toBe('footer');
    expect(result.slots.resolved[0]?.valid).toBe(true);
  });

  it('flags unknown slot names', () => {
    const css = ``;
    const html = `<div slot="sidebar">Side</div>`;
    const result = resolveCssApi(css, dialogMeta, html);
    expect(result.slots.resolved[0]?.valid).toBe(false);
    expect(result.slots.resolved[0]?.name).toBe('sidebar');
  });

  it('suggests closest slot name for typos', () => {
    const css = ``;
    const html = `<div slot="foter">Footer</div>`;
    const result = resolveCssApi(css, dialogMeta, html);
    expect(result.slots.resolved[0]?.valid).toBe(false);
    expect(result.slots.resolved[0]?.suggestion).toBe('footer');
  });

  it('lists all available slots', () => {
    const css = ``;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.slots.available).toEqual(dialogMeta.slots.map((s) => s.name));
  });
});

// ─── Overall Summary ─────────────────────────────────────────────────────────

describe('resolveCssApi — summary', () => {
  it('reports clean when all references are valid', () => {
    const css = `sl-dialog::part(panel) { --width: 40rem; }`;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.valid).toBe(true);
    expect(result.invalidCount).toBe(0);
  });

  it('reports invalid when any reference is wrong', () => {
    const css = `sl-dialog::part(nonexistent) { --fake: 1rem; }`;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.valid).toBe(false);
    expect(result.invalidCount).toBe(2);
  });

  it('includes component API surface summary', () => {
    const css = `sl-dialog::part(panel) { color: red; }`;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.componentApi.tagName).toBe('sl-dialog');
    expect(result.componentApi.partCount).toBe(10);
    expect(result.componentApi.tokenCount).toBe(4);
    expect(result.componentApi.slotCount).toBe(4);
    expect(result.componentApi.hasStyleApi).toBe(true);
  });

  it('flags components with no style API', () => {
    const css = `x-bare::part(base) { color: red; }`;
    const result = resolveCssApi(css, bareMeta);
    expect(result.componentApi.hasStyleApi).toBe(false);
    expect(result.componentApi.partCount).toBe(0);
    expect(result.componentApi.tokenCount).toBe(0);
  });

  it('deduplicates repeated part references', () => {
    const css = `
      sl-dialog::part(panel) { background: white; }
      sl-dialog::part(panel) { color: black; }
    `;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.parts.resolved).toHaveLength(1);
    expect(result.parts.resolved[0]?.name).toBe('panel');
  });

  it('deduplicates repeated token references', () => {
    const css = `
      sl-dialog { --width: 40rem; }
      .modal sl-dialog { --width: 50rem; }
    `;
    const result = resolveCssApi(css, dialogMeta);
    expect(result.tokens.resolved).toHaveLength(1);
  });
});
