import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { benchmarkLibraries } from '../../src/handlers/benchmark.js';
import { MCPError } from '../../src/shared/error-handling.js';
import type { McpWcConfig } from '../../src/config.js';

const fixturesDir = join(import.meta.dirname, '../__fixtures__');

const baseConfig: McpWcConfig = {
  projectRoot: fixturesDir,
  cemPath: 'cem-v1.json',
  tokensPath: null,
  componentPrefix: '',
  packageName: 'test',
};

describe('benchmarkLibraries', () => {
  it('returns 2 scores sorted descending when given two fixture files', async () => {
    const result = await benchmarkLibraries(
      [
        { label: 'Shoelace', cemPath: 'cem-compare-a.json' },
        { label: 'Helix', cemPath: 'cem-compare-b.json' },
      ],
      baseConfig,
    );

    expect(result.scores).toHaveLength(2);
    // sorted descending
    expect(result.scores[0].score).toBeGreaterThanOrEqual(result.scores[1].score);
  });

  it('formatted output contains the markdown table pipe character', async () => {
    const result = await benchmarkLibraries(
      [
        { label: 'Shoelace', cemPath: 'cem-compare-a.json' },
        { label: 'Helix', cemPath: 'cem-compare-b.json' },
      ],
      baseConfig,
    );

    expect(result.formatted).toContain('|');
    expect(result.formatted).toContain('Library');
    expect(result.formatted).toContain('Score');
  });

  it('better-documented fixture (cem-compare-a) scores higher than sparse one', async () => {
    const result = await benchmarkLibraries(
      [
        { label: 'Shoelace', cemPath: 'cem-compare-a.json' },
        { label: 'Helix', cemPath: 'cem-compare-b.json' },
      ],
      baseConfig,
    );

    const shoelace = result.scores.find((s) => s.label === 'Shoelace')!;
    const helix = result.scores.find((s) => s.label === 'Helix')!;

    expect(shoelace).toBeDefined();
    expect(helix).toBeDefined();
    expect(shoelace.score).toBeGreaterThan(helix.score);
  });

  it('throws MCPError for path traversal input', async () => {
    await expect(
      benchmarkLibraries(
        [
          { label: 'Evil', cemPath: '../../../etc/passwd' },
          { label: 'Good', cemPath: 'cem-compare-a.json' },
        ],
        baseConfig,
      ),
    ).rejects.toThrow(MCPError);
  });

  it('throws MCPError for absolute path input', async () => {
    await expect(
      benchmarkLibraries(
        [
          { label: 'Evil', cemPath: '/etc/passwd' },
          { label: 'Good', cemPath: 'cem-compare-a.json' },
        ],
        baseConfig,
      ),
    ).rejects.toThrow(MCPError);
  });
});
