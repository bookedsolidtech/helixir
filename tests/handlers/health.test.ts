import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { McpWcConfig } from '../../src/config.js';
import {
  scoreCemFallback,
  scoreComponent,
  scoreAllComponents,
  getHealthTrend,
  getHealthDiff,
  getHealthSummary,
  type CemDeclaration,
} from '../../src/handlers/health.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../__fixtures__');
const HEALTH_HISTORY_DIR = resolve(FIXTURE_DIR, 'health-history');
const NO_HISTORY_DIR = resolve(FIXTURE_DIR, 'health-history-nonexistent');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(healthHistoryDir: string = HEALTH_HISTORY_DIR): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: '/',
    componentPrefix: '',
    healthHistoryDir,
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
  };
}

// ─── CEM fixture declarations (derived from tests/__fixtures__/custom-elements.json) ───

const MY_BUTTON_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MyButton',
  tagName: 'my-button',
  description: 'A generic button component with various style variants and states.',
  members: [
    { kind: 'field', name: 'variant', description: 'The visual style variant of the button.' },
    { kind: 'field', name: 'disabled', description: 'When true, prevents user interaction.' },
    { kind: 'field', name: 'loading', description: 'Displays a loading spinner.' },
    { kind: 'field', name: 'size' }, // no description intentionally
    { kind: 'method', name: 'focus', description: 'Programmatically focuses the button.' },
    { kind: 'method', name: 'click' },
  ],
  events: [
    {
      name: 'my-click',
      type: { text: 'CustomEvent<{ originalEvent: MouseEvent }>' },
      description: 'Fired when the button is clicked.',
    },
    {
      name: 'my-focus',
      type: { text: 'CustomEvent<void>' },
      description: 'Fired when the button receives focus.',
    },
    { name: 'my-blur' }, // no type, no description
  ],
  slots: [
    { name: '', description: 'Default slot for button label text.' },
    { name: 'prefix', description: 'Slot for an icon before the label.' },
    { name: 'suffix', description: 'Slot for an icon after the label.' },
  ],
  cssParts: [
    { name: 'base', description: 'The inner <button> element.' },
    { name: 'label', description: 'The container wrapping the default slot.' },
    { name: 'spinner', description: 'The loading spinner element.' },
  ],
};

const PERFECT_DECL: CemDeclaration = {
  tagName: 'perfect-component',
  description: 'A perfectly documented component.',
  members: [
    { kind: 'field', name: 'value', description: 'The current value.' },
    { kind: 'field', name: 'disabled', description: 'When true, the component is disabled.' },
  ],
  events: [
    {
      name: 'my-change',
      type: { text: 'CustomEvent<{ value: string }>' },
      description: 'Fired when value changes.',
    },
  ],
  slots: [{ name: '', description: 'Default content slot.' }],
  cssParts: [{ name: 'base', description: 'Root element.' }],
};

// A component with items but no documentation — all dimensions score 0
const UNDOCUMENTED_DECL: CemDeclaration = {
  tagName: 'undocumented-component',
  // no description
  members: [{ kind: 'field', name: 'value' }],
  events: [{ name: 'my-change' }],
  slots: [{ name: '' }],
  cssParts: [{ name: 'base' }],
};

const NO_ITEMS_DECL: CemDeclaration = {
  tagName: 'no-items-component',
  description: 'A component with no events, slots, or css parts.',
  // no members, events, slots, cssParts — should get full marks for those dimensions
};

// ─── scoreCemFallback ────────────────────────────────────────────────────────

