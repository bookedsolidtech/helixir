import { describe, it, expect, vi, afterEach } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import {
  parseCem,
  validateCompleteness,
  listAllComponents,
  diffCem,
  CemSchema,
} from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';
import { GitOperations } from '../../packages/core/src/shared/git.js';
import { ErrorCategory, MCPError } from '../../packages/core/src/shared/error-handling.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// Mock GitOperations so diffCem tests don't require a real git repo
let mockGitShowImpl: ((ref: string, filePath: string) => Promise<string>) | null = null;

vi.mock('../../packages/core/src/shared/git.js', () => {
  class MockGitOperations {
    async gitShow(ref: string, filePath: string): Promise<string> {
      if (!mockGitShowImpl) {
        throw new Error('Mock not configured');
      }
      return mockGitShowImpl(ref, filePath);
    }
  }

  return {
    GitOperations: MockGitOperations,
  };
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

// Load and parse fixture CEM once for all tests
const FIXTURE_CEM: Cem = CemSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'custom-elements.json'), 'utf-8')),
);

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
// parseCem
// ---------------------------------------------------------------------------

describe('parseCem', () => {
  it('returns metadata for an existing component', () => {
    const result = parseCem('my-button', FIXTURE_CEM);
    expect(result.tagName).toBe('my-button');
    expect(result.name).toBe('MyButton');
    expect(result.description).toContain('button');
  });

  it('returns correct field members for my-button', () => {
    const result = parseCem('my-button', FIXTURE_CEM);
    const fieldNames = result.members.filter((m) => m.kind === 'field').map((m) => m.name);
    expect(fieldNames).toContain('variant');
    expect(fieldNames).toContain('disabled');
    expect(fieldNames).toContain('loading');
    expect(fieldNames).toContain('size');
  });

  it('includes method members in the members array', () => {
    const result = parseCem('my-button', FIXTURE_CEM);
    const methodNames = result.members.filter((m) => m.kind === 'method').map((m) => m.name);
    expect(methodNames).toContain('focus');
    expect(methodNames).toContain('click');
  });

  it('returns correct events for my-button', () => {
    const result = parseCem('my-button', FIXTURE_CEM);
    const eventNames = result.events.map((e) => e.name);
    expect(eventNames).toContain('my-click');
    expect(eventNames).toContain('my-focus');
    expect(eventNames).toContain('my-blur');
  });

  it('returns typed event metadata', () => {
    const result = parseCem('my-button', FIXTURE_CEM);
    const myClick = result.events.find((e) => e.name === 'my-click');
    expect(myClick).toBeDefined();
    expect(myClick!.type).toBe('CustomEvent<{ originalEvent: MouseEvent }>');
    expect(myClick!.description).toContain('clicked');
  });

  it('returns empty strings for missing optional fields (my-blur)', () => {
    const result = parseCem('my-button', FIXTURE_CEM);
    const myBlur = result.events.find((e) => e.name === 'my-blur');
    expect(myBlur).toBeDefined();
    expect(myBlur!.description).toBe('');
    expect(myBlur!.type).toBe('');
  });

  it('returns correct slots for my-button', () => {
    const result = parseCem('my-button', FIXTURE_CEM);
    const slotNames = result.slots.map((s) => s.name);
    expect(slotNames).toContain('');
    expect(slotNames).toContain('prefix');
    expect(slotNames).toContain('suffix');
  });

  it('returns correct cssProperties for my-button', () => {
    const result = parseCem('my-button', FIXTURE_CEM);
    const propNames = result.cssProperties.map((p) => p.name);
    expect(propNames).toContain('--my-button-bg');
    expect(propNames).toContain('--my-button-color');
    expect(propNames).toContain('--my-button-border-radius');
    expect(propNames).toContain('--my-button-padding');
  });

  it('returns correct cssParts for my-button', () => {
    const result = parseCem('my-button', FIXTURE_CEM);
    const partNames = result.cssParts.map((p) => p.name);
    expect(partNames).toContain('base');
    expect(partNames).toContain('label');
    expect(partNames).toContain('spinner');
  });

  it('returns metadata for my-card', () => {
    const result = parseCem('my-card', FIXTURE_CEM);
    expect(result.tagName).toBe('my-card');
    expect(result.name).toBe('MyCard');
    expect(result.description).toContain('card');
  });

  it('throws MCPError with NOT_FOUND category for a missing component', () => {
    let err: unknown;
    try {
      parseCem('no-such-component', FIXTURE_CEM);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MCPError);
    expect((err as MCPError).category).toBe(ErrorCategory.NOT_FOUND);
  });

  it('throws MCPError mentioning the missing tag name', () => {
    let err: unknown;
    try {
      parseCem('unknown-element', FIXTURE_CEM);
    } catch (e) {
      err = e;
    }
    expect((err as MCPError).message).toContain('unknown-element');
  });
});

// ---------------------------------------------------------------------------
// validateCompleteness
// ---------------------------------------------------------------------------

