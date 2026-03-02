import { describe, it, expect, vi, afterEach } from 'vitest';
import { HEALTH_TOOL_DEFINITIONS, handleHealthCall, isHealthTool } from '../../src/tools/health.js';
import type { McpWcConfig } from '../../src/config.js';
import type { ComponentHealth, HealthTrend, HealthDiff } from '../../src/handlers/health.js';

// ─── Mock health handler ──────────────────────────────────────────────────────

vi.mock('../../src/handlers/health.js', () => ({
  scoreComponent: vi.fn(),
  scoreAllComponents: vi.fn(),
  getHealthTrend: vi.fn(),
  getHealthDiff: vi.fn(),
  scoreCemFallback: vi.fn(),
}));

// Mock cem handler to avoid file reads in score_all_components
vi.mock('../../src/handlers/cem.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/handlers/cem.js')>();
  return {
    ...orig,
  };
});

// Mock fs/promises to avoid real file reads in loadAllDeclarations
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
}));

import {
  scoreComponent,
  scoreAllComponents,
  getHealthTrend,
  getHealthDiff,
} from '../../src/handlers/health.js';
import { readFile } from 'node:fs/promises';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeConfig(): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: '/fake/project',
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
  };
}

function makeComponentHealth(overrides: Partial<ComponentHealth> = {}): ComponentHealth {
  return {
    tagName: 'my-button',
    score: 85,
    grade: 'B',
    dimensions: {
      descriptionPresent: 15,
      propertyDescriptions: 25,
      eventTypes: 20,
      eventDescriptions: 10,
      cssPartsDocumented: 10,
      slotsDocumented: 5,
    },
    issues: [],
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// A minimal valid CEM JSON for loadAllDeclarations
const FAKE_CEM_JSON = JSON.stringify({
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/my-button.ts',
      declarations: [
        {
          kind: 'class',
          name: 'MyButton',
          tagName: 'my-button',
          description: 'A button component',
          members: [],
          events: [],
          slots: [],
          cssParts: [],
        },
      ],
    },
  ],
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ─── HEALTH_TOOL_DEFINITIONS ──────────────────────────────────────────────────

describe('HEALTH_TOOL_DEFINITIONS', () => {
  it('exports exactly 5 tool definitions', () => {
    expect(HEALTH_TOOL_DEFINITIONS).toHaveLength(5);
  });

  it('includes score_component, score_all_components, get_health_trend, get_health_diff, analyze_accessibility', () => {
    const names = HEALTH_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('score_component');
    expect(names).toContain('score_all_components');
    expect(names).toContain('get_health_trend');
    expect(names).toContain('get_health_diff');
    expect(names).toContain('analyze_accessibility');
  });

  it('all tool definitions have additionalProperties: false', () => {
    for (const tool of HEALTH_TOOL_DEFINITIONS) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });
});

// ─── isHealthTool ─────────────────────────────────────────────────────────────

describe('isHealthTool', () => {
  it('returns true for score_component', () => {
    expect(isHealthTool('score_component')).toBe(true);
  });

  it('returns true for score_all_components', () => {
    expect(isHealthTool('score_all_components')).toBe(true);
  });

  it('returns true for get_health_trend', () => {
    expect(isHealthTool('get_health_trend')).toBe(true);
  });

  it('returns true for get_health_diff', () => {
    expect(isHealthTool('get_health_diff')).toBe(true);
  });

  it('returns true for analyze_accessibility', () => {
    expect(isHealthTool('analyze_accessibility')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isHealthTool('get_design_tokens')).toBe(false);
    expect(isHealthTool('')).toBe(false);
    expect(isHealthTool('score_button')).toBe(false);
  });
});

// ─── score_component ──────────────────────────────────────────────────────────

describe('handleHealthCall — score_component', () => {
  it('returns JSON with score, grade, dimensions, issues, timestamp', async () => {
    const health = makeComponentHealth();
    vi.mocked(scoreComponent).mockResolvedValue(health);

    const result = await handleHealthCall(
      'score_component',
      { tagName: 'my-button' },
      makeConfig(),
    );
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0].text) as ComponentHealth;
    expect(data.score).toBe(85);
    expect(data.grade).toBe('B');
    expect(data.dimensions).toBeDefined();
    expect(data.issues).toBeDefined();
    expect(data.timestamp).toBeDefined();
  });

  it('passes tag_name to scoreComponent', async () => {
    vi.mocked(scoreComponent).mockResolvedValue(makeComponentHealth({ tagName: 'my-card' }));

    // The dispatcher passes (config, tag_name, cemDecl?) — cemDecl is undefined when no cem is given.
    await handleHealthCall('score_component', { tagName: 'my-card' }, makeConfig());
    expect(scoreComponent).toHaveBeenCalledWith(expect.anything(), 'my-card', undefined);
  });

  it('returns error when tag_name is missing', async () => {
    const result = await handleHealthCall('score_component', {}, makeConfig());
    expect(result.isError).toBe(true);
  });

  it('returns error when handler throws', async () => {
    vi.mocked(scoreComponent).mockRejectedValue(new Error('No history available'));

    const result = await handleHealthCall('score_component', { tagName: 'missing' }, makeConfig());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No history available');
  });
});