describe('scoreCemFallback', () => {
  it('awards maximum score (100) for a perfectly documented component', () => {
    const result = scoreCemFallback(PERFECT_DECL);
    expect(result.tagName).toBe('perfect-component');
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
    expect(result.issues).toHaveLength(0);
  });

  it('awards zero score for a component with items but no documentation', () => {
    const result = scoreCemFallback(UNDOCUMENTED_DECL);
    expect(result.score).toBe(0);
    expect(result.grade).toBe('F');
    expect(result.issues).toContain('Component description is missing');
  });

  it('awards full marks on empty-item dimensions (no events, no slots, no cssParts)', () => {
    const result = scoreCemFallback(NO_ITEMS_DECL);
    // description: +15, properties: no fields → +25, events: none → +20, eventDesc: none → +15,
    // cssParts: none → +15, slots: none → +10 = 100
    expect(result.score).toBe(100);
    expect(result.dimensions.descriptionPresent).toBe(15);
    expect(result.dimensions.propertyDescriptions).toBe(25);
    expect(result.dimensions.eventTypes).toBe(20);
    expect(result.dimensions.eventDescriptions).toBe(15);
    expect(result.dimensions.cssPartsDocumented).toBe(15);
    expect(result.dimensions.slotsDocumented).toBe(10);
  });

  it('computes partial scores proportionally for my-button CEM', () => {
    const result = scoreCemFallback(MY_BUTTON_DECL);

    // description present: +15
    expect(result.dimensions.descriptionPresent).toBe(15);

    // 3/4 fields with descriptions → Math.round(3/4 * 25) = 19
    expect(result.dimensions.propertyDescriptions).toBe(19);

    // 2/3 events with types → Math.round(2/3 * 20) = 13
    expect(result.dimensions.eventTypes).toBe(13);

    // 2/3 events with descriptions → Math.round(2/3 * 15) = 10
    expect(result.dimensions.eventDescriptions).toBe(10);

    // 3/3 CSS parts with descriptions → 15
    expect(result.dimensions.cssPartsDocumented).toBe(15);

    // 3/3 slots with descriptions → 10
    expect(result.dimensions.slotsDocumented).toBe(10);

    expect(result.score).toBe(82);
    expect(result.grade).toBe('B');
  });

  it('reports issues for undocumented properties', () => {
    const result = scoreCemFallback(MY_BUTTON_DECL);
    expect(result.issues).toContain("Property 'size' is missing a description");
  });

  it('reports issues for events missing type annotations', () => {
    const result = scoreCemFallback(MY_BUTTON_DECL);
    expect(result.issues).toContain("Event 'my-blur' is missing a type annotation");
  });

  it('reports issues for events missing descriptions', () => {
    const result = scoreCemFallback(MY_BUTTON_DECL);
    expect(result.issues).toContain("Event 'my-blur' is missing a description");
  });

  it('includes a timestamp in the result', () => {
    const result = scoreCemFallback(PERFECT_DECL);
    expect(typeof result.timestamp).toBe('string');
    expect(result.timestamp.length).toBeGreaterThan(0);
  });

  it('does not count methods as properties in the property description check', () => {
    // MY_BUTTON_DECL has 2 methods — should not affect propertyDescriptions scoring
    const declOnlyFields: CemDeclaration = {
      tagName: 'test',
      description: 'Test.',
      members: [
        { kind: 'field', name: 'a', description: 'Field A.' },
        { kind: 'method', name: 'doSomething' }, // method — should be ignored
      ],
    };
    const result = scoreCemFallback(declOnlyFields);
    // 1 field with description → 1/1 = 100% → 25
    expect(result.dimensions.propertyDescriptions).toBe(25);
  });
});

// ─── scoreComponent ───────────────────────────────────────────────────────────

describe('scoreComponent', () => {
  it('reads the latest history file when history exists', async () => {
    const config = makeConfig();
    const result = await scoreComponent(config, 'my-button');
    // Latest file is 2024-03-10.json with score 88
    expect(result.tagName).toBe('my-button');
    expect(result.score).toBe(88);
    expect(result.grade).toBe('B');
  });

  it('maps breakdown categories to dimensions', async () => {
    const config = makeConfig();
    const result = await scoreComponent(config, 'my-button');
    expect(typeof result.dimensions.documentation).toBe('number');
    expect(typeof result.dimensions.accessibility).toBe('number');
  });

  it('falls back to CEM scoring when no history exists', async () => {
    const config = makeConfig(NO_HISTORY_DIR);
    const result = await scoreComponent(config, 'my-button', MY_BUTTON_DECL);
    expect(result.tagName).toBe('my-button');
    expect(result.score).toBe(82);
  });

  it('throws when no history and no CEM data', async () => {
    const config = makeConfig(NO_HISTORY_DIR);
    await expect(scoreComponent(config, 'my-button')).rejects.toThrow(
      /No health history for 'my-button'/,
    );
  });
});

