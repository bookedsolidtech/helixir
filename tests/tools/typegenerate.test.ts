/**
 * Tests for the typegenerate tool dispatcher (packages/core/src/tools/typegenerate.ts).
 *
 * Covers:
 *   - isTypegenerateTool guard
 *   - handleTypegenerateCall dispatch (success, unknown tool, error)
 *   - TYPEGENERATE_TOOL_DEFINITIONS shape
 *   - GenerateTypesArgsSchema validation
 */
import { describe, it, expect } from 'vitest';
import {
  isTypegenerateTool,
  handleTypegenerateCall,
  TYPEGENERATE_TOOL_DEFINITIONS,
  GenerateTypesArgsSchema,
} from '../../packages/core/src/tools/typegenerate.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SIMPLE_CEM: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/my-button.js',
      declarations: [
        {
          kind: 'class',
          name: 'MyButton',
          tagName: 'my-button',
          members: [
            {
              kind: 'field',
              name: 'disabled',
              attribute: 'disabled',
              type: { text: 'boolean' },
              description: 'Whether the button is disabled.',
            },
          ],
          events: [
            {
              name: 'my-click',
              type: { text: 'CustomEvent<{ value: string }>' },
              description: 'Emitted on click.',
            },
          ],
        },
      ],
    },
  ],
};

const EMPTY_CEM: Cem = { schemaVersion: '1.0.0', modules: [] };

// ─── isTypegenerateTool ───────────────────────────────────────────────────────

describe('isTypegenerateTool', () => {
  it('returns true for generate_types', () => {
    expect(isTypegenerateTool('generate_types')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isTypegenerateTool('list_components')).toBe(false);
    expect(isTypegenerateTool('')).toBe(false);
    expect(isTypegenerateTool('generate_story')).toBe(false);
  });
});

// ─── TYPEGENERATE_TOOL_DEFINITIONS ────────────────────────────────────────────

describe('TYPEGENERATE_TOOL_DEFINITIONS', () => {
  it('contains exactly one tool definition', () => {
    expect(TYPEGENERATE_TOOL_DEFINITIONS).toHaveLength(1);
  });

  it('has generate_types with correct shape', () => {
    const def = TYPEGENERATE_TOOL_DEFINITIONS[0];
    expect(def).toBeDefined();
    expect(def!.name).toBe('generate_types');
    expect(def!.description).toBeTruthy();
    expect(def!.inputSchema).toBeDefined();
    expect(def!.inputSchema.type).toBe('object');
    expect(def!.inputSchema.properties).toHaveProperty('libraryId');
  });
});

// ─── GenerateTypesArgsSchema ──────────────────────────────────────────────────

describe('GenerateTypesArgsSchema', () => {
  it('accepts empty object', () => {
    const result = GenerateTypesArgsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts object with libraryId', () => {
    const result = GenerateTypesArgsSchema.safeParse({ libraryId: 'my-lib' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.libraryId).toBe('my-lib');
    }
  });

  it('accepts object with undefined libraryId', () => {
    const result = GenerateTypesArgsSchema.safeParse({ libraryId: undefined });
    expect(result.success).toBe(true);
  });
});

// ─── handleTypegenerateCall ───────────────────────────────────────────────────

describe('handleTypegenerateCall', () => {
  it('returns success response for generate_types with a valid CEM', () => {
    const result = handleTypegenerateCall('generate_types', {}, SIMPLE_CEM);
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
    expect(result.content[0]!.text).toContain('1 component(s) generated');
    expect(result.content[0]!.text).toContain('my-button');
  });

  it('returns success response for empty CEM', () => {
    const result = handleTypegenerateCall('generate_types', {}, EMPTY_CEM);
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain('0 component(s) generated');
  });

  it('returns error response for unknown tool name', () => {
    const result = handleTypegenerateCall('unknown_tool', {}, SIMPLE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Unknown typegenerate tool');
  });

  it('includes generated type content in response', () => {
    const result = handleTypegenerateCall('generate_types', {}, SIMPLE_CEM);
    const text = result.content[0]!.text;
    // Should contain TypeScript declaration content
    expect(text).toContain('MyButton');
    expect(text).toContain('disabled');
  });

  it('handles CEM with multiple components', () => {
    const multiCem: Cem = {
      schemaVersion: '1.0.0',
      modules: [
        ...SIMPLE_CEM.modules,
        {
          kind: 'javascript-module',
          path: 'src/my-card.js',
          declarations: [
            {
              kind: 'class',
              name: 'MyCard',
              tagName: 'my-card',
              members: [],
            },
          ],
        },
      ],
    };
    const result = handleTypegenerateCall('generate_types', {}, multiCem);
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain('2 component(s) generated');
  });
});