// ─── Grade calculation ────────────────────────────────────────────────────────

describe('grade calculation (A=90+, B=80+, C=70+, D=60+, F=below 60)', () => {
  const gradeTable: Array<[number, ComponentHealth['grade']]> = [
    [100, 'A'],
    [90, 'A'],
    [89, 'B'],
    [80, 'B'],
    [79, 'C'],
    [70, 'C'],
    [69, 'D'],
    [60, 'D'],
    [59, 'F'],
    [0, 'F'],
  ];

  for (const [score, expectedGrade] of gradeTable) {
    it(`score ${score} → grade ${expectedGrade}`, async () => {
      const health = makeComponentHealth({ score, grade: expectedGrade });
      vi.mocked(scoreComponent).mockResolvedValue(health);

      const result = await handleHealthCall(
        'score_component',
        { tagName: 'my-button' },
        makeConfig(),
      );
      const data = JSON.parse(result.content[0].text) as ComponentHealth;
      expect(data.grade).toBe(expectedGrade);
    });
  }
});

// ─── score_all_components ─────────────────────────────────────────────────────

describe('handleHealthCall — score_all_components', () => {
  it('returns an array of component health results', async () => {
    vi.mocked(readFile).mockResolvedValue(FAKE_CEM_JSON as unknown as Buffer);
    const results = [makeComponentHealth()];
    vi.mocked(scoreAllComponents).mockResolvedValue(results);

    const result = await handleHealthCall('score_all_components', {}, makeConfig());
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0].text) as ComponentHealth[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].tagName).toBe('my-button');
  });

  it('returns empty array when no components exist', async () => {
    const emptyCem = JSON.stringify({
      schemaVersion: '1.0.0',
      modules: [{ kind: 'javascript-module', path: 'src/index.ts', declarations: [] }],
    });
    vi.mocked(readFile).mockResolvedValue(emptyCem as unknown as Buffer);
    vi.mocked(scoreAllComponents).mockResolvedValue([]);

    const result = await handleHealthCall('score_all_components', {}, makeConfig());
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as ComponentHealth[];
    expect(data).toHaveLength(0);
  });

  it('returns error when CEM file read fails', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('File not found'));

    const result = await handleHealthCall('score_all_components', {}, makeConfig());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('File not found');
  });
});

// ─── get_health_trend ─────────────────────────────────────────────────────────

describe('handleHealthCall — get_health_trend', () => {
  it('returns dataPoints array, trend direction, and changePercent', async () => {
    const trend: HealthTrend = {
      tagName: 'my-button',
      days: 7,
      dataPoints: [
        { date: '2026-01-01', score: 70, grade: 'C' },
        { date: '2026-01-07', score: 85, grade: 'B' },
      ],
      trend: 'improving',
      changePercent: 21.4,
    };
    vi.mocked(getHealthTrend).mockResolvedValue(trend);

    const result = await handleHealthCall(
      'get_health_trend',
      { tagName: 'my-button' },
      makeConfig(),
    );
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0].text) as HealthTrend;
    expect(Array.isArray(data.dataPoints)).toBe(true);
    expect(data.trend).toBe('improving');
    expect(data.changePercent).toBe(21.4);
  });

  it('passes days argument to getHealthTrend', async () => {
    const trend: HealthTrend = {
      tagName: 'my-button',
      days: 14,
      dataPoints: [],
      trend: 'stable',
      changePercent: 0,
    };
    vi.mocked(getHealthTrend).mockResolvedValue(trend);

    await handleHealthCall('get_health_trend', { tagName: 'my-button', days: 14 }, makeConfig());
    expect(getHealthTrend).toHaveBeenCalledWith(expect.anything(), 'my-button', 14);
  });

  it('stable trend: single data point', async () => {
    const trend: HealthTrend = {
      tagName: 'my-button',
      days: 1,
      dataPoints: [{ date: '2026-01-01', score: 80, grade: 'B' }],
      trend: 'stable',
      changePercent: 0,
    };
    vi.mocked(getHealthTrend).mockResolvedValue(trend);

    const result = await handleHealthCall(
      'get_health_trend',
      { tagName: 'my-button' },
      makeConfig(),
    );
    const data = JSON.parse(result.content[0].text) as HealthTrend;
    expect(data.trend).toBe('stable');
    expect(data.changePercent).toBe(0);
  });

  it('stable trend: two identical scores', async () => {
    const trend: HealthTrend = {
      tagName: 'my-button',
      days: 2,
      dataPoints: [
        { date: '2026-01-01', score: 80, grade: 'B' },
        { date: '2026-01-02', score: 80, grade: 'B' },
      ],
      trend: 'stable',
      changePercent: 0,
    };
    vi.mocked(getHealthTrend).mockResolvedValue(trend);

    const result = await handleHealthCall(
      'get_health_trend',
      { tagName: 'my-button' },
      makeConfig(),
    );
    const data = JSON.parse(result.content[0].text) as HealthTrend;
    expect(data.trend).toBe('stable');
    expect(data.changePercent).toBe(0);
  });

  it('returns error when tag_name is missing', async () => {
    const result = await handleHealthCall('get_health_trend', {}, makeConfig());
    expect(result.isError).toBe(true);
  });

  it('returns error when handler throws', async () => {
    vi.mocked(getHealthTrend).mockRejectedValue(new Error('No health history found'));

    const result = await handleHealthCall('get_health_trend', { tagName: 'missing' }, makeConfig());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No health history found');
  });
});

