/**
 * Tests for the get_composition_example tool dispatcher.
 * Covers isCompositionTool, handleCompositionCall, argument validation,
 * and response formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isCompositionTool,
  handleCompositionCall,
  COMPOSITION_TOOL_DEFINITIONS,
} from '../../packages/core/src/tools/composition.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/composition.js', () => ({
  getCompositionExample: vi.fn((cem: unknown, tagNames: string[]) => ({
    components: tagNames.map((t) => ({ tagName: t, found: true })),
    html: tagNames.map((t) => `<${t}></${t}>`).join('\n'),
    description: `Composition of ${tagNames.join(' + ')}`,
  })),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_CEM: Cem = { schemaVersion: '1.0.0', modules: [] };

const RICH_CEM: Cem = {
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
          members: [],
          slots: [{ name: '' }, { name: 'prefix' }],
        },
      ],
    },
    {
      kind: 'javascript-module',
      path: 'src/hx-card.ts',
      declarations: [
        {
          kind: 'class',
          name: 'HxCard',
          tagName: 'hx-card',
          members: [],
          slots: [{ name: '' }, { name: 'header' }, { name: 'footer' }],
        },
      ],
    },
  ],
};

// ─── COMPOSITION_TOOL_DEFINITIONS ─────────────────────────────────────────────

describe('COMPOSITION_TOOL_DEFINITIONS', () => {
  it('exports exactly 1 tool definition', () => {
    expect(COMPOSITION_TOOL_DEFINITIONS).toHaveLength(1);
  });

  it('defines get_composition_example', () => {
    const names = COMPOSITION_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('get_composition_example');
  });

  it('get_composition_example schema requires tagNames', () => {
    const def = COMPOSITION_TOOL_DEFINITIONS.find((t) => t.name === 'get_composition_example')!;
    expect(def.inputSchema.required).toContain('tagNames');
  });
});

// ─── isCompositionTool ────────────────────────────────────────────────────────

describe('isCompositionTool', () => {
  it('returns true for get_composition_example', () => {
    expect(isCompositionTool('get_composition_example')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isCompositionTool('scaffold_component')).toBe(false);
    expect(isCompositionTool('get_component')).toBe(false);
    expect(isCompositionTool('')).toBe(false);
  });

  it('returns false for near-matches', () => {
    expect(isCompositionTool('composition')).toBe(false);
    expect(isCompositionTool('get_composition')).toBe(false);
  });
});

// ─── handleCompositionCall — valid inputs ─────────────────────────────────────

describe('handleCompositionCall — valid inputs', () => {
  it('returns a success result for a single tagName', () => {
    const result = handleCompositionCall(
      'get_composition_example',
      { tagNames: ['hx-button'] },
      FAKE_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('returns JSON-parseable content', () => {
    const result = handleCompositionCall(
      'get_composition_example',
      { tagNames: ['hx-button'] },
      FAKE_CEM,
    );
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('accepts 2 tagNames', () => {
    const result = handleCompositionCall(
      'get_composition_example',
      { tagNames: ['hx-card', 'hx-button'] },
      RICH_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts 3 tagNames', () => {
    const result = handleCompositionCall(
      'get_composition_example',
      { tagNames: ['hx-card', 'hx-button', 'hx-badge'] },
      RICH_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts 4 tagNames (maximum)', () => {
    const result = handleCompositionCall(
      'get_composition_example',
      { tagNames: ['hx-card', 'hx-button', 'hx-badge', 'hx-icon'] },
      RICH_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('result includes html field', () => {
    const result = handleCompositionCall(
      'get_composition_example',
      { tagNames: ['hx-button'] },
      FAKE_CEM,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.html).toBeDefined();
  });

  it('result includes description field', () => {
    const result = handleCompositionCall(
      'get_composition_example',
      { tagNames: ['hx-button', 'hx-card'] },
      RICH_CEM,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.description).toBeDefined();
  });
});

// ─── handleCompositionCall — error cases ──────────────────────────────────────

describe('handleCompositionCall — error cases', () => {
  it('returns error for unknown tool name', () => {
    const result = handleCompositionCall('nonexistent_tool', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown composition tool');
  });

  it('returns error for empty tool name', () => {
    const result = handleCompositionCall('', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown composition tool');
  });

  it('returns error when tagNames is missing', () => {
    const result = handleCompositionCall('get_composition_example', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });

  it('returns error when tagNames is empty array', () => {
    const result = handleCompositionCall('get_composition_example', { tagNames: [] }, FAKE_CEM);
    expect(result.isError).toBe(true);
  });

  it('returns error when tagNames exceeds 4 items', () => {
    const result = handleCompositionCall(
      'get_composition_example',
      { tagNames: ['a-one', 'a-two', 'a-three', 'a-four', 'a-five'] },
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
  });

  it('returns error when tagNames is not an array', () => {
    const result = handleCompositionCall(
      'get_composition_example',
      { tagNames: 'hx-button' },
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
  });
});

// ─── handleCompositionCall — handler error propagation ────────────────────────

describe('handleCompositionCall — handler error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when getCompositionExample handler throws', async () => {
    const { getCompositionExample } =
      await import('../../packages/core/src/handlers/composition.js');
    vi.mocked(getCompositionExample).mockImplementationOnce(() => {
      throw new Error('Component not found in CEM');
    });

    const result = handleCompositionCall(
      'get_composition_example',
      { tagNames: ['unknown-element'] },
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Component not found in CEM');
  });
});
