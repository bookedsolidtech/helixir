import { describe, it, expect, vi, afterEach } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { buildNarrative } from '../../src/handlers/narrative.js';
import { handleComponentCall, isComponentTool } from '../../src/tools/component.js';
import type { McpWcConfig } from '../../src/config.js';

// Mock the CEM handler to avoid real file system reads
vi.mock('../../src/handlers/cem.js', () => ({
  parseCem: vi.fn(),
  validateCompleteness: vi.fn(),
  findComponentsByToken: vi.fn(),
}));

// Mock suggest handler
vi.mock('../../src/handlers/suggest.js', () => ({
  suggestUsage: vi.fn(),
  generateImport: vi.fn(),
}));

// Mock component handler
vi.mock('../../src/handlers/component.js', () => ({
  formatPropConstraints: vi.fn(),
}));

// Mock dependencies handler
vi.mock('../../src/handlers/dependencies.js', () => ({
  getComponentDependencies: vi.fn(),
}));

// Mock tokens handler (find-components-using-token path)
vi.mock('../../src/handlers/tokens.js', () => ({
  parseTokens: vi.fn(),
  getDesignTokens: vi.fn(),
  findToken: vi.fn(),
  findComponentsUsingToken: vi.fn(),
}));

// Mock narrative handler (only for handleComponentCall tests)
vi.mock('../../src/handlers/narrative.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/handlers/narrative.js')>();
  return {
    ...actual,
    getComponentNarrative: vi.fn(),
  };
});

import { getComponentNarrative } from '../../src/handlers/narrative.js';
import { formatPropConstraints } from '../../src/handlers/component.js';
import { getComponentDependencies } from '../../src/handlers/dependencies.js';
import { findComponentsUsingToken } from '../../src/handlers/tokens.js';
import { parseCem, findComponentsByToken } from '../../src/handlers/cem.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

function makeConfig(): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: FIXTURES_DIR,
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
  };
}