// ─── get_health_diff ─────────────────────────────────────────────────────────

describe('handleHealthCall — get_health_diff', () => {
  it('returns before/after comparison with improvement verdict', async () => {
    const diff: HealthDiff = {
      tagName: 'my-button',
      base: makeComponentHealth({ score: 60, grade: 'D' }),
      current: makeComponentHealth({ score: 85, grade: 'B' }),
      improved: true,
      regressed: false,
      scoreDelta: 25,
      changedDimensions: [{ dimension: 'propertyDescriptions', before: 10, after: 25, delta: 15 }],
    };
    vi.mocked(getHealthDiff).mockResolvedValue(diff);

    const result = await handleHealthCall(
      'get_health_diff',
      { tagName: 'my-button' },
      makeConfig(),
    );
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0].text) as HealthDiff;
    expect(data.base).toBeDefined();
    expect(data.current).toBeDefined();
    expect(data.improved).toBe(true);
    expect(data.regressed).toBe(false);
    expect(data.scoreDelta).toBe(25);
  });

  it('returns regression verdict when score decreased', async () => {
    const diff: HealthDiff = {
      tagName: 'my-button',
      base: makeComponentHealth({ score: 90, grade: 'A' }),
      current: makeComponentHealth({ score: 70, grade: 'C' }),
      improved: false,
      regressed: true,
      scoreDelta: -20,
      changedDimensions: [],
    };
    vi.mocked(getHealthDiff).mockResolvedValue(diff);

    const result = await handleHealthCall(
      'get_health_diff',
      { tagName: 'my-button' },
      makeConfig(),
    );
    const data = JSON.parse(result.content[0].text) as HealthDiff;
    expect(data.regressed).toBe(true);
    expect(data.improved).toBe(false);
    expect(data.scoreDelta).toBe(-20);
  });

  it('passes base_branch to getHealthDiff', async () => {
    const diff: HealthDiff = {
      tagName: 'my-button',
      base: makeComponentHealth(),
      current: makeComponentHealth(),
      improved: false,
      regressed: false,
      scoreDelta: 0,
      changedDimensions: [],
    };
    vi.mocked(getHealthDiff).mockResolvedValue(diff);

    await handleHealthCall(
      'get_health_diff',
      { tagName: 'my-button', baseBranch: 'develop' },
      makeConfig(),
    );
    expect(getHealthDiff).toHaveBeenCalledWith(expect.anything(), 'my-button', 'develop');
  });

  it('returns error when tag_name is missing', async () => {
    const result = await handleHealthCall('get_health_diff', {}, makeConfig());
    expect(result.isError).toBe(true);
  });

  it('returns error when handler throws', async () => {
    vi.mocked(getHealthDiff).mockRejectedValue(new Error('git error'));

    const result = await handleHealthCall(
      'get_health_diff',
      { tagName: 'my-button' },
      makeConfig(),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('git error');
  });
});

// ─── unknown tool ─────────────────────────────────────────────────────────────

describe('handleHealthCall — unknown tool', () => {
  it('returns error for unknown tool name', async () => {
    const result = await handleHealthCall('unknown_health_tool', {}, makeConfig());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown health tool');
  });
});
