import { describe, it, expect } from 'vitest';
import { validateComponentCode } from '../../packages/core/src/handlers/code-validator.js';
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
          members: [
            {
              kind: 'field' as const,
              name: 'variant',
              type: { text: "'primary' | 'default' | 'danger'" },
              description: 'The button variant.',
              attribute: 'variant',
            },
            {
              kind: 'field' as const,
              name: 'href',
              type: { text: 'string' },
              description: 'URL for link mode.',
              attribute: 'href',
            },
            {
              kind: 'field' as const,
              name: 'target',
              type: { text: 'string' },
              description: 'Only used when `href` is present.',
              attribute: 'target',
            },
          ],
          events: [
            { name: 'my-click', type: { text: 'CustomEvent' }, description: 'Fired on click.' },
          ],
          slots: [
            { name: '', description: 'Default slot for button label text.' },
            {
              name: 'prefix',
              description: 'An icon slot. Works best with `<my-icon>`.',
            },
          ],
          cssProperties: [
            { name: '--my-button-color', description: 'Text color.' },
            { name: '--my-button-bg', description: 'Background.' },
          ],
          cssParts: [{ name: 'base', description: 'The button wrapper.' }],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-icon.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyIcon',
          tagName: 'my-icon',
          members: [],
          events: [],
          slots: [],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
  ],
};

// ─── Clean code ─────────────────────────────────────────────────────────────

describe('validateComponentCode — clean code', () => {
  it('returns clean for valid HTML + CSS', () => {
    const result = validateComponentCode({
      html: '<my-button variant="primary">Click</my-button>',
      css: 'my-button { --my-button-color: var(--brand-color, red); }',
      tagName: 'my-button',
      cem: fixture,
    });
    expect(result.clean).toBe(true);
    expect(result.totalIssues).toBe(0);
  });

  it('returns clean for HTML-only validation', () => {
    const result = validateComponentCode({
      html: '<my-button variant="primary">Click</my-button>',
      tagName: 'my-button',
      cem: fixture,
    });
    expect(result.clean).toBe(true);
  });
});

// ─── Catches HTML issues ────────────────────────────────────────────────────

describe('validateComponentCode — HTML issues', () => {
  it('catches invalid enum attribute values', () => {
    const result = validateComponentCode({
      html: '<my-button variant="large">Click</my-button>',
      tagName: 'my-button',
      cem: fixture,
    });
    expect(result.totalIssues).toBeGreaterThan(0);
    expect(result.htmlUsage?.issues.length).toBeGreaterThan(0);
  });

  it('catches attribute conflicts', () => {
    const result = validateComponentCode({
      html: '<my-button target="_blank">Click</my-button>',
      tagName: 'my-button',
      cem: fixture,
    });
    expect(result.attributeConflicts?.issues.length).toBeGreaterThan(0);
  });
});

// ─── Catches CSS issues ─────────────────────────────────────────────────────

describe('validateComponentCode — CSS issues', () => {
  it('catches unknown CSS custom properties', () => {
    const result = validateComponentCode({
      html: '<my-button>Click</my-button>',
      css: `my-button {
  --my-button-shadow: none;
}`,
      tagName: 'my-button',
      cem: fixture,
    });
    expect(result.cssVars?.issues.length).toBeGreaterThan(0);
  });

  it('catches Shadow DOM anti-patterns in CSS', () => {
    const result = validateComponentCode({
      html: '<my-button>Click</my-button>',
      css: `my-button .internal {
  color: red;
}`,
      tagName: 'my-button',
      cem: fixture,
    });
    expect(result.shadowDom?.issues.length).toBeGreaterThan(0);
  });
});

// ─── Catches import issues ──────────────────────────────────────────────────

describe('validateComponentCode — import checking', () => {
  it('catches unknown custom elements in HTML', () => {
    const result = validateComponentCode({
      html: '<my-button>Click</my-button><my-dialog>X</my-dialog>',
      tagName: 'my-button',
      cem: fixture,
    });
    expect(result.imports?.unknownTags.length).toBeGreaterThan(0);
  });
});

// ─── Result structure ──────────────────────────────────────────────────────

describe('validateComponentCode — result structure', () => {
  it('includes summary with counts', () => {
    const result = validateComponentCode({
      html: '<my-button variant="large">Click</my-button>',
      tagName: 'my-button',
      cem: fixture,
    });
    expect(result.totalIssues).toBeGreaterThan(0);
    expect(typeof result.totalIssues).toBe('number');
  });

  it('skips CSS checks when no CSS provided', () => {
    const result = validateComponentCode({
      html: '<my-button>Click</my-button>',
      tagName: 'my-button',
      cem: fixture,
    });
    expect(result.cssVars).toBeUndefined();
    expect(result.shadowDom).toBeUndefined();
  });

  it('skips event checks when no code provided', () => {
    const result = validateComponentCode({
      html: '<my-button>Click</my-button>',
      tagName: 'my-button',
      cem: fixture,
    });
    expect(result.eventUsage).toBeUndefined();
  });

  it('runs event checks when code is provided', () => {
    const result = validateComponentCode({
      html: '<my-button>Click</my-button>',
      code: '<my-button onMyClick={handler}>Click</my-button>',
      tagName: 'my-button',
      cem: fixture,
      framework: 'react',
    });
    expect(result.eventUsage).toBeDefined();
  });
});