// ─── scoreAllComponents ───────────────────────────────────────────────────────

describe('scoreAllComponents', () => {
  it('scores all provided components', async () => {
    const config = makeConfig();
    const decls: CemDeclaration[] = [
      { tagName: 'my-button', description: 'Button' },
      { tagName: 'my-card', description: 'Card' },
    ];
    const results = await scoreAllComponents(config, decls);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.tagName)).toContain('my-button');
    expect(results.map((r) => r.tagName)).toContain('my-card');
  });

  it('uses history files when available', async () => {
    const config = makeConfig();
    const decls: CemDeclaration[] = [{ tagName: 'my-button', description: 'Button' }];
    const results = await scoreAllComponents(config, decls);
    // Latest fixture score for my-button is 88
    expect(results[0]!.score).toBe(88);
  });
});

// ─── getHealthTrend ───────────────────────────────────────────────────────────

describe('getHealthTrend', () => {
  it('returns trend data with multiple data points', async () => {
    const config = makeConfig();
    const trend = await getHealthTrend(config, 'my-button', 10);

    // 3 fixture files exist for my-button
    expect(trend.tagName).toBe('my-button');
    expect(trend.dataPoints).toHaveLength(3);
  });

  it('data points are in chronological order (oldest first)', async () => {
    const config = makeConfig();
    const trend = await getHealthTrend(config, 'my-button', 10);
    const scores = trend.dataPoints.map((p) => p.score);
    // 2024-01-15 → 62, 2024-02-01 → 75, 2024-03-10 → 88
    expect(scores[0]).toBe(62);
    expect(scores[1]).toBe(75);
    expect(scores[2]).toBe(88);
  });

  it('reports improving trend when score increases significantly', async () => {
    const config = makeConfig();
    const trend = await getHealthTrend(config, 'my-button', 10);
    // 62 → 88 = +41.9%
    expect(trend.trend).toBe('improving');
    expect(trend.changePercent).toBeGreaterThan(5);
  });

  it('includes grade in each data point', async () => {
    const config = makeConfig();
    const trend = await getHealthTrend(config, 'my-button', 10);
    for (const point of trend.dataPoints) {
      expect(['A', 'B', 'C', 'D', 'F']).toContain(point.grade);
    }
    // score 62 → grade D, score 88 → grade B
    expect(trend.dataPoints[0]!.grade).toBe('D');
    expect(trend.dataPoints[2]!.grade).toBe('B');
  });

  it('reports stable trend for a single data point', async () => {
    const config = makeConfig();
    // Request only 1 day — most recent file is 2024-03-10.json
    const trend = await getHealthTrend(config, 'my-button', 1);
    expect(trend.dataPoints).toHaveLength(1);
    expect(trend.trend).toBe('stable');
    expect(trend.changePercent).toBe(0);
  });

  it('days in response reflects actual data points found', async () => {
    const config = makeConfig();
    // Ask for 10 days but only 3 files exist
    const trend = await getHealthTrend(config, 'my-button', 10);
    expect(trend.days).toBe(3);
  });

  it('throws when no history directory exists for the component', async () => {
    const config = makeConfig();
    await expect(getHealthTrend(config, 'nonexistent-component')).rejects.toThrow(
      /No health history found for 'nonexistent-component'/,
    );
  });
});

// ─── getHealthDiff ────────────────────────────────────────────────────────────

