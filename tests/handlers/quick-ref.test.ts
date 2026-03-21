import { describe, it, expect } from 'vitest';
import { getComponentQuickRef } from '../../packages/core/src/handlers/quick-ref.js';
import type { ComponentMetadata } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const buttonMeta: ComponentMetadata = {
  tagName: 'my-button',
  name: 'MyButton',
  description: 'A generic button component',
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
    {
      name: 'size',
      kind: 'field',
      type: "'sm' | 'md' | 'lg'",
      description: 'Button size',
    },
    { name: 'focus', kind: 'method', type: 'void', description: 'Focus the button' },
    { name: 'click', kind: 'method', type: 'void', description: '' },
  ],
  events: [
    {
      name: 'my-click',
      type: 'CustomEvent<{ originalEvent: MouseEvent }>',
      description: 'Fired on click',
    },
    { name: 'my-focus', type: 'CustomEvent<void>', description: 'Fired on focus' },
  ],
  slots: [
    { name: '', description: 'Default slot for label text' },
    { name: 'prefix', description: 'Icon before the label' },
    { name: 'suffix', description: 'Icon after the label' },
  ],
  cssProperties: [
    { name: '--my-button-bg', description: 'Background color' },
    { name: '--my-button-color', description: 'Text color' },
    { name: '--my-button-border-radius', description: 'Border radius' },
  ],
  cssParts: [
    { name: 'base', description: 'The button wrapper' },
    { name: 'label', description: 'The label container' },
  ],
};

const bareComponent: ComponentMetadata = {
  tagName: 'x-bare',
  name: 'XBare',
  description: '',
  members: [],
  events: [],
  slots: [],
  cssProperties: [],
  cssParts: [],
};

// ─── Result Shape ────────────────────────────────────────────────────────────

describe('getComponentQuickRef — result shape', () => {
  it('returns tagName', () => {
    const ref = getComponentQuickRef(buttonMeta);
    expect(ref.tagName).toBe('my-button');
  });

  it('returns description', () => {
    const ref = getComponentQuickRef(buttonMeta);
    expect(ref.description).toBe('A generic button component');
  });

  it('includes attributes section', () => {
    const ref = getComponentQuickRef(buttonMeta);
    expect(ref.attributes).toBeDefined();
    expect(ref.attributes.length).toBe(3); // variant, disabled, size (not methods)
  });

  it('includes methods section', () => {
    const ref = getComponentQuickRef(buttonMeta);
    expect(ref.methods).toBeDefined();
    expect(ref.methods.length).toBe(2);
  });

  it('includes events section', () => {
    const ref = getComponentQuickRef(buttonMeta);
    expect(ref.events.length).toBe(2);
  });

  it('includes slots section', () => {
    const ref = getComponentQuickRef(buttonMeta);
    expect(ref.slots.length).toBe(3);
  });

  it('includes cssProperties section', () => {
    const ref = getComponentQuickRef(buttonMeta);
    expect(ref.cssProperties.length).toBe(3);
  });

  it('includes cssParts section', () => {
    const ref = getComponentQuickRef(buttonMeta);
    expect(ref.cssParts.length).toBe(2);
  });

  it('includes shadowDomWarnings', () => {
    const ref = getComponentQuickRef(buttonMeta);
    expect(ref.shadowDomWarnings.length).toBeGreaterThan(0);
  });
});

// ─── Attribute Detail ────────────────────────────────────────────────────────

describe('getComponentQuickRef — attribute details', () => {
  it('attributes have name, type, description', () => {
    const ref = getComponentQuickRef(buttonMeta);
    const variant = ref.attributes.find((a) => a.name === 'variant');
    expect(variant).toBeDefined();
    expect(variant?.type).toContain('primary');
    expect(variant?.description).toBeTruthy();
  });

  it('enum attributes include validValues', () => {
    const ref = getComponentQuickRef(buttonMeta);
    const variant = ref.attributes.find((a) => a.name === 'variant');
    expect(variant?.validValues).toEqual(['primary', 'secondary', 'danger']);
  });

  it('boolean attributes are flagged', () => {
    const ref = getComponentQuickRef(buttonMeta);
    const disabled = ref.attributes.find((a) => a.name === 'disabled');
    expect(disabled?.isBoolean).toBe(true);
  });

  it('non-boolean attributes are not flagged as boolean', () => {
    const ref = getComponentQuickRef(buttonMeta);
    const variant = ref.attributes.find((a) => a.name === 'variant');
    expect(variant?.isBoolean).toBe(false);
  });
});

// ─── CSS Styling Details ─────────────────────────────────────────────────────

describe('getComponentQuickRef — CSS details', () => {
  it('CSS properties include example usage with meaningful value', () => {
    const ref = getComponentQuickRef(buttonMeta);
    const bg = ref.cssProperties.find((p) => p.name === '--my-button-bg');
    expect(bg?.example).toContain('--my-button-bg');
    // Should NOT use 'initial' — it's misleading for custom properties
    expect(bg?.example).not.toContain('initial');
  });

  it('CSS parts include ::part() selector example', () => {
    const ref = getComponentQuickRef(buttonMeta);
    const base = ref.cssParts.find((p) => p.name === 'base');
    expect(base?.selector).toBe('my-button::part(base)');
  });

  it('includes cssSnippet with property and part examples', () => {
    const ref = getComponentQuickRef(buttonMeta);
    expect(ref.cssSnippet).toContain('my-button');
    expect(ref.cssSnippet).toContain('--my-button-bg');
    expect(ref.cssSnippet).toContain('::part(base)');
  });

  it('cssSnippet does NOT use "initial" for custom property values', () => {
    const ref = getComponentQuickRef(buttonMeta);
    expect(ref.cssSnippet).not.toContain(': initial;');
  });

  it('cssSnippet includes slot styling section when slots exist', () => {
    const ref = getComponentQuickRef(buttonMeta);
    expect(ref.cssSnippet).toContain('Slot styling');
    expect(ref.cssSnippet).toContain('[slot="prefix"]');
  });

  it('cssSnippet omits slot styling for components without slots', () => {
    const ref = getComponentQuickRef(bareComponent);
    expect(ref.cssSnippet).not.toContain('Slot styling');
  });

  it('CSS property example uses CEM default when available', () => {
    const metaWithDefault: ComponentMetadata = {
      ...bareComponent,
      cssProperties: [{ name: '--my-bg', description: 'Background', default: '#fff' }],
    };
    const ref = getComponentQuickRef(metaWithDefault);
    expect(ref.cssProperties[0]?.example).toContain('#fff');
  });
});

// ─── Bare Component ──────────────────────────────────────────────────────────

describe('getComponentQuickRef — bare component', () => {
  it('returns empty arrays for all sections', () => {
    const ref = getComponentQuickRef(bareComponent);
    expect(ref.attributes).toHaveLength(0);
    expect(ref.methods).toHaveLength(0);
    expect(ref.events).toHaveLength(0);
    expect(ref.slots).toHaveLength(0);
    expect(ref.cssProperties).toHaveLength(0);
    expect(ref.cssParts).toHaveLength(0);
  });

  it('still includes shadowDomWarnings', () => {
    const ref = getComponentQuickRef(bareComponent);
    expect(ref.shadowDomWarnings.length).toBeGreaterThan(0);
  });

  it('cssSnippet is empty string for bare component', () => {
    const ref = getComponentQuickRef(bareComponent);
    expect(ref.cssSnippet).toBe('');
  });
});
