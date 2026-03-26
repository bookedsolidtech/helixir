/**
 * Tests for the generate_story tool dispatcher.
 * Covers isStoryTool, handleStoryCall, argument validation,
 * and response formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isStoryTool,
  handleStoryCall,
  STORY_TOOL_DEFINITIONS,
} from '../../packages/core/src/tools/story.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/story.js', () => ({
  generateStory: vi.fn((decl: { tagName?: string; name?: string }) => {
    const tag = decl.tagName ?? 'unknown-element';
    return `import type { Meta, StoryObj } from '@storybook/web-components';\n\nconst meta: Meta = {\n  title: 'Components/${tag}',\n  component: '${tag}',\n};\n\nexport default meta;\n`;
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
            { kind: 'field', name: 'variant', type: { text: 'string' }, default: '"primary"' },
            { kind: 'field', name: 'disabled', type: { text: 'boolean' }, default: 'false' },
          ],
          attributes: [
            { name: 'variant', type: { text: "'primary' | 'secondary' | 'danger'" } },
            { name: 'disabled', type: { text: 'boolean' } },
          ],
          slots: [{ name: '' }],
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
        {
          kind: 'class',
          name: 'HxButton',
          tagName: 'hx-button',
          members: [],
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
        },
      ],
    },
  ],
};

// ─── STORY_TOOL_DEFINITIONS ───────────────────────────────────────────────────

describe('STORY_TOOL_DEFINITIONS', () => {
  it('exports exactly 1 tool definition', () => {
    expect(STORY_TOOL_DEFINITIONS).toHaveLength(1);
  });

  it('defines generate_story', () => {
    const names = STORY_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('generate_story');
  });

  it('generate_story schema requires tagName', () => {
    const def = STORY_TOOL_DEFINITIONS.find((t) => t.name === 'generate_story')!;
    expect(def.inputSchema.required).toContain('tagName');
  });
});

// ─── isStoryTool ──────────────────────────────────────────────────────────────

describe('isStoryTool', () => {
  it('returns true for generate_story', () => {
    expect(isStoryTool('generate_story')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isStoryTool('scaffold_component')).toBe(false);
    expect(isStoryTool('get_component')).toBe(false);
    expect(isStoryTool('')).toBe(false);
  });

  it('returns false for near-matches', () => {
    expect(isStoryTool('story')).toBe(false);
    expect(isStoryTool('generate_stories')).toBe(false);
  });
});

// ─── handleStoryCall — valid inputs ───────────────────────────────────────────

describe('handleStoryCall — valid inputs', () => {
  it('returns a success result for a known component', async () => {
    const result = await handleStoryCall('generate_story', { tagName: 'hx-button' }, BUTTON_CEM);
    expect(result.isError).toBeFalsy();
  });

  it('result contains Storybook Meta import', async () => {
    const result = await handleStoryCall('generate_story', { tagName: 'hx-button' }, BUTTON_CEM);
    expect(result.content[0].text).toContain("'@storybook/web-components'");
  });

  it('result contains the component tag name', async () => {
    const result = await handleStoryCall('generate_story', { tagName: 'hx-button' }, BUTTON_CEM);
    expect(result.content[0].text).toContain('hx-button');
  });

  it('works for a second component in a multi-module CEM', async () => {
    const result = await handleStoryCall('generate_story', { tagName: 'hx-card' }, MULTI_CEM);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('hx-card');
  });

  it('returns story source as plain text (not JSON)', async () => {
    const result = await handleStoryCall('generate_story', { tagName: 'hx-button' }, BUTTON_CEM);
    expect(() => JSON.parse(result.content[0].text)).toThrow();
  });
});

// ─── handleStoryCall — error cases ────────────────────────────────────────────

describe('handleStoryCall — error cases', () => {
  it('returns error for unknown tool name', async () => {
    const result = await handleStoryCall('nonexistent_tool', {}, EMPTY_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown story tool');
  });

  it('returns error for empty tool name', async () => {
    const result = await handleStoryCall('', {}, EMPTY_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown story tool');
  });

  it('returns error when tagName is missing', async () => {
    const result = await handleStoryCall('generate_story', {}, BUTTON_CEM);
    expect(result.isError).toBe(true);
  });

  it('returns error when tagName not found in CEM', async () => {
    const result = await handleStoryCall(
      'generate_story',
      { tagName: 'nonexistent-element' },
      BUTTON_CEM,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('nonexistent-element');
    expect(result.content[0].text).toContain('not found in CEM');
  });

  it('returns error with known components list when tagName not found', async () => {
    const result = await handleStoryCall(
      'generate_story',
      { tagName: 'missing-component' },
      BUTTON_CEM,
    );
    expect(result.content[0].text).toContain('hx-button');
  });

  it('returns error with (none) when CEM has no components', async () => {
    const result = await handleStoryCall('generate_story', { tagName: 'hx-button' }, EMPTY_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('(none)');
  });
});

// ─── handleStoryCall — handler error propagation ──────────────────────────────

describe('handleStoryCall — handler error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when generateStory handler throws', async () => {
    const { generateStory } = await import('../../packages/core/src/handlers/story.js');
    vi.mocked(generateStory).mockImplementationOnce(() => {
      throw new Error('Failed to generate story template');
    });

    const result = await handleStoryCall('generate_story', { tagName: 'hx-button' }, BUTTON_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to generate story template');
  });
});