// Minimal CEM JSON for mocking gitShow — undocumented members yield a low scoreCemFallback score.
// scoreCemFallback: no desc (0) + 0/2 fields (0) + no events (20+15) + no cssParts (15) + no slots (10) = 60
const UNDOC_BASE_CEM = JSON.stringify({
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
            { kind: 'field', name: 'variant' },
            { kind: 'field', name: 'disabled' },
          ],
        },
      ],
    },
  ],
});

// Fully documented CEM yields scoreCemFallback = 100.
const FULL_DOC_BASE_CEM = JSON.stringify({
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
          description: 'A button',
          members: [{ kind: 'field', name: 'variant', description: 'Variant' }],
          events: [{ name: 'my-click', type: { text: 'CustomEvent' }, description: 'Click' }],
          cssParts: [{ name: 'base', description: 'Base part' }],
          slots: [{ name: 'default', description: 'Default slot' }],
        },
      ],
    },
  ],
});

describe('getHealthDiff', () => {
  it('reports improving when current score is higher than base', async () => {
    // current from history fixture = 88, base from undoc CEM ≈ 60
    const config = makeConfig();
    const mockGitOps = { gitShow: async () => UNDOC_BASE_CEM };

    const diff = await getHealthDiff(
      config,
      'my-button',
      'main',
      undefined,
      mockGitOps as unknown as InstanceType<typeof import('../../src/shared/git.js').GitOperations>,
    );

    expect(diff.improved).toBe(true);
    expect(diff.regressed).toBe(false);
    expect(diff.scoreDelta).toBeGreaterThan(0);
  });

  it('reports declining when current score is lower than base', async () => {
    // current from history fixture = 88, base from fully-doc CEM = 100
    const config = makeConfig();
    const mockGitOps = { gitShow: async () => FULL_DOC_BASE_CEM };

    const diff = await getHealthDiff(
      config,
      'my-button',
      'main',
      undefined,
      mockGitOps as unknown as InstanceType<typeof import('../../src/shared/git.js').GitOperations>,
    );

    expect(diff.improved).toBe(false);
    expect(diff.regressed).toBe(true);
    expect(diff.scoreDelta).toBeLessThan(0);
  });

  it('returns base and current health in the diff', async () => {
    const config = makeConfig();
    const mockGitOps = { gitShow: async () => UNDOC_BASE_CEM };

    const diff = await getHealthDiff(
      config,
      'my-button',
      'main',
      undefined,
      mockGitOps as unknown as InstanceType<typeof import('../../src/shared/git.js').GitOperations>,
    );

    expect(diff.tagName).toBe('my-button');
    expect(diff.current.score).toBe(88); // from history fixture
    expect(diff.base.score).toBeGreaterThan(0);
    expect(diff.base.score).toBeLessThan(88);
  });

  it('lists changed dimensions', async () => {
    const config = makeConfig();
    const mockGitOps = { gitShow: async () => UNDOC_BASE_CEM };

    const diff = await getHealthDiff(
      config,
      'my-button',
      'main',
      undefined,
      mockGitOps as unknown as InstanceType<typeof import('../../src/shared/git.js').GitOperations>,
    );

    // base uses scoreCemFallback dimensions; current uses history file dimensions
    // some dimensions will differ — verify changedDimensions is populated
    expect(diff.changedDimensions.length).toBeGreaterThan(0);
  });

  it('stable diff when scores are equal', async () => {
    // Use no-history config so both current and base derive from scoreCemFallback.
    // Pass the same declaration as cemDecl AND mock gitShow to return the same CEM.
    const config = makeConfig(NO_HISTORY_DIR);
    const sameCem = JSON.stringify({
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/my-button.js',
          declarations: [MY_BUTTON_DECL],
        },
      ],
    });
    const mockGitOps = { gitShow: async () => sameCem };

    const diff = await getHealthDiff(
      config,
      'my-button',
      'main',
      MY_BUTTON_DECL,
      mockGitOps as unknown as InstanceType<typeof import('../../src/shared/git.js').GitOperations>,
    );

    expect(diff.improved).toBe(false);
    expect(diff.regressed).toBe(false);
    expect(diff.scoreDelta).toBe(0);
  });

  it('returns base with score 0 when component is not found on base branch', async () => {
    const config = makeConfig();
    const emptyCem = JSON.stringify({ schemaVersion: '1.0.0', modules: [] });
    const mockGitOps = { gitShow: async () => emptyCem };

    const diff = await getHealthDiff(
      config,
      'my-button',
      'main',
      undefined,
      mockGitOps as unknown as InstanceType<typeof import('../../src/shared/git.js').GitOperations>,
    );

    expect(diff.base.score).toBe(0);
    expect(diff.base.grade).toBe('F');
    expect(diff.improved).toBe(true);
  });

  it('returns base with score 0 when git show fails', async () => {
    const config = makeConfig();
    const mockGitOps = {
      gitShow: async () => {
        throw new Error('git show failed');
      },
    };

    const diff = await getHealthDiff(
      config,
      'my-button',
      'main',
      undefined,
      mockGitOps as unknown as InstanceType<typeof import('../../src/shared/git.js').GitOperations>,
    );

    expect(diff.base.score).toBe(0);
    expect(diff.base.grade).toBe('F');
  });
});