function makeButtonMeta() {
  return {
    tagName: 'my-button',
    name: 'MyButton',
    description: 'A versatile button component.',
    members: [
      {
        name: 'variant',
        kind: 'field',
        type: "'primary' | 'neutral' | 'danger'",
        description: 'The button variant.',
      },
      {
        name: 'disabled',
        kind: 'field',
        type: 'boolean',
        description: 'Disables the button.',
      },
      {
        name: 'loading',
        kind: 'field',
        type: 'boolean',
        description: 'Shows a loading spinner.',
      },
    ],
    events: [{ name: 'sl-click', type: 'CustomEvent', description: 'Emitted on click.' }],
    slots: [
      { name: '', description: 'The button label.' },
      { name: 'prefix', description: 'Leading icon.' },
      { name: 'suffix', description: 'Trailing icon.' },
    ],
    cssProperties: [
      { name: '--sl-button-font-size-medium', description: 'Font size for medium buttons.' },
      { name: '--sl-button-border-radius', description: 'Corner radius.' },
    ],
    cssParts: [
      { name: 'base', description: 'The outer button element.' },
      { name: 'label', description: 'The button label.' },
    ],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// buildNarrative — unit tests (no mocking, pure function)
// ---------------------------------------------------------------------------

describe('buildNarrative', () => {
  it('includes the tag name in the heading', () => {
    const narrative = buildNarrative(makeButtonMeta());
    expect(narrative).toContain('## my-button');
  });

  it('includes description text', () => {
    const narrative = buildNarrative(makeButtonMeta());
    expect(narrative).toContain('versatile button component');
  });

  it('includes variant information for enum fields', () => {
    const narrative = buildNarrative(makeButtonMeta());
    expect(narrative).toContain('variant');
    expect(narrative).toContain('primary');
  });

  it('includes slot descriptions', () => {
    const narrative = buildNarrative(makeButtonMeta());
    expect(narrative).toContain('Slots');
    expect(narrative).toContain('prefix');
    expect(narrative).toContain('suffix');
  });

  it('includes default slot description', () => {
    const narrative = buildNarrative(makeButtonMeta());
    expect(narrative).toContain('button label');
  });

  it('includes CSS custom properties', () => {
    const narrative = buildNarrative(makeButtonMeta());
    expect(narrative).toContain('--sl-button-font-size-medium');
    expect(narrative).toContain('--sl-button-border-radius');
  });

  it('includes CSS parts', () => {
    const narrative = buildNarrative(makeButtonMeta());
    expect(narrative).toContain('::part(base)');
    expect(narrative).toContain('::part(label)');
  });

  it('includes events', () => {
    const narrative = buildNarrative(makeButtonMeta());
    expect(narrative).toContain('Events');
    expect(narrative).toContain('sl-click');
    expect(narrative).toContain('Emitted on click.');
  });

  it('handles component with no slots gracefully', () => {
    const meta = { ...makeButtonMeta(), slots: [] };
    const narrative = buildNarrative(meta);
    expect(narrative).toContain('## my-button');
    expect(narrative).not.toContain('**Slots:**');
  });

  it('handles component with no CSS properties gracefully', () => {
    const meta = { ...makeButtonMeta(), cssProperties: [], cssParts: [] };
    const narrative = buildNarrative(meta);
    expect(narrative).toContain('## my-button');
    expect(narrative).not.toContain('**How to customize it:**');
  });

  it('handles component with no events gracefully', () => {
    const meta = { ...makeButtonMeta(), events: [] };
    const narrative = buildNarrative(meta);
    expect(narrative).toContain('## my-button');
    expect(narrative).not.toContain('**Events:**');
  });

  it('produces multiple paragraphs (sections)', () => {
    const narrative = buildNarrative(makeButtonMeta());
    const paragraphCount = (narrative.match(/\*\*[A-Z]/g) ?? []).length;
    expect(paragraphCount).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// isComponentTool
// ---------------------------------------------------------------------------

describe('isComponentTool', () => {
  it('returns true for get_component_narrative', () => {
    expect(isComponentTool('get_component_narrative')).toBe(true);
  });

  it('returns true for existing component tools', () => {
    expect(isComponentTool('get_component')).toBe(true);
    expect(isComponentTool('validate_cem')).toBe(true);
    expect(isComponentTool('suggest_usage')).toBe(true);
    expect(isComponentTool('generate_import')).toBe(true);
  });

  it('returns false for unknown tools', () => {
    expect(isComponentTool('unknown_tool')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleComponentCall — get_component_narrative
// ---------------------------------------------------------------------------

describe('handleComponentCall — get_component_narrative', () => {
  it('returns narrative from getComponentNarrative', async () => {
    vi.mocked(getComponentNarrative).mockResolvedValue('## my-button\n\n**What it is:** A button.');
    const result = await handleComponentCall(
      'get_component_narrative',
      { tagName: 'my-button' },
      makeConfig(),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('## my-button');
    expect(result.content[0].text).toContain('What it is');
  });

  it('calls getComponentNarrative with the correct tagName', async () => {
    vi.mocked(getComponentNarrative).mockResolvedValue('## sl-button\n\n...');
    await handleComponentCall('get_component_narrative', { tagName: 'sl-button' }, makeConfig());
    expect(vi.mocked(getComponentNarrative)).toHaveBeenCalledWith('sl-button', undefined);
  });

  it('returns error for missing tagName', async () => {
    const result = await handleComponentCall('get_component_narrative', {}, makeConfig());
    expect(result.isError).toBe(true);
  });

  it('propagates handler errors as error response', async () => {
    vi.mocked(getComponentNarrative).mockRejectedValue(new Error('Component not found'));
    const result = await handleComponentCall(
      'get_component_narrative',
      { tagName: 'unknown-tag' },
      makeConfig(),
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleComponentCall — get_prop_constraints
// ---------------------------------------------------------------------------

describe('handleComponentCall — get_prop_constraints', () => {
  it('returns formatted constraints for a known attribute', async () => {
    vi.mocked(parseCem).mockReturnValue({
      tagName: 'my-button',
      name: 'MyButton',
      description: '',
      members: [{ name: 'variant', kind: 'field', type: "'primary' | 'neutral'" }],
      events: [],
      slots: [],
      cssProperties: [],
      cssParts: [],
    });
    vi.mocked(formatPropConstraints).mockReturnValue({
      type: 'enum',
      values: ['primary', 'neutral'],
    });

    const result = await handleComponentCall(
      'get_prop_constraints',
      { tagName: 'my-button', attributeName: 'variant' },
      makeConfig(),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('primary');
  });

  it('returns error when attribute is not found on component', async () => {
    vi.mocked(parseCem).mockReturnValue({
      tagName: 'my-button',
      name: 'MyButton',
      description: '',
      members: [{ name: 'variant', kind: 'field', type: "'primary'" }],
      events: [],
      slots: [],
      cssProperties: [],
      cssParts: [],
    });

    const result = await handleComponentCall(
      'get_prop_constraints',
      { tagName: 'my-button', attributeName: 'nonexistent' },
      makeConfig(),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('nonexistent');
  });

  it('returns error for missing required args', async () => {
    const result = await handleComponentCall(
      'get_prop_constraints',
      { tagName: 'my-button' },
      makeConfig(),
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleComponentCall — find_components_by_token
// ---------------------------------------------------------------------------

describe('handleComponentCall — find_components_by_token', () => {
  it('returns components that use the given CSS token', async () => {
    vi.mocked(findComponentsByToken).mockReturnValue(['my-button', 'my-card']);

    const result = await handleComponentCall(
      'find_components_by_token',
      { tokenName: '--my-color', partialMatch: false },
      makeConfig(),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('my-button');
  });

  it('returns error when tokenName does not start with --', async () => {
    const result = await handleComponentCall(
      'find_components_by_token',
      { tokenName: 'my-color' },
      makeConfig(),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('--');
  });

  it('returns error for missing tokenName', async () => {
    const result = await handleComponentCall('find_components_by_token', {}, makeConfig());
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleComponentCall — get_component_dependencies
// ---------------------------------------------------------------------------

describe('handleComponentCall — get_component_dependencies', () => {
  it('returns component dependencies', async () => {
    vi.mocked(getComponentDependencies).mockReturnValue({ direct: ['my-icon'], transitive: [] });

    const result = await handleComponentCall(
      'get_component_dependencies',
      { tagName: 'my-button', includeTransitive: false },
      makeConfig(),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('my-icon');
  });

  it('returns error for missing tagName', async () => {
    const result = await handleComponentCall('get_component_dependencies', {}, makeConfig());
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleComponentCall — find_components_using_token
// ---------------------------------------------------------------------------

describe('handleComponentCall — find_components_using_token', () => {
  it('returns components using the given token', async () => {
    vi.mocked(findComponentsUsingToken).mockReturnValue([
      { tagName: 'my-button', tokenName: '--my-color', context: 'background' },
    ]);

    const result = await handleComponentCall(
      'find_components_using_token',
      { tokenName: '--my-color', fuzzy: false },
      makeConfig(),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('my-button');
  });

  it('returns error for missing tokenName', async () => {
    const result = await handleComponentCall('find_components_using_token', {}, makeConfig());
    expect(result.isError).toBe(true);
  });
});
