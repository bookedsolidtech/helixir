/**
 * Tests for the extend_component tool dispatcher.
 * Covers isExtendTool, handleExtendCall, argument validation,
 * and response formatting with CEM-based component inputs.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  isExtendTool,
  handleExtendCall,
} from '../../packages/core/src/tools/extend.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/extend.js', () => ({
  extendComponent: vi.fn((parentTagName: string, newTagName: string, _cem: unknown, newClassName?: string) => {
    const parentClass = parentTagName.replace(/-([a-z])/g, (_, l: string) => l.toUpperCase());
    const defaultNewClass = newTagName.replace(/-([a-z])/g, (_, l: string) => l.toUpperCase());
    const newClass = newClassName ?? defaultNewClass;
    return {
      parentTagName,
      newTagName,
      parentClassName: parentClass.charAt(0).toUpperCase() + parentClass.slice(1),
      newClassName: newClass.charAt(0).toUpperCase() + newClass.slice(1),
      source: `import { ${parentClass.charAt(0).toUpperCase() + parentClass.slice(1)} } from './${parentTagName}.js'\nexport class ${newClass.charAt(0).toUpperCase() + newClass.slice(1)} extends ${parentClass.charAt(0).toUpperCase() + parentClass.slice(1)} {}\n@customElement('${newTagName}')`,
      inheritedCssParts: ['base', 'label'],
      inheritedSlots: ['(default)', 'prefix'],
      warnings: [
        'shadow DOM style encapsulation',
        'exportparts must be declared',
        'render() override replaces parent template',
        'shadowRoot.querySelector() is not recommended',
      ],
    };
  }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_CEM: Cem = { schemaVersion: '1.0.0', modules: [] };

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
          members: [],
          cssParts: [
            { name: 'base', description: 'The button base element.' },
            { name: 'label', description: 'The button label wrapper.' },
          ],
          slots: [
            { name: '', description: 'Default slot.' },
            { name: 'prefix', description: 'Prefix icon slot.' },
          ],
        },
      ],
    },
  ],
};

// ─── isExtendTool ─────────────────────────────────────────────────────────────

describe('isExtendTool', () => {
  it('returns true for extend_component', () => {
    expect(isExtendTool('extend_component')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isExtendTool('scaffold_component')).toBe(false);
    expect(isExtendTool('get_component')).toBe(false);
    expect(isExtendTool('')).toBe(false);
  });

  it('returns false for near-matches', () => {
    expect(isExtendTool('extend')).toBe(false);
    expect(isExtendTool('extend_components')).toBe(false);
  });
});

// ─── handleExtendCall — valid inputs ──────────────────────────────────────────

describe('handleExtendCall — valid inputs', () => {
  it('returns a success result for extend_component with required args', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button', newTagName: 'my-button' },
      PARENT_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('output includes the inheritance relationship comment', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button', newTagName: 'my-button' },
      PARENT_CEM,
    );
    expect(result.content[0].text).toContain('extends');
  });

  it('output includes the parent tag name', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button', newTagName: 'my-button' },
      PARENT_CEM,
    );
    expect(result.content[0].text).toContain('hx-button');
  });

  it('output includes the new tag name', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button', newTagName: 'my-button' },
      PARENT_CEM,
    );
    expect(result.content[0].text).toContain('my-button');
  });

  it('output includes Shadow DOM warnings section', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button', newTagName: 'my-button' },
      PARENT_CEM,
    );
    expect(result.content[0].text).toContain('Shadow DOM Style Encapsulation Warnings');
  });

  it('output includes inherited CSS parts summary', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button', newTagName: 'my-button' },
      PARENT_CEM,
    );
    expect(result.content[0].text).toContain('base');
    expect(result.content[0].text).toContain('label');
  });

  it('output includes inherited slots summary', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button', newTagName: 'my-button' },
      PARENT_CEM,
    );
    expect(result.content[0].text).toContain('Inherited slots');
  });

  it('formats warnings as numbered list with emoji', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button', newTagName: 'my-button' },
      PARENT_CEM,
    );
    expect(result.content[0].text).toContain('1. ⚠️');
  });

  it('accepts optional newClassName override', () => {
    const result = handleExtendCall(
      'extend_component',
      {
        parentTagName: 'hx-button',
        newTagName: 'my-button',
        newClassName: 'EnterpriseButton',
      },
      PARENT_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('works with empty CEM (handler mock does not query CEM)', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button', newTagName: 'my-button' },
      FAKE_CEM,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleExtendCall — error cases ───────────────────────────────────────────

describe('handleExtendCall — error cases', () => {
  it('returns error for unknown tool name', () => {
    const result = handleExtendCall('nonexistent_tool', {}, PARENT_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown extend tool');
  });

  it('returns error for empty tool name', () => {
    const result = handleExtendCall('', {}, PARENT_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown extend tool');
  });

  it('returns error when parentTagName is missing', () => {
    const result = handleExtendCall(
      'extend_component',
      { newTagName: 'my-button' },
      PARENT_CEM,
    );
    expect(result.isError).toBe(true);
  });

  it('returns error when newTagName is missing', () => {
    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'hx-button' },
      PARENT_CEM,
    );
    expect(result.isError).toBe(true);
  });

  it('returns error when both required args are missing', () => {
    const result = handleExtendCall('extend_component', {}, PARENT_CEM);
    expect(result.isError).toBe(true);
  });
});

// ─── handleExtendCall — handler error propagation ─────────────────────────────

describe('handleExtendCall — handler error propagation', () => {
  it('returns error when handler throws (e.g. parent not found in CEM)', async () => {
    const { extendComponent } = await import('../../packages/core/src/handlers/extend.js');
    vi.mocked(extendComponent).mockImplementationOnce(() => {
      throw new Error('"not-found" not found in CEM');
    });

    const result = handleExtendCall(
      'extend_component',
      { parentTagName: 'not-found', newTagName: 'my-comp' },
      PARENT_CEM,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found in CEM');
  });
});
