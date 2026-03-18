import { describe, it, expect } from 'vitest';
import { generateTypeDefinitions } from '../../packages/core/src/handlers/generate-types.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCem(overrides?: Partial<Cem>): Cem {
  return {
    schemaVersion: '2.0.0',
    modules: [],
    ...overrides,
  };
}

const BUTTON_CEM: Cem = makeCem({
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/components/my-button.js',
      declarations: [
        {
          kind: 'class',
          name: 'MyButton',
          tagName: 'my-button',
          description: 'A button component.',
          members: [
            {
              kind: 'field',
              name: 'variant',
              attribute: 'variant',
              type: { text: "'primary' | 'secondary' | 'danger'" },
              description: 'The visual variant.',
            },
            {
              kind: 'field',
              name: 'disabled',
              attribute: 'disabled',
              type: { text: 'boolean' },
              description: 'Disables the button.',
            },
            {
              kind: 'method',
              name: 'focus',
              description: 'Focuses the button.',
            },
          ],
          events: [
            {
              name: 'my-click',
              type: { text: 'CustomEvent<{ originalEvent: MouseEvent }>' },
              description: 'Fired on click.',
            },
            {
              name: 'my-blur',
              // no type, no description
            },
          ],
        },
      ],
    },
  ],
});

// Simulates HxSkeletonAttributes with correct CEM fields
const SKELETON_CEM: Cem = makeCem({
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/components/hx-skeleton.js',
      declarations: [
        {
          kind: 'class',
          name: 'HxSkeleton',
          tagName: 'hx-skeleton',
          members: [
            {
              kind: 'field',
              name: 'variant',
              attribute: 'variant',
              type: { text: "'text' | 'rect' | 'circle'" },
            },
            { kind: 'field', name: 'width', attribute: 'width', type: { text: 'string' } },
            { kind: 'field', name: 'height', attribute: 'height', type: { text: 'string' } },
            { kind: 'field', name: 'animated', attribute: 'animated', type: { text: 'boolean' } },
            { kind: 'field', name: 'loaded', attribute: 'loaded', type: { text: 'boolean' } },
          ],
          events: [],
        },
      ],
    },
  ],
});

// Simulates HxSpinnerAttributes with correct CEM fields
const SPINNER_CEM: Cem = makeCem({
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/components/hx-spinner.js',
      declarations: [
        {
          kind: 'class',
          name: 'HxSpinner',
          tagName: 'hx-spinner',
          members: [
            {
              kind: 'field',
              name: 'variant',
              attribute: 'variant',
              type: { text: "'default' | 'primary' | 'inverted'" },
            },
          ],
          events: [],
        },
      ],
    },
  ],
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateTypeDefinitions', () => {
  it('returns zero components for an empty CEM', () => {
    const result = generateTypeDefinitions(makeCem());
    expect(result.componentCount).toBe(0);
    expect(result.typescript).toContain('Auto-generated');
    expect(result.typescript).not.toContain('interface');
  });

  it('generates an interface for each component with a tagName', () => {
    const result = generateTypeDefinitions(BUTTON_CEM);
    expect(result.componentCount).toBe(1);
    expect(result.typescript).toContain('export interface MyButtonAttributes');
  });

  it('includes attribute members with correct TypeScript types', () => {
    const result = generateTypeDefinitions(BUTTON_CEM);
    expect(result.typescript).toContain("'variant'?: 'primary' | 'secondary' | 'danger'");
    expect(result.typescript).toContain("'disabled'?: boolean");
  });

  it('does not include method members in attribute interface', () => {
    const result = generateTypeDefinitions(BUTTON_CEM);
    expect(result.typescript).not.toContain("'focus'");
  });

  it('includes event handler properties', () => {
    const result = generateTypeDefinitions(BUTTON_CEM);
    expect(result.typescript).toContain("'onmy-click'?: (event: CustomEvent<");
    expect(result.typescript).toContain("'onmy-blur'?: (event: CustomEvent<unknown>) => void");
  });

  it('extracts CustomEvent detail type from event type text', () => {
    const result = generateTypeDefinitions(BUTTON_CEM);
    expect(result.typescript).toContain('CustomEvent<{ originalEvent: MouseEvent }>');
  });

  it('generates HTMLElementTagNameMap augmentation', () => {
    const result = generateTypeDefinitions(BUTTON_CEM);
    expect(result.typescript).toContain('declare global');
    expect(result.typescript).toContain('interface HTMLElementTagNameMap');
    expect(result.typescript).toContain("'my-button': HTMLElement & MyButtonAttributes");
  });

  it('skips declarations without a tagName', () => {
    const cem = makeCem({
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/utils.js',
          declarations: [
            { kind: 'class', name: 'BaseClass' }, // no tagName
          ],
        },
      ],
    });
    const result = generateTypeDefinitions(cem);
    expect(result.componentCount).toBe(0);
  });

  it('generates correct HxSkeletonAttributes (variant, width, height, animated, loaded)', () => {
    const result = generateTypeDefinitions(SKELETON_CEM);
    expect(result.typescript).toContain('export interface HxSkeletonAttributes');
    expect(result.typescript).toContain("'variant'?: 'text' | 'rect' | 'circle'");
    expect(result.typescript).toContain("'width'?: string");
    expect(result.typescript).toContain("'height'?: string");
    expect(result.typescript).toContain("'animated'?: boolean");
    expect(result.typescript).toContain("'loaded'?: boolean");
    // Must NOT contain the old wrong attributes
    expect(result.typescript).not.toContain("'shape'");
    expect(result.typescript).not.toContain("'effect'");
  });

  it('generates correct HxSpinnerAttributes (only default, primary, inverted)', () => {
    const result = generateTypeDefinitions(SPINNER_CEM);
    expect(result.typescript).toContain('export interface HxSpinnerAttributes');
    expect(result.typescript).toContain("'variant'?: 'default' | 'primary' | 'inverted'");
    // Must NOT allow other variants like success, warning, etc.
    expect(result.typescript).not.toContain('success');
    expect(result.typescript).not.toContain('warning');
  });

  it('includes component count in formatted output', () => {
    const result = generateTypeDefinitions(BUTTON_CEM);
    expect(result.formatted).toContain('1 component(s)');
    expect(result.formatted).toContain('my-button');
  });

  it('handles multi-component CEM', () => {
    const cem = makeCem({
      modules: [...SKELETON_CEM.modules, ...SPINNER_CEM.modules],
    });
    const result = generateTypeDefinitions(cem);
    expect(result.componentCount).toBe(2);
    expect(result.typescript).toContain('HxSkeletonAttributes');
    expect(result.typescript).toContain('HxSpinnerAttributes');
    expect(result.typescript).toContain("'hx-skeleton': HTMLElement & HxSkeletonAttributes");
    expect(result.typescript).toContain("'hx-spinner': HTMLElement & HxSpinnerAttributes");
  });

  it('falls back to string type when attribute has no type info', () => {
    const cem = makeCem({
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/x.js',
          declarations: [
            {
              kind: 'class',
              name: 'XEl',
              tagName: 'x-el',
              members: [
                { kind: 'field', name: 'foo', attribute: 'foo' }, // no type
              ],
            },
          ],
        },
      ],
    });
    const result = generateTypeDefinitions(cem);
    expect(result.typescript).toContain("'foo'?: string");
  });
});
