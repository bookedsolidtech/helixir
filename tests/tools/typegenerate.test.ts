/**
 * Tests for the generate_types tool dispatcher.
 * Covers isTypegenerateTool, handleTypegenerateCall, argument validation,
 * and response formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isTypegenerateTool,
  handleTypegenerateCall,
  TYPEGENERATE_TOOL_DEFINITIONS,
} from '../../packages/core/src/tools/typegenerate.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/typegenerate.js', () => ({
  generateTypes: vi.fn((cem: { modules: unknown[] }) => {
    const count = cem.modules.length;
    return {
      componentCount: count,
      content: count === 0
        ? '// No components found\n'
        : 'declare global {\n  interface HTMLElementTagNameMap {\n    "hx-button": HxButton;\n  }\n}\nexport interface HxButton {\n  variant?: string;\n  disabled?: boolean;\n}\n',
    };
  }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EMPTY_CEM: Cem = { schemaVersion: '1.0.0', modules: [] };

const BUTTON_CEM: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/hx-button.ts',
      declarations: [
        {
          kind: 'class',
          name: 'HxButton',
          tagName: 'hx-button',
          members: [
            { kind: 'field', name: 'variant', type: { text: 'string' } },
            { kind: 'field', name: 'disabled', type: { text: 'boolean' } },
          ],
          attributes: [
            { name: 'variant', type: { text: 'string' } },
          ],
        },
      ],
    },
  ],
};

const MULTI_CEM: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/hx-button.ts',
      declarations: [
        { kind: 'class', name: 'HxButton', tagName: 'hx-button', members: [] },
      ],
    },
    {
      kind: 'javascript-module',
      path: 'src/hx-card.ts',
      declarations: [
        { kind: 'class', name: 'HxCard', tagName: 'hx-card', members: [] },
      ],
    },
  ],
};

// ─── TYPEGENERATE_TOOL_DEFINITIONS ────────────────────────────────────────────

describe('TYPEGENERATE_TOOL_DEFINITIONS', () => {
  it('exports exactly 1 tool definition', () => {
    expect(TYPEGENERATE_TOOL_DEFINITIONS).toHaveLength(1);
  });

  it('defines generate_types', () => {
    const names = TYPEGENERATE_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('generate_types');
  });

  it('generate_types schema has no required fields', () => {
    const def = TYPEGENERATE_TOOL_DEFINITIONS.find((t) => t.name === 'generate_types')!;
    expect(def.inputSchema.required).toBeUndefined();
  });
});

// ─── isTypegenerateTool ───────────────────────────────────────────────────────

describe('isTypegenerateTool', () => {
  it('returns true for generate_types', () => {
    expect(isTypegenerateTool('generate_types')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isTypegenerateTool('scaffold_component')).toBe(false);
    expect(isTypegenerateTool('get_component')).toBe(false);
    expect(isTypegenerateTool('')).toBe(false);
  });

  it('returns false for near-matches', () => {
    expect(isTypegenerateTool('generate')).toBe(false);
    expect(isTypegenerateTool('generate_type')).toBe(false);
  });
});

// ─── handleTypegenerateCall — valid inputs ────────────────────────────────────

describe('handleTypegenerateCall — valid inputs', () => {
  it('returns a success result for generate_types with empty args', () => {
    const result = handleTypegenerateCall('generate_types', {}, BUTTON_CEM);
    expect(result.isError).toBeFalsy();
  });

  it('output includes component count comment', () => {
    const result = handleTypegenerateCall('generate_types', {}, BUTTON_CEM);
    expect(result.content[0].text).toContain('component(s) generated');
  });

  it('output contains TypeScript declarations', () => {
    const result = handleTypegenerateCall('generate_types', {}, BUTTON_CEM);
    expect(result.content[0].text).toContain('HTMLElementTagNameMap');
  });

  it('works with a multi-module CEM', () => {
    const result = handleTypegenerateCall('generate_types', {}, MULTI_CEM);
    expect(result.isError).toBeFalsy();
  });

  it('works with an empty CEM', () => {
    const result = handleTypegenerateCall('generate_types', {}, EMPTY_CEM);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('// 0 component(s) generated');
  });

  it('accepts optional libraryId argument without error', () => {
    const result = handleTypegenerateCall('generate_types', { libraryId: 'shoelace' }, BUTTON_CEM);
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleTypegenerateCall — error cases ─────────────────────────────────────

describe('handleTypegenerateCall — error cases', () => {
  it('returns error for unknown tool name', () => {
    const result = handleTypegenerateCall('nonexistent_tool', {}, EMPTY_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown typegenerate tool');
  });

  it('returns error for empty tool name', () => {
    const result = handleTypegenerateCall('', {}, EMPTY_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown typegenerate tool');
  });
});

// ─── handleTypegenerateCall — handler error propagation ───────────────────────

describe('handleTypegenerateCall — handler error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when generateTypes handler throws', async () => {
    const { generateTypes } = await import('../../packages/core/src/handlers/typegenerate.js');
    vi.mocked(generateTypes).mockImplementationOnce(() => {
      throw new Error('CEM schema version not supported');
    });

    const result = handleTypegenerateCall('generate_types', {}, BUTTON_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('CEM schema version not supported');
  });
});
