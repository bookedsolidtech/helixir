import { describe, it, expect, vi, afterEach } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  tokenize,
  scoreComponent,
  levenshtein,
  classifyByHeuristic,
  isDiscoveryTool,
  handleDiscoveryCall,
} from '../../packages/core/src/tools/discovery.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// Mock the CEM handler to avoid real file system reads in unit tests
vi.mock('../../packages/core/src/handlers/cem.js', () => ({
  listAllComponents: vi.fn(),
  parseCem: vi.fn(),
  listAllEvents: vi.fn(),
  listAllSlots: vi.fn(),
  listAllCssParts: vi.fn(),
}));

import {
  listAllComponents,
  parseCem,
  listAllEvents,
  listAllSlots,
  listAllCssParts,
} from '../../packages/core/src/handlers/cem.js';

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
    cdnBase: null,
    watch: false,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

describe('tokenize', () => {
  it('splits on hyphens', () => {
    expect(tokenize('my-button')).toEqual(['my', 'button']);
  });

  it('splits on underscores', () => {
    expect(tokenize('my_button')).toEqual(['my', 'button']);
  });

  it('splits on whitespace', () => {
    expect(tokenize('my button')).toEqual(['my', 'button']);
  });

  it('splits camelCase', () => {
    expect(tokenize('myButton')).toEqual(['my', 'button']);
  });

  it('lowercases all tokens', () => {
    expect(tokenize('MyButton')).toEqual(['my', 'button']);
  });

  it('filters empty tokens', () => {
    expect(tokenize('--leading')).toEqual(['leading']);
  });

  it('handles single word', () => {
    expect(tokenize('button')).toEqual(['button']);
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// scoreComponent
// ---------------------------------------------------------------------------

describe('scoreComponent', () => {
  it('returns 0 for empty query tokens', () => {
    const score = scoreComponent('my-button', 'A button component', ['variant', 'disabled'], []);
    expect(score).toBe(0);
  });

  it('returns 0 when no tokens match', () => {
    const score = scoreComponent(
      'my-button',
      'A button component',
      ['variant', 'disabled'],
      ['xyz123', 'zzz'],
    );
    expect(score).toBe(0);
  });

  it('scores tag name match at x3', () => {
    // 'button' is a token of 'my-button' → score = 3
    const score = scoreComponent('my-button', 'A widget', [], ['button']);
    expect(score).toBe(3);
  });

  it('scores description match at x2', () => {
    // 'widget' appears in description but not tag name or members → score = 2
    const score = scoreComponent('my-foo', 'A widget component', [], ['widget']);
    expect(score).toBe(2);
  });

  it('scores member name match at x1', () => {
    // 'variant' is a member name but not in tag or description → score = 1
    const score = scoreComponent(
      'my-foo',
      'A generic component',
      ['variant', 'disabled'],
      ['variant'],
    );
    expect(score).toBe(1);
  });

  it('accumulates score across multiple sources', () => {
    // 'button': matches tag name (3) + description (2) = 5
    const score = scoreComponent('my-button', 'A button component', ['variant'], ['button']);
    expect(score).toBe(5);
  });

  it('accumulates score for multiple query tokens', () => {
    // 'button' matches tag (3) + desc (2) = 5; 'variant' matches member (1)
    const score = scoreComponent(
      'my-button',
      'A button component',
      ['variant', 'disabled'],
      ['button', 'variant'],
    );
    expect(score).toBe(6);
  });

  it('exact tag name match scores higher than member-only match', () => {
    const scoreExact = scoreComponent('my-button', 'A widget', [], ['button']);
    const scoreMember = scoreComponent('my-widget', 'A component', ['button'], ['button']);
    expect(scoreExact).toBeGreaterThan(scoreMember);
  });

  it('returns zero for unrelated query', () => {
    const score = scoreComponent(
      'my-button',
      'A button component',
      ['variant', 'disabled'],
      ['accordion', 'drawer'],
    );
    expect(score).toBe(0);
  });

  it('query matching multiple member names accumulates score', () => {
    // 'disabled' appears twice in memberNames (de-duplicated via tokenize)
    const score = scoreComponent('my-foo', 'A component', ['disabled'], ['disabled']);
    expect(score).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// isDiscoveryTool
// ---------------------------------------------------------------------------

describe('isDiscoveryTool', () => {
  it('returns true for list_components', () => {
    expect(isDiscoveryTool('list_components')).toBe(true);
  });

  it('returns true for find_component', () => {
    expect(isDiscoveryTool('find_component')).toBe(true);
  });

  it('returns true for get_library_summary', () => {
    expect(isDiscoveryTool('get_library_summary')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isDiscoveryTool('get_design_tokens')).toBe(false);
    expect(isDiscoveryTool('')).toBe(false);
    expect(isDiscoveryTool('unknown')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleDiscoveryCall — list_components
// ---------------------------------------------------------------------------

describe('handleDiscoveryCall — list_components', () => {
  it('returns formatted list of components', async () => {
    vi.mocked(listAllComponents).mockReturnValue(['my-button', 'my-card', 'my-select']);
    const result = await handleDiscoveryCall('list_components', {}, makeConfig());
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('my-button');
    expect(result.content[0].text).toContain('my-card');
    expect(result.content[0].text).toContain('my-select');
  });

  it('handles empty component list', async () => {
    vi.mocked(listAllComponents).mockReturnValue([]);
    const result = await handleDiscoveryCall('list_components', {}, makeConfig());
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// handleDiscoveryCall — find_component
// ---------------------------------------------------------------------------

describe('handleDiscoveryCall — find_component', () => {
  function mockComponents() {
    vi.mocked(listAllComponents).mockReturnValue(['my-button', 'my-card', 'my-select']);
    vi.mocked(parseCem).mockImplementation((tagName: string) => {
      const data: Record<
        string,
        {
          description: string;
          members: Array<{ name: string; kind: string; type: string; description: string }>;
        }
      > = {
        'my-button': {
          description: 'A generic button component with various style variants and states.',
          members: [
            { name: 'variant', kind: 'field', type: 'string', description: 'Visual style variant' },
            {
              name: 'disabled',
              kind: 'field',
              type: 'boolean',
              description: 'Disables the button',
            },
          ],
        },
        'my-card': {
          description: 'A flexible card component for displaying grouped content.',
          members: [
            { name: 'heading', kind: 'field', type: 'string', description: 'Card heading' },
            { name: 'elevated', kind: 'field', type: 'boolean', description: 'Elevated shadow' },
          ],
        },
        'my-select': {
          description: 'A custom select/dropdown component with search and multi-select support.',
          members: [
            { name: 'value', kind: 'field', type: 'string', description: 'Selected value' },
            { name: 'multiple', kind: 'field', type: 'boolean', description: 'Multi-select mode' },
          ],
        },
      };
      const comp = data[tagName];
      return {
        tagName,
        name: tagName,
        description: comp?.description ?? '',
        members: comp?.members ?? [],
        events: [],
        slots: [],
        cssProperties: [],
        cssParts: [],
      };
    });
  }

  it('returns my-button for exact tag name query', async () => {
    mockComponents();
    const result = await handleDiscoveryCall('find_component', { query: 'button' }, makeConfig());
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('my-button');
  });

  it('returns results for partial token match', async () => {
    mockComponents();
    const result = await handleDiscoveryCall('find_component', { query: 'card' }, makeConfig());
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('my-card');
  });

  it('returns empty message when no components match', async () => {
    mockComponents();
    const result = await handleDiscoveryCall(
      'find_component',
      { query: 'xyznonexistent' },
      makeConfig(),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('No components found');
  });

  it('returns results when query matches member names', async () => {
    mockComponents();
    // 'variant' is a member of my-button
    const result = await handleDiscoveryCall('find_component', { query: 'variant' }, makeConfig());
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('my-button');
  });

  it('returns no more than 3 results', async () => {
    // All 3 components share 'my' token in tag names → all match
    mockComponents();
    const result = await handleDiscoveryCall('find_component', { query: 'my' }, makeConfig());
    expect(result.isError).toBeFalsy();
    const lines = result.content[0].text.trim().split('\n');
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it('includes score in output', async () => {
    mockComponents();
    const result = await handleDiscoveryCall('find_component', { query: 'button' }, makeConfig());
    expect(result.content[0].text).toContain('score:');
  });

  it('returns error for missing query arg', async () => {
    mockComponents();
    const result = await handleDiscoveryCall('find_component', {}, makeConfig());
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleDiscoveryCall — get_library_summary
// ---------------------------------------------------------------------------

describe('handleDiscoveryCall — get_library_summary', () => {
  it('returns component count', async () => {
    vi.mocked(listAllComponents).mockReturnValue(['my-button', 'my-card', 'my-select']);
    const result = await handleDiscoveryCall('get_library_summary', {}, makeConfig());
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as { componentCount: number };
    expect(data.componentCount).toBe(3);
  });

  it('returns componentCount=0 when no components exist', async () => {
    vi.mocked(listAllComponents).mockReturnValue([]);
    const result = await handleDiscoveryCall('get_library_summary', {}, makeConfig());
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as { componentCount: number };
    expect(data.componentCount).toBe(0);
  });

  it('omits health fields when history dir does not exist', async () => {
    vi.mocked(listAllComponents).mockReturnValue(['my-button']);
    const result = await handleDiscoveryCall('get_library_summary', {}, makeConfig());
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(data['averageScore']).toBeUndefined();
    expect(data['gradeDistribution']).toBeUndefined();
    expect(data['lastCheckTimestamp']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleDiscoveryCall — unknown tool
// ---------------------------------------------------------------------------

describe('handleDiscoveryCall — unknown tool', () => {
  it('returns error for unknown tool name', async () => {
    const result = await handleDiscoveryCall('unknown_tool', {}, makeConfig());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown discovery tool');
  });
});

// ---------------------------------------------------------------------------
// Fixture data for list_events / list_slots / list_css_parts
// ---------------------------------------------------------------------------

// my-button: 3 events, 3 slots, 2 parts
const MY_BUTTON_EVENTS = [
  {
    eventName: 'click',
    tagName: 'my-button',
    description: 'Emitted on click.',
    type: 'MouseEvent',
  },
  {
    eventName: 'focus',
    tagName: 'my-button',
    description: 'Emitted on focus.',
    type: 'FocusEvent',
  },
  { eventName: 'blur', tagName: 'my-button', description: 'Emitted on blur.', type: 'FocusEvent' },
];

const MY_BUTTON_SLOTS = [
  { slotName: '', tagName: 'my-button', description: 'Default slot for label.', isDefault: true },
  { slotName: 'prefix', tagName: 'my-button', description: 'Prefix icon.', isDefault: false },
  { slotName: 'suffix', tagName: 'my-button', description: 'Suffix icon.', isDefault: false },
];

const MY_BUTTON_PARTS = [
  { partName: 'base', tagName: 'my-button', description: 'The base element.' },
  { partName: 'label', tagName: 'my-button', description: 'The label text.' },
];

const MY_CARD_EVENTS = [
  {
    eventName: 'expand',
    tagName: 'my-card',
    description: 'Emitted when card expands.',
    type: 'CustomEvent',
  },
];

// ---------------------------------------------------------------------------
// handleDiscoveryCall — list_events
// ---------------------------------------------------------------------------

describe('handleDiscoveryCall — list_events', () => {
  it('returns all events from all components', async () => {
    vi.mocked(listAllEvents).mockReturnValue([...MY_BUTTON_EVENTS, ...MY_CARD_EVENTS]);
    const result = await handleDiscoveryCall('list_events', {}, makeConfig());
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('click');
    expect(result.content[0].text).toContain('my-button');
    expect(result.content[0].text).toContain('expand');
    expect(result.content[0].text).toContain('my-card');
  });

  it('returns 3 events for my-button fixture', async () => {
    vi.mocked(listAllEvents).mockReturnValue(MY_BUTTON_EVENTS);
    const result = await handleDiscoveryCall('list_events', { tagName: 'my-button' }, makeConfig());
    expect(result.isError).toBeFalsy();
    // header + 3 data rows
    const lines = result.content[0].text.trim().split('\n');
    expect(lines.length).toBe(4);
  });

  it('passes tagName filter arg to handler', async () => {
    vi.mocked(listAllEvents).mockReturnValue(MY_BUTTON_EVENTS);
    await handleDiscoveryCall('list_events', { tagName: 'my-button' }, makeConfig());
    expect(vi.mocked(listAllEvents)).toHaveBeenCalledWith(expect.anything(), 'my-button');
  });

  it('includes event name, component, description, and type in output', async () => {
    vi.mocked(listAllEvents).mockReturnValue(MY_BUTTON_EVENTS);
    const result = await handleDiscoveryCall('list_events', {}, makeConfig());
    expect(result.content[0].text).toContain('click');
    expect(result.content[0].text).toContain('my-button');
    expect(result.content[0].text).toContain('Emitted on click.');
    expect(result.content[0].text).toContain('MouseEvent');
  });

  it('returns empty message when no events found', async () => {
    vi.mocked(listAllEvents).mockReturnValue([]);
    const result = await handleDiscoveryCall('list_events', {}, makeConfig());
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('No events found');
  });
});

// ---------------------------------------------------------------------------
// handleDiscoveryCall — list_slots
// ---------------------------------------------------------------------------

describe('handleDiscoveryCall — list_slots', () => {
  it('returns 3 slots for my-button fixture', async () => {
    vi.mocked(listAllSlots).mockReturnValue(MY_BUTTON_SLOTS);
    const result = await handleDiscoveryCall('list_slots', { tagName: 'my-button' }, makeConfig());
    expect(result.isError).toBeFalsy();
    // header + 3 data rows
    const lines = result.content[0].text.trim().split('\n');
    expect(lines.length).toBe(4);
  });

  it('passes tagName filter arg to handler', async () => {
    vi.mocked(listAllSlots).mockReturnValue(MY_BUTTON_SLOTS);
    await handleDiscoveryCall('list_slots', { tagName: 'my-button' }, makeConfig());
    expect(vi.mocked(listAllSlots)).toHaveBeenCalledWith(expect.anything(), 'my-button');
  });

  it('marks default slot as default in output', async () => {
    vi.mocked(listAllSlots).mockReturnValue(MY_BUTTON_SLOTS);
    const result = await handleDiscoveryCall('list_slots', {}, makeConfig());
    expect(result.content[0].text).toContain('default');
    expect(result.content[0].text).toContain('(default)');
  });

  it('marks named slot as named in output', async () => {
    vi.mocked(listAllSlots).mockReturnValue(MY_BUTTON_SLOTS);
    const result = await handleDiscoveryCall('list_slots', {}, makeConfig());
    expect(result.content[0].text).toContain('named');
    expect(result.content[0].text).toContain('prefix');
  });

  it('includes slot name, component, description, and kind in output', async () => {
    vi.mocked(listAllSlots).mockReturnValue(MY_BUTTON_SLOTS);
    const result = await handleDiscoveryCall('list_slots', {}, makeConfig());
    expect(result.content[0].text).toContain('prefix');
    expect(result.content[0].text).toContain('my-button');
    expect(result.content[0].text).toContain('Prefix icon.');
  });

  it('returns empty message when no slots found', async () => {
    vi.mocked(listAllSlots).mockReturnValue([]);
    const result = await handleDiscoveryCall('list_slots', {}, makeConfig());
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('No slots found');
  });
});

// ---------------------------------------------------------------------------
// handleDiscoveryCall — list_css_parts
// ---------------------------------------------------------------------------

describe('handleDiscoveryCall — list_css_parts', () => {
  it('returns 2 parts for my-button fixture', async () => {
    vi.mocked(listAllCssParts).mockReturnValue(MY_BUTTON_PARTS);
    const result = await handleDiscoveryCall(
      'list_css_parts',
      { tagName: 'my-button' },
      makeConfig(),
    );
    expect(result.isError).toBeFalsy();
    // header + 2 data rows
    const lines = result.content[0].text.trim().split('\n');
    expect(lines.length).toBe(3);
  });

  it('passes tagName filter arg to handler', async () => {
    vi.mocked(listAllCssParts).mockReturnValue(MY_BUTTON_PARTS);
    await handleDiscoveryCall('list_css_parts', { tagName: 'my-button' }, makeConfig());
    expect(vi.mocked(listAllCssParts)).toHaveBeenCalledWith(expect.anything(), 'my-button');
  });

  it('includes part name, component, and description in output', async () => {
    vi.mocked(listAllCssParts).mockReturnValue(MY_BUTTON_PARTS);
    const result = await handleDiscoveryCall('list_css_parts', {}, makeConfig());
    expect(result.content[0].text).toContain('base');
    expect(result.content[0].text).toContain('my-button');
    expect(result.content[0].text).toContain('The base element.');
    expect(result.content[0].text).toContain('label');
  });

  it('returns empty message when no CSS parts found', async () => {
    vi.mocked(listAllCssParts).mockReturnValue([]);
    const result = await handleDiscoveryCall('list_css_parts', {}, makeConfig());
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('No CSS parts found');
  });
});

// ---------------------------------------------------------------------------
// isDiscoveryTool — new tools
// ---------------------------------------------------------------------------

describe('isDiscoveryTool — new tools', () => {
  it('returns true for list_events', () => {
    expect(isDiscoveryTool('list_events')).toBe(true);
  });

  it('returns true for list_slots', () => {
    expect(isDiscoveryTool('list_slots')).toBe(true);
  });

  it('returns true for list_css_parts', () => {
    expect(isDiscoveryTool('list_css_parts')).toBe(true);
  });

  it('returns true for list_components_by_category', () => {
    expect(isDiscoveryTool('list_components_by_category')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// levenshtein
// ---------------------------------------------------------------------------

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('button', 'button')).toBe(0);
  });

  it('returns 1 for single insertion', () => {
    expect(levenshtein('buton', 'button')).toBe(1);
  });

  it('returns 1 for single deletion', () => {
    expect(levenshtein('buttons', 'button')).toBe(1);
  });

  it('returns 1 for single substitution', () => {
    expect(levenshtein('butten', 'button')).toBe(1);
  });

  it('returns 0 for two empty strings', () => {
    expect(levenshtein('', '')).toBe(0);
  });

  it('returns length of b when a is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('returns length of a when b is empty', () => {
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('returns correct distance for common typos', () => {
    // 'dialg' → 'dialog': 1 insertion
    expect(levenshtein('dialg', 'dialog')).toBe(1);
    // 'selct' → 'select': 1 insertion
    expect(levenshtein('selct', 'select')).toBe(1);
  });

  it('returns distance > 1 for unrelated short strings', () => {
    expect(levenshtein('cat', 'dog')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// scoreComponent — enhanced with events/slots/cssParts and fuzzy
// ---------------------------------------------------------------------------

describe('scoreComponent — enhanced parameters', () => {
  it('scores event name match at x1', () => {
    // 'click' matches event name
    const score = scoreComponent('my-foo', 'A generic component', [], ['click'], ['click'], [], []);
    expect(score).toBe(1);
  });

  it('scores slot name match at x1', () => {
    const score = scoreComponent('my-foo', 'A component', [], ['prefix'], [], ['prefix'], []);
    expect(score).toBe(1);
  });

  it('scores css-part name match at x1', () => {
    const score = scoreComponent('my-foo', 'A component', [], ['base'], [], [], ['base']);
    expect(score).toBe(1);
  });

  it('fuzzy fallback adds +1 when query token is 1 edit away from a tag token', () => {
    // 'buton' is 1 edit from 'button' (in tag 'my-button')
    const score = scoreComponent('my-button', 'A component', [], ['buton'], [], [], []);
    expect(score).toBe(1);
  });

  it('fuzzy fallback does not trigger when exact match found', () => {
    // 'button' matches exactly in tag → score 3, no fuzzy bonus
    const score = scoreComponent('my-button', 'A component', [], ['button'], [], [], []);
    expect(score).toBe(3);
  });

  it('fuzzy fallback returns 0 when edit distance > 1', () => {
    // 'xyz' is not within 1 edit of 'button'
    const score = scoreComponent('my-button', 'A component', [], ['xyz'], [], [], []);
    expect(score).toBe(0);
  });

  it('backward compatible: works with 4 parameters (no events/slots/parts)', () => {
    const score = scoreComponent('my-button', 'A button component', ['variant'], ['button']);
    expect(score).toBe(5); // tag(3) + desc(2)
  });
});

// ---------------------------------------------------------------------------
// classifyByHeuristic
// ---------------------------------------------------------------------------

describe('classifyByHeuristic', () => {
  it('classifies my-input as form', () => {
    expect(classifyByHeuristic('my-input')).toBe('form');
  });

  it('classifies my-select as form', () => {
    expect(classifyByHeuristic('my-select')).toBe('form');
  });

  it('classifies my-nav as navigation', () => {
    expect(classifyByHeuristic('my-nav')).toBe('navigation');
  });

  it('classifies my-menu as navigation', () => {
    expect(classifyByHeuristic('my-menu')).toBe('navigation');
  });

  it('classifies my-alert as feedback', () => {
    expect(classifyByHeuristic('my-alert')).toBe('feedback');
  });

  it('classifies my-card as layout', () => {
    expect(classifyByHeuristic('my-card')).toBe('layout');
  });

  it('classifies my-dialog as overlay', () => {
    expect(classifyByHeuristic('my-dialog')).toBe('overlay');
  });

  it('classifies my-table as data-display', () => {
    expect(classifyByHeuristic('my-table')).toBe('data-display');
  });

  it('classifies my-icon as media', () => {
    expect(classifyByHeuristic('my-icon')).toBe('media');
  });

  it('returns uncategorized for unknown tags', () => {
    expect(classifyByHeuristic('my-foo')).toBe('uncategorized');
    expect(classifyByHeuristic('my-widget')).toBe('uncategorized');
  });
});

// ---------------------------------------------------------------------------
// handleDiscoveryCall — list_components_by_category
// ---------------------------------------------------------------------------

describe('handleDiscoveryCall — list_components_by_category', () => {
  function makeCemWithComponents(): Cem {
    return {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/button.js',
          declarations: [{ kind: 'class', name: 'MyButton', tagName: 'my-button' }],
        },
        {
          kind: 'javascript-module',
          path: 'src/input.js',
          declarations: [{ kind: 'class', name: 'MyInput', tagName: 'my-input' }],
        },
        {
          kind: 'javascript-module',
          path: 'src/dialog.js',
          declarations: [{ kind: 'class', name: 'MyDialog', tagName: 'my-dialog' }],
        },
        {
          kind: 'javascript-module',
          path: 'src/foo.js',
          declarations: [{ kind: 'class', name: 'MyFoo', tagName: 'my-foo' }],
        },
      ],
    };
  }

  it('groups components by heuristic category', async () => {
    const cem = makeCemWithComponents();
    const result = await handleDiscoveryCall('list_components_by_category', {}, makeConfig(), cem);
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as {
      categories: Record<string, string[]>;
      total: number;
    };
    expect(data.categories['overlay']).toContain('my-dialog');
    expect(data.categories['form']).toContain('my-input');
    expect(data.total).toBe(4);
  });

  it('filters by category when category param provided', async () => {
    const cem = makeCemWithComponents();
    const result = await handleDiscoveryCall(
      'list_components_by_category',
      { category: 'overlay' },
      makeConfig(),
      cem,
    );
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as {
      categories: Record<string, string[]>;
      total: number;
    };
    expect(data.categories['overlay']).toContain('my-dialog');
    expect(data.total).toBe(1);
  });

  it('excludes uncategorized components by default', async () => {
    const cem = makeCemWithComponents();
    const result = await handleDiscoveryCall('list_components_by_category', {}, makeConfig(), cem);
    const data = JSON.parse(result.content[0].text) as {
      uncategorized: string[];
    };
    // uncategorized key exists but is empty array by default
    expect(data.uncategorized).toEqual([]);
  });

  it('includes uncategorized when includeUncategorized=true', async () => {
    const cem = makeCemWithComponents();
    const result = await handleDiscoveryCall(
      'list_components_by_category',
      { includeUncategorized: true },
      makeConfig(),
      cem,
    );
    const data = JSON.parse(result.content[0].text) as {
      uncategorized: string[];
    };
    expect(data.uncategorized).toContain('my-foo');
  });

  it('uses @category jsdocTag when present', async () => {
    const cem: Cem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/special.js',
          declarations: [
            {
              kind: 'class',
              name: 'MySpecial',
              tagName: 'my-special',
              jsdocTags: [{ name: 'category', description: 'data-display' }],
            },
          ],
        },
      ],
    };
    const result = await handleDiscoveryCall('list_components_by_category', {}, makeConfig(), cem);
    const data = JSON.parse(result.content[0].text) as {
      categories: Record<string, string[]>;
    };
    expect(data.categories['data-display']).toContain('my-special');
  });
});

// ---------------------------------------------------------------------------
// handleDiscoveryCall — find_component with matchReason
// ---------------------------------------------------------------------------

describe('handleDiscoveryCall — find_component with matchReason', () => {
  it('includes matchReason in output for matching component', async () => {
    vi.mocked(listAllComponents).mockReturnValue(['my-button']);
    vi.mocked(parseCem).mockReturnValue({
      tagName: 'my-button',
      name: 'my-button',
      description: 'A button component',
      members: [],
      events: [],
      slots: [],
      cssProperties: [],
      cssParts: [],
    });
    const result = await handleDiscoveryCall('find_component', { query: 'button' }, makeConfig());
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('matched tag name: button');
  });

  it('shows fuzzy match reason when query has a typo', async () => {
    vi.mocked(listAllComponents).mockReturnValue(['my-dialog']);
    vi.mocked(parseCem).mockReturnValue({
      tagName: 'my-dialog',
      name: 'my-dialog',
      description: 'A dialog component',
      members: [],
      events: [],
      slots: [],
      cssProperties: [],
      cssParts: [],
    });
    // 'dialg' is 1 edit from 'dialog'
    const result = await handleDiscoveryCall('find_component', { query: 'dialg' }, makeConfig());
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('fuzzy matched');
  });
});
