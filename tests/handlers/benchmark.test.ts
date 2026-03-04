import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { benchmarkLibraries } from '../../packages/core/src/handlers/benchmark.js';
import { MCPError } from '../../packages/core/src/shared/error-handling.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

const fixturesDir = join(import.meta.dirname, '../__fixtures__');

const baseConfig: McpWcConfig = {
  projectRoot: fixturesDir,
  cemPath: 'cem-v1.json',
  tokensPath: null,
  cdnBase: null,
  watch: false,
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

  it('error message for missing file uses relative path in display prefix', async () => {
    let errorMessage = '';
    try {
      await benchmarkLibraries(
        [
          { label: 'Missing', cemPath: 'nonexistent.json' },
          { label: 'Good', cemPath: 'cem-compare-a.json' },
        ],
        baseConfig,
      );
    } catch (e) {
      errorMessage = (e as Error).message;
    }
    expect(errorMessage).toBeTruthy();
    // The display path in the error prefix must be relative (not absolute)
    expect(errorMessage).not.toMatch(
      new RegExp(`"${fixturesDir.replace(/\//g, '\\/')}/nonexistent\\.json"`),
    );
    expect(errorMessage).toContain('"nonexistent.json"');
  });

  it('returns zero scores for a library with no tagged components (n===0 branch)', async () => {
    const result = await benchmarkLibraries(
      [
        { label: 'Empty', cemPath: 'cem-empty.json' },
        { label: 'Shoelace', cemPath: 'cem-compare-a.json' },
      ],
      baseConfig,
    );
    const empty = result.scores.find((s) => s.label === 'Empty')!;
    expect(empty).toBeDefined();
    expect(empty.componentCount).toBe(0);
    expect(empty.avgProperties).toBe(0);
    expect(empty.avgEvents).toBe(0);
    expect(empty.avgSlots).toBe(0);
    expect(empty.avgCssProps).toBe(0);
    expect(empty.docQualityPct).toBe(0);
  });

  it('handles libraries where all metrics are zero (0.001 floor in normalizeAndScore)', async () => {
    // Two empty-component libraries → all raw metrics are 0 → normalizeAndScore uses 0.001 floor
    const result = await benchmarkLibraries(
      [
        { label: 'EmptyA', cemPath: 'cem-empty.json' },
        { label: 'EmptyB', cemPath: 'cem-empty.json' },
      ],
      baseConfig,
    );
    expect(result.scores).toHaveLength(2);
    // Both should score 0 (0/0.001 * weight = 0 for all)
    for (const s of result.scores) {
      expect(s.score).toBe(0);
    }
  });

  it('counts only field-kind members toward avgProperties (methods excluded)', async () => {
    // custom-elements.json my-button has both field and method members;
    // only fields should count toward avgProperties
    const result = await benchmarkLibraries(
      [
        { label: 'MyLib', cemPath: 'custom-elements.json' },
        { label: 'Helix', cemPath: 'cem-compare-b.json' },
      ],
      { ...baseConfig, cemPath: 'custom-elements.json' },
    );
    const myLib = result.scores.find((s) => s.label === 'MyLib')!;
    expect(myLib).toBeDefined();
    // my-button has 4 fields and 2 methods — avgProperties should reflect only fields
    expect(myLib.avgProperties).toBeGreaterThan(0);
  });

  it('formatted output includes Category Winners section', async () => {
    const result = await benchmarkLibraries(
      [
        { label: 'Shoelace', cemPath: 'cem-compare-a.json' },
        { label: 'Helix', cemPath: 'cem-compare-b.json' },
      ],
      baseConfig,
    );
    expect(result.formatted).toContain('## Category Winners');
    expect(result.formatted).toContain('Overall Winner');
    expect(result.formatted).toContain('Best Property Coverage');
  });

  it('handles members with empty description string (docQualityPct stays 0 for undescribed members)', async () => {
    // cem-compare-b has minimal components with no member descriptions
    const result = await benchmarkLibraries(
      [
        { label: 'Sparse', cemPath: 'cem-compare-b.json' },
        { label: 'Shoelace', cemPath: 'cem-compare-a.json' },
      ],
      baseConfig,
    );
    const sparse = result.scores.find((s) => s.label === 'Sparse')!;
    expect(sparse).toBeDefined();
    // cem-compare-b members (if any) have no descriptions → docQualityPct = 0
    expect(sparse.docQualityPct).toBe(0);
  });
});