describe('validateCompleteness', () => {
  it('returns an object with a numeric score and issues array', () => {
    const result = validateCompleteness('my-button', FIXTURE_CEM);
    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('score is between 0 and 100 inclusive', () => {
    const result = validateCompleteness('my-button', FIXTURE_CEM);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('detects missing description for field "size" in my-button', () => {
    const result = validateCompleteness('my-button', FIXTURE_CEM);
    const sizeIssue = result.issues.find(
      (i) => i.includes('size') && i.toLowerCase().includes('description'),
    );
    expect(sizeIssue).toBeDefined();
  });

  it('detects missing event description for "my-blur" in my-button', () => {
    const result = validateCompleteness('my-button', FIXTURE_CEM);
    const blurDesc = result.issues.find(
      (i) => i.includes('my-blur') && i.toLowerCase().includes('description'),
    );
    expect(blurDesc).toBeDefined();
  });

  it('detects missing event type annotation for "my-blur" in my-button', () => {
    const result = validateCompleteness('my-button', FIXTURE_CEM);
    const blurType = result.issues.find(
      (i) => i.includes('my-blur') && i.toLowerCase().includes('type'),
    );
    expect(blurType).toBeDefined();
  });

  it('detects missing CSS property description for "--my-button-padding"', () => {
    const result = validateCompleteness('my-button', FIXTURE_CEM);
    const paddingIssue = result.issues.find((i) => i.includes('--my-button-padding'));
    expect(paddingIssue).toBeDefined();
  });

  it('score is less than 100 for my-button (has incomplete docs)', () => {
    const result = validateCompleteness('my-button', FIXTURE_CEM);
    expect(result.score).toBeLessThan(100);
  });

  it('score is greater than 0 for my-button (has some docs)', () => {
    const result = validateCompleteness('my-button', FIXTURE_CEM);
    expect(result.score).toBeGreaterThan(0);
  });

  it('throws MCPError with NOT_FOUND for a missing component', () => {
    let err: unknown;
    try {
      validateCompleteness('no-such-component', FIXTURE_CEM);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MCPError);
    expect((err as MCPError).category).toBe(ErrorCategory.NOT_FOUND);
  });

  it('detects missing field description for "href" in my-card', () => {
    const result = validateCompleteness('my-card', FIXTURE_CEM);
    const hrefIssue = result.issues.find(
      (i) => i.includes('href') && i.toLowerCase().includes('description'),
    );
    expect(hrefIssue).toBeDefined();
  });

  it('detects missing event issues for "my-card-action" in my-card', () => {
    const result = validateCompleteness('my-card', FIXTURE_CEM);
    const actionIssues = result.issues.filter((i) => i.includes('my-card-action'));
    expect(actionIssues.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// listAllComponents
// ---------------------------------------------------------------------------

describe('listAllComponents', () => {
  it('returns all component tag names from the fixture', () => {
    const result = listAllComponents(FIXTURE_CEM);
    expect(result).toContain('my-button');
    expect(result).toContain('my-card');
    expect(result).toContain('my-select');
  });

  it('returns exactly 3 components from the fixture', () => {
    const result = listAllComponents(FIXTURE_CEM);
    expect(result).toHaveLength(3);
  });

  it('returns an array of strings', () => {
    const result = listAllComponents(FIXTURE_CEM);
    for (const tagName of result) {
      expect(typeof tagName).toBe('string');
    }
  });

  it('returns an empty array for a CEM with no components', () => {
    const emptyCem = CemSchema.parse({ schemaVersion: '1.0.0', modules: [] });
    const result = listAllComponents(emptyCem);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// diffCem
// ---------------------------------------------------------------------------

describe('diffCem', () => {
  function setMockGitShowImpl(mockFn: (ref: string, filePath: string) => Promise<string>) {
    mockGitShowImpl = mockFn;
  }

  it('returns isNew: true when component does not exist on base branch', async () => {
    const emptyCem = { schemaVersion: '1.0.0', modules: [] };
    setMockGitShowImpl(async () => JSON.stringify(emptyCem));

    const result = await diffCem('my-button', 'main', makeConfig(), FIXTURE_CEM);
    expect(result.isNew).toBe(true);
    expect(result.breaking).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
  });

  it('returns isNew: true when CEM file is missing on base branch (git show error)', async () => {
    setMockGitShowImpl(async () => {
      throw new Error('git show failed');
    });

    const result = await diffCem('my-button', 'main', makeConfig(), FIXTURE_CEM);
    expect(result.isNew).toBe(true);
  });

  it('returns no breaking changes when component is identical on both branches', async () => {
    setMockGitShowImpl(async () => JSON.stringify(FIXTURE_CEM));

    const result = await diffCem('my-button', 'main', makeConfig(), FIXTURE_CEM);
    expect(result.isNew).toBe(false);
    expect(result.breaking).toHaveLength(0);
  });

  it('detects breaking change when a property is removed from current (vs base)', async () => {
    // Base has an extra field "labelText" that is gone in current
    const baseCem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/components/my-button.js',
          declarations: [
            {
              kind: 'class',
              name: 'MyButton',
              tagName: 'my-button',
              description: 'A button',
              members: [
                {
                  kind: 'field',
                  name: 'variant',
                  type: { text: "'primary' | 'secondary' | 'danger'" },
                  description: 'Variant',
                },
                {
                  kind: 'field',
                  name: 'labelText',
                  type: { text: 'string' },
                  description: 'Label text (removed in current)',
                },
              ],
              events: [],
              slots: [],
              cssParts: [],
              cssProperties: [],
            },
          ],
        },
      ],
    };

    setMockGitShowImpl(async () => JSON.stringify(baseCem));

    const result = await diffCem('my-button', 'main', makeConfig(), FIXTURE_CEM);
    expect(result.isNew).toBe(false);
    const labelTextBreaking = result.breaking.find(
      (b) => b.includes('labelText') && b.toLowerCase().includes('removed'),
    );
    expect(labelTextBreaking).toBeDefined();
  });

  it('detects breaking change when a property type changes', async () => {
    // Base has variant with a narrower type — current broadens it, which counts as a type change
    const baseCem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/components/my-button.js',
          declarations: [
            {
              kind: 'class',
              name: 'MyButton',
              tagName: 'my-button',
              description: 'A button',
              members: [
                {
                  kind: 'field',
                  name: 'variant',
                  type: { text: "'primary' | 'secondary'" },
                  description: 'Variant',
                },
              ],
              events: [],
              slots: [],
              cssParts: [],
              cssProperties: [],
            },
          ],
        },
      ],
    };

    setMockGitShowImpl(async () => JSON.stringify(baseCem));

    const result = await diffCem('my-button', 'main', makeConfig(), FIXTURE_CEM);
    const typeChange = result.breaking.find(
      (b) => b.includes('variant') && b.toLowerCase().includes('type'),
    );
    expect(typeChange).toBeDefined();
  });

  it('detects breaking change when an event is removed', async () => {
    // Base has "my-legacy-event" that no longer exists in current fixture
    const baseCem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/components/my-button.js',
          declarations: [
            {
              kind: 'class',
              name: 'MyButton',
              tagName: 'my-button',
              description: 'A button',
              members: [],
              events: [
                {
                  name: 'my-click',
                  type: { text: 'CustomEvent' },
                  description: 'Click event',
                },
                {
                  name: 'my-legacy-event',
                  type: { text: 'CustomEvent' },
                  description: 'Removed in current',
                },
              ],
              slots: [],
              cssParts: [],
              cssProperties: [],
            },
          ],
        },
      ],
    };

    setMockGitShowImpl(async () => JSON.stringify(baseCem));

    const result = await diffCem('my-button', 'main', makeConfig(), FIXTURE_CEM);
    const eventRemoved = result.breaking.find(
      (b) => b.includes('my-legacy-event') && b.toLowerCase().includes('event'),
    );
    expect(eventRemoved).toBeDefined();
  });

  it('reports additions for properties present in current but not in base', async () => {
    // Base has only "variant"; current fixture also has disabled, loading, size
    const baseCem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/components/my-button.js',
          declarations: [
            {
              kind: 'class',
              name: 'MyButton',
              tagName: 'my-button',
              description: 'A button',
              members: [
                {
                  kind: 'field',
                  name: 'variant',
                  type: { text: "'primary' | 'secondary' | 'danger'" },
                  description: 'Variant',
                },
              ],
              events: [],
              slots: [],
              cssParts: [],
              cssProperties: [],
            },
          ],
        },
      ],
    };

    setMockGitShowImpl(async () => JSON.stringify(baseCem));

    const result = await diffCem('my-button', 'main', makeConfig(), FIXTURE_CEM);
    expect(result.isNew).toBe(false);
    expect(result.breaking).toHaveLength(0);
    // disabled, loading, size were added
    const hasDisabledAddition = result.additions.some((a) => a.includes('disabled'));
    expect(hasDisabledAddition).toBe(true);
  });

  it('reports event additions without treating them as breaking', async () => {
    // Base has no events; current has my-click, my-focus, my-blur
    const baseCem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/components/my-button.js',
          declarations: [
            {
              kind: 'class',
              name: 'MyButton',
              tagName: 'my-button',
              description: 'A button',
              members: [],
              events: [],
              slots: [],
              cssParts: [],
              cssProperties: [],
            },
          ],
        },
      ],
    };

    setMockGitShowImpl(async () => JSON.stringify(baseCem));

    const result = await diffCem('my-button', 'main', makeConfig(), FIXTURE_CEM);
    expect(result.breaking).toHaveLength(0);
    const hasClickAddition = result.additions.some((a) => a.includes('my-click'));
    expect(hasClickAddition).toBe(true);
  });

  it('throws MCPError NOT_FOUND when the component does not exist on the current branch', async () => {
    // parseCem throws synchronously before gitShow is called
    setMockGitShowImpl(async () => JSON.stringify({ schemaVersion: '1.0.0', modules: [] }));

    const err = await diffCem('no-such-component', 'main', makeConfig(), FIXTURE_CEM).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(MCPError);
    expect((err as MCPError).category).toBe(ErrorCategory.NOT_FOUND);
  });
});