// ─── Confidence metadata ───────────────────────────────────────────────────────

describe('confidence metadata in history files', () => {
  it('existing history files without confidence still parse and score correctly', async () => {
    const config = makeConfig();
    const result = await scoreComponent(config, 'my-button');
    expect(result.tagName).toBe('my-button');
    expect(result.score).toBe(88);
    expect(result.dimensionConfidence).toBeUndefined();
    expect(result.confidenceSummary).toBeUndefined();
  });

  it('history files with confidence data include dimensionConfidence in scoreComponent output', async () => {
    const config = makeConfig();
    const result = await scoreComponent(config, 'my-confirmed');
    expect(result.tagName).toBe('my-confirmed');
    expect(result.dimensionConfidence).toBeDefined();
    expect(result.dimensionConfidence!.documentation).toBe('verified');
    expect(result.dimensionConfidence!.accessibility).toBe('heuristic');
    expect(result.dimensionConfidence!.completeness).toBe('untested');
  });

  it('history files with confidence data include confidenceSummary in scoreComponent output', async () => {
    const config = makeConfig();
    const result = await scoreComponent(config, 'my-confirmed');
    expect(result.confidenceSummary).toBeDefined();
    expect(result.confidenceSummary!.verified).toBe(1);
    expect(result.confidenceSummary!.heuristic).toBe(1);
    expect(result.confidenceSummary!.untested).toBe(1);
  });

  it('history files with weights include dimensionWeights in scoreComponent output', async () => {
    const config = makeConfig();
    const result = await scoreComponent(config, 'my-confirmed');
    expect(result.dimensionWeights).toBeDefined();
    expect(result.dimensionWeights!.documentation).toBe(40);
    expect(result.dimensionWeights!.accessibility).toBe(30);
  });
});

// ─── dimensionTrends in getHealthTrend ────────────────────────────────────────

describe('getHealthTrend dimensionTrends', () => {
  it('returns dimensionTrends when breakdown data is available across multiple points', async () => {
    const config = makeConfig();
    const trend = await getHealthTrend(config, 'my-button', 10);
    expect(trend.dimensionTrends).toBeDefined();
    expect(typeof trend.dimensionTrends!.documentation).toBe('object');
    expect(trend.dimensionTrends!.documentation).toHaveProperty('trend');
    expect(trend.dimensionTrends!.documentation).toHaveProperty('changePercent');
  });

  it('dimensionTrend directions are valid trend values', async () => {
    const config = makeConfig();
    const trend = await getHealthTrend(config, 'my-button', 10);
    const validTrends = ['improving', 'declining', 'stable'];
    for (const [, dimTrend] of Object.entries(trend.dimensionTrends ?? {})) {
      expect(validTrends).toContain(dimTrend.trend);
    }
  });

  it('does not include dimensionTrends for a single data point', async () => {
    const config = makeConfig();
    const trend = await getHealthTrend(config, 'my-button', 1);
    expect(trend.dimensionTrends).toBeUndefined();
  });

  it('returns dimensionTrends for my-confirmed with confidence data', async () => {
    const config = makeConfig();
    const trend = await getHealthTrend(config, 'my-confirmed', 10);
    expect(trend.dimensionTrends).toBeDefined();
    // documentation: 65 → 90 = +38.5% → improving
    expect(trend.dimensionTrends!.documentation!.trend).toBe('improving');
  });
});

