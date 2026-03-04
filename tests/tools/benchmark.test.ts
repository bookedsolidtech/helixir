import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BENCHMARK_TOOL_DEFINITIONS,
  handleBenchmarkCall,
  isBenchmarkTool,
} from '../../packages/core/src/tools/benchmark.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Mock benchmark handler ──────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/benchmark.js', () => ({
  benchmarkLibraries: vi.fn(),
}));

import { benchmarkLibraries } from '../../packages/core/src/handlers/benchmark.js';

// ─── Config fixture ───────────────────────────────────────────────────────────

function makeConfig(): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: '/fake/project',
    componentPrefix: '',
    tokensPath: null,
    cdnBase: null,
    watch: false,
    packageName: 'test',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ─── BENCHMARK_TOOL_DEFINITIONS ───────────────────────────────────────────────

describe('BENCHMARK_TOOL_DEFINITIONS', () => {
  it('exports exactly 1 tool definition', () => {
    expect(BENCHMARK_TOOL_DEFINITIONS).toHaveLength(1);
  });

  it('includes benchmark_libraries', () => {
    const names = BENCHMARK_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('benchmark_libraries');
  });

  it('tool definition has additionalProperties: false', () => {
    for (const tool of BENCHMARK_TOOL_DEFINITIONS) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });
});

// ─── isBenchmarkTool ──────────────────────────────────────────────────────────

describe('isBenchmarkTool', () => {
  it('returns true for benchmark_libraries', () => {
    expect(isBenchmarkTool('benchmark_libraries')).toBe(true);
  });

  it('returns false for unknown names', () => {
    expect(isBenchmarkTool('get_component')).toBe(false);
    expect(isBenchmarkTool('')).toBe(false);
    expect(isBenchmarkTool('benchmark')).toBe(false);
  });
});

// ─── handleBenchmarkCall — benchmark_libraries ────────────────────────────────

describe('handleBenchmarkCall — benchmark_libraries', () => {
  const twoLibs = [
    { label: 'Shoelace', cemPath: 'cem-compare-a.json' },
    { label: 'Helix', cemPath: 'cem-compare-b.json' },
  ];

  it('returns scores and formatted markdown on success', async () => {
    const fakeResult = {
      scores: [
        { label: 'Shoelace', componentCount: 3, avgProperties: 4, avgEvents: 2, avgSlots: 1, avgCssProps: 5, docQualityPct: 80, score: 90 },
        { label: 'Helix', componentCount: 2, avgProperties: 2, avgEvents: 1, avgSlots: 0, avgCssProps: 1, docQualityPct: 0, score: 30 },
      ],
      formatted: '## Library Benchmark Results\n| Library | ...',
    };
    vi.mocked(benchmarkLibraries).mockResolvedValue(fakeResult);

    const result = await handleBenchmarkCall(
      'benchmark_libraries',
      { libraries: twoLibs },
      makeConfig(),
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as typeof fakeResult;
    expect(data.scores).toHaveLength(2);
    expect(data.formatted).toContain('Library Benchmark Results');
  });

  it('rejects fewer than 2 libraries', async () => {
    const result = await handleBenchmarkCall(
      'benchmark_libraries',
      { libraries: [{ label: 'OnlyOne', cemPath: 'cem.json' }] },
      makeConfig(),
    );

    expect(result.isError).toBe(true);
  });

  it('rejects more than 10 libraries', async () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      label: `Lib${i}`,
      cemPath: `cem-${i}.json`,
    }));

    const result = await handleBenchmarkCall(
      'benchmark_libraries',
      { libraries: tooMany },
      makeConfig(),
    );

    expect(result.isError).toBe(true);
  });

  it('rejects path traversal in cemPath', async () => {
    const result = await handleBenchmarkCall(
      'benchmark_libraries',
      {
        libraries: [
          { label: 'Evil', cemPath: '../../../etc/passwd' },
          { label: 'Good', cemPath: 'cem.json' },
        ],
      },
      makeConfig(),
    );

    expect(result.isError).toBe(true);
  });

  it('rejects absolute cemPath', async () => {
    const result = await handleBenchmarkCall(
      'benchmark_libraries',
      {
        libraries: [
          { label: 'Evil', cemPath: '/etc/passwd' },
          { label: 'Good', cemPath: 'cem.json' },
        ],
      },
      makeConfig(),
    );

    expect(result.isError).toBe(true);
  });

  it('returns error when handler throws', async () => {
    vi.mocked(benchmarkLibraries).mockRejectedValue(new Error('File not found'));

    const result = await handleBenchmarkCall(
      'benchmark_libraries',
      { libraries: twoLibs },
      makeConfig(),
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('File not found');
  });

  it('returns error for unknown tool name', async () => {
    const result = await handleBenchmarkCall('unknown_tool', {}, makeConfig());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown benchmark tool');
  });
});
