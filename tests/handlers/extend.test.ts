import { describe, expect, it } from 'vitest';

import { extendComponent } from '../../packages/core/src/handlers/extend.js';
import { isExtendTool, handleExtendCall } from '../../packages/core/src/tools/extend.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// --- Fixtures ---

const PARENT_CEM: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/hx-button.js',
      declarations: [
        {
          kind: 'class',
          name: 'HxButton',
          tagName: 'hx-button',
          description: 'A button component with multiple variants.',
          members: [
            {
              kind: 'field',
              name: 'variant',
              attribute: 'variant',
              type: { text: "'primary' | 'secondary' | 'danger'" },
              description: 'Button style variant.',
            },
            {
              kind: 'field',
              name: 'disabled',
              attribute: 'disabled',
              type: { text: 'boolean' },
              description: 'Disables the button.',
            },
          ],
          events: [
            {
              name: 'hx-click',
              type: { text: 'CustomEvent<void>' },
              description: 'Fired when the button is clicked.',
            },
          ],
          slots: [
            { name: '', description: 'Default slot for button label.' },
            { name: 'prefix', description: 'Slot for a prefix icon.' },
          ],
          cssParts: [
            { name: 'base', description: 'The button base element.' },
            { name: 'label', description: 'The button label wrapper.' },
          ],
        },
      ],
    },
  ],
};

const NO_PARTS_CEM: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/hx-badge.js',
      declarations: [
        {
          kind: 'class',
          name: 'HxBadge',
          tagName: 'hx-badge',
          description: 'A simple badge component.',
          members: [],
        },
      ],
    },
  ],
};

// --- extendComponent handler tests ---

describe('extendComponent', () => {
  describe('inheritance chain', () => {
    it('returns the correct parentClassName in PascalCase', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.parentClassName).toBe('HxButton');
    });

    it('returns the correct newClassName in PascalCase by default', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.newClassName).toBe('MyButton');
    });

    it('uses an explicit newClassName when provided', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM, 'EnterpriseButton');
      expect(result.newClassName).toBe('EnterpriseButton');
    });

    it('preserves parentTagName and newTagName in result', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.parentTagName).toBe('hx-button');
      expect(result.newTagName).toBe('my-button');
    });
  });

  describe('generated source — inheritance chain syntax', () => {
    it('emits the correct extends clause', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.source).toContain('export class MyButton extends HxButton');
    });

    it('emits the @customElement decorator with the new tag name', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.source).toContain("@customElement('my-button')");
    });

    it('imports the parent class from the correct module path', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.source).toContain("import { HxButton } from './hx-button.js'");
    });
  });

  describe('generated source — TypeScript declarations', () => {
    it('emits HTMLElementTagNameMap augmentation with the new tag', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.source).toContain('declare global {');
      expect(result.source).toContain('interface HTMLElementTagNameMap {');
      expect(result.source).toContain("'my-button': MyButton;");
    });

    it('does NOT emit the parent tag in the new tag map', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.source).not.toContain("'hx-button': MyButton;");
    });
  });

  describe('CSS parts preservation', () => {
    it('includes inherited CSS parts in the result', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.inheritedCssParts).toEqual(['base', 'label']);
    });

    it('includes exportparts guidance in generated source when parent has parts', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.source).toContain('exportparts');
      expect(result.source).toContain('base: base');
      expect(result.source).toContain('label: label');
    });

    it('returns empty inheritedCssParts when parent has none', () => {
      const result = extendComponent('hx-badge', 'my-badge', NO_PARTS_CEM);
      expect(result.inheritedCssParts).toEqual([]);
    });

    it('does not include exportparts when parent has no CSS parts', () => {
      const result = extendComponent('hx-badge', 'my-badge', NO_PARTS_CEM);
      expect(result.source).not.toContain('exportparts');
    });
  });

  describe('slot preservation', () => {
    it('maps unnamed slots to "(default)" in inheritedSlots', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.inheritedSlots).toContain('(default)');
    });

    it('includes named slots in inheritedSlots', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.inheritedSlots).toContain('prefix');
    });

    it('documents inherited slots in generated source', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.source).toContain('Inherited slots from hx-button');
    });
  });

  describe('Shadow DOM warnings', () => {
    it('includes Shadow DOM encapsulation warnings', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      expect(result.warnings.length).toBeGreaterThan(0);
      const combined = result.warnings.join(' ');
      expect(combined).toContain('shadow');
    });

    it('warns about exportparts when parent has CSS parts', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      const combined = result.warnings.join(' ');
      expect(combined).toContain('exportparts');
    });

    it('warns about render() override implications', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      const combined = result.warnings.join(' ');
      expect(combined).toContain('render()');
    });

    it('warns against shadowRoot.querySelector()', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM);
      const combined = result.warnings.join(' ');
      expect(combined).toContain('shadowRoot.querySelector');
    });
  });

  describe('error handling', () => {
    it('throws when parent component is not found in CEM', () => {
      expect(() => extendComponent('nonexistent-component', 'my-comp', PARENT_CEM)).toThrow(
        '"nonexistent-component" not found in CEM',
      );
    });

    it('handles an empty CEM gracefully', () => {
      const emptyCem: Cem = { schemaVersion: '1.0.0', modules: [] };
      expect(() => extendComponent('hx-button', 'my-button', emptyCem)).toThrow();
    });
  });

  describe('explicit newClassName override', () => {
    it('uses provided className in the extends clause', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM, 'EnterpriseButton');
      expect(result.source).toContain('export class EnterpriseButton extends HxButton');
    });

    it('uses provided className in the HTMLElementTagNameMap', () => {
      const result = extendComponent('hx-button', 'my-button', PARENT_CEM, 'EnterpriseButton');
      expect(result.source).toContain("'my-button': EnterpriseButton;");
    });
  });
});

// --- isExtendTool / handleExtendCall tests ---

describe('isExtendTool', () => {
  it('returns true for extend_component', () => {
    expect(isExtendTool('extend_component')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isExtendTool('get_component')).toBe(false);
    expect(isExtendTool('')).toBe(false);
  });
});

describe('handleExtendCall', () => {
  it('returns a success result for extend_component with valid args', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button', newTagName: 'my-button' },
      PARENT_CEM,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('MyButton extends HxButton');
  });

  it('includes Shadow DOM warnings in the output text', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button', newTagName: 'my-button' },
      PARENT_CEM,
    );
    expect(result.content[0].text).toContain('Shadow DOM Style Encapsulation Warnings');
  });

  it('includes inherited CSS parts summary in the header comment', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button', newTagName: 'my-button' },
      PARENT_CEM,
    );
    expect(result.content[0].text).toContain('base, label');
  });

  it('returns error for unknown tool name', () => {
    const result = handleExtendCall('nonexistent_tool', {}, PARENT_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown extend tool');
  });

  it('returns error when parent component is not in CEM', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'not-found', newTagName: 'my-comp' },
      PARENT_CEM,
    );
    expect(result.isError).toBe(true);
  });

  it('returns error for missing required args', () => {
    const result = handleExtendCall('extend_component', {}, PARENT_CEM);
    expect(result.isError).toBe(true);
  });
});