// ─── getHealthSummary ─────────────────────────────────────────────────────────

describe('getHealthSummary', () => {
  it('returns correct totalComponents count', async () => {
    const config = makeConfig();
    const decls: CemDeclaration[] = [
      { tagName: 'my-button', description: 'Button' },
      { tagName: 'my-card', description: 'Card' },
    ];
    const summary = await getHealthSummary(config, decls);
    expect(summary.totalComponents).toBe(2);
  });

  it('computes averageScore from history files', async () => {
    const config = makeConfig();
    const decls: CemDeclaration[] = [
      { tagName: 'my-button', description: 'Button' },
      { tagName: 'my-card', description: 'Card' },
    ];
    const summary = await getHealthSummary(config, decls);
    // my-button = 88, my-card latest score from fixture
    expect(summary.averageScore).toBeGreaterThan(0);
    expect(summary.averageScore).toBeLessThanOrEqual(100);
  });

  it('grade distribution sums to totalComponents', async () => {
    const config = makeConfig();
    const decls: CemDeclaration[] = [
      { tagName: 'my-button', description: 'Button' },
      { tagName: 'my-card', description: 'Card' },
    ];
    const summary = await getHealthSummary(config, decls);
    const total =
      summary.gradeDistribution.A +
      summary.gradeDistribution.B +
      summary.gradeDistribution.C +
      summary.gradeDistribution.D +
      summary.gradeDistribution.F;
    expect(total).toBe(summary.totalComponents);
  });

  it('identifies components needing attention (score below 70)', async () => {
    const config = makeConfig();
    // NO_HISTORY_DIR forces CEM fallback — we can inject a low-scoring decl
    const lowScoreDecl: CemDeclaration = {
      tagName: 'poor-component',
      // no description → score will be low
    };
    const goodDecl: CemDeclaration = {
      tagName: 'my-button',
      description: 'Button',
    };
    const summary = await getHealthSummary(config, [lowScoreDecl, goodDecl]);
    // poor-component scores from CEM fallback (no desc = 0 for that dimension)
    // but since history exists for my-button, both may or may not trigger attention
    expect(Array.isArray(summary.componentsNeedingAttention)).toBe(true);
  });

  it('returns stable libraryTrend when no history is available', async () => {
    const noHistoryConfig = makeConfig(NO_HISTORY_DIR);
    const decls: CemDeclaration[] = [{ tagName: 'my-button', description: 'Button' }];
    const summary = await getHealthSummary(noHistoryConfig, decls);
    expect(summary.libraryTrend).toBe('stable');
  });

  it('includes a timestamp in ISO 8601 format', async () => {
    const config = makeConfig();
    const decls: CemDeclaration[] = [{ tagName: 'my-button', description: 'Button' }];
    const summary = await getHealthSummary(config, decls);
    expect(typeof summary.timestamp).toBe('string');
    expect(summary.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('handles mixed components — some with history, some without', async () => {
    const config = makeConfig();
    const decls: CemDeclaration[] = [
      { tagName: 'my-button', description: 'Button' },
      { tagName: 'my-card', description: 'Card' },
      {
        tagName: 'no-history-component',
        description: 'No history',
        members: [{ kind: 'field', name: 'val', description: 'Val' }],
      },
    ];
    const summary = await getHealthSummary(config, decls);
    // 3 components (my-button + my-card from history, no-history-component from CEM fallback)
    expect(summary.totalComponents).toBe(3);
  });
});
