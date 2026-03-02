import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { compareLibraries } from '../../src/handlers/compare.js';
import type { McpWcConfig } from '../../src/config.js';

const fixturesDir = join(import.meta.dirname, '../__fixtures__');

const baseConfig: McpWcConfig = {
  projectRoot: fixturesDir,
  cemPath: 'cem-v1.json',
  tokensPath: null,
  componentPrefix: '',
  packageName: 'test',
};

describe('compareLibraries', () => {
  it('returns correct component counts for both libraries', async () => {
    const result = await compareLibraries(
      {
        cemPathA: 'cem-compare-a.json',
        cemPathB: 'cem-compare-b.json',
        labelA: 'Shoelace',
        labelB: 'Helix',
      },
      baseConfig,
    );

    expect(result.labelA).toBe('Shoelace');
    expect(result.labelB).toBe('Helix');
    expect(result.countA).toBe(3); // sl-button, sl-dialog, sl-tooltip
    expect(result.countB).toBe(2); // hx-button, hx-select
  });

  it('correctly identifies components only in A and only in B', async () => {
    const result = await compareLibraries(
      { cemPathA: 'cem-compare-a.json', cemPathB: 'cem-compare-b.json' },
      baseConfig,
    );

    // sl-dialog and sl-tooltip are only in A (no hx-dialog or hx-tooltip in B)
    expect(result.onlyInA).toContain('sl-dialog');
    expect(result.onlyInA).toContain('sl-tooltip');

    // hx-select is only in B (no sl-select in A)
    expect(result.onlyInB).toContain('hx-select');
  });

  it('correctly matches components present in both by suffix', async () => {
    const result = await compareLibraries(
      { cemPathA: 'cem-compare-a.json', cemPathB: 'cem-compare-b.json' },
      baseConfig,
    );

    // sl-button (A) and hx-button (B) should match on "button"
    expect(result.inBoth).toHaveLength(1);
    expect(result.inBoth[0]).toMatchObject({
      baseName: 'button',
      tagNameA: 'sl-button',
      tagNameB: 'hx-button',
    });
  });

  it('builds a feature matrix covering all unique base names', async () => {
    const result = await compareLibraries(
      { cemPathA: 'cem-compare-a.json', cemPathB: 'cem-compare-b.json' },
      baseConfig,
    );

    // Should have 4 unique base names: button, dialog, select, tooltip
    expect(result.featureMatrix).toHaveLength(4);

    const buttonRow = result.featureMatrix.find((r) => r.component === 'button');
    expect(buttonRow).toEqual({ component: 'button', inA: true, inB: true });

    const dialogRow = result.featureMatrix.find((r) => r.component === 'dialog');
    expect(dialogRow).toEqual({ component: 'dialog', inA: true, inB: false });

    const selectRow = result.featureMatrix.find((r) => r.component === 'select');
    expect(selectRow).toEqual({ component: 'select', inA: false, inB: true });
  });

  it('computes doc quality stats for each library', async () => {
    const result = await compareLibraries(
      { cemPathA: 'cem-compare-a.json', cemPathB: 'cem-compare-b.json' },
      baseConfig,
    );

    // Library A: sl-button has 2 cssProps, 1 event, 1 slot, 1 cssPart; others have 0
    // avgCssProperties = 2/3 ≈ 0.7
    expect(result.docQualityA.avgCssProperties).toBeCloseTo(0.7, 1);
    expect(result.docQualityA.avgEvents).toBeCloseTo(1 / 3, 1);
    expect(result.docQualityA.avgSlots).toBeCloseTo(1 / 3, 1);
    expect(result.docQualityA.avgCssParts).toBeCloseTo(1 / 3, 1);

    // Library B: hx-button has 0 everything; hx-select has 1 event
    expect(result.docQualityB.avgCssProperties).toBe(0);
    expect(result.docQualityB.avgEvents).toBe(0.5);
    expect(result.docQualityB.avgSlots).toBe(0);
    expect(result.docQualityB.avgCssParts).toBe(0);
  });

  it('produces a verdict string', async () => {
    const result = await compareLibraries(
      {
        cemPathA: 'cem-compare-a.json',
        cemPathB: 'cem-compare-b.json',
        labelA: 'Shoelace',
        labelB: 'Helix',
      },
      baseConfig,
    );

    expect(typeof result.verdict).toBe('string');
    expect(result.verdict.length).toBeGreaterThan(0);
    // Shoelace has more components
    expect(result.verdict).toContain('Shoelace');
  });

  it('defaults labels to path names when not provided', async () => {
    const result = await compareLibraries(
      { cemPathA: 'cem-compare-a.json', cemPathB: 'cem-compare-b.json' },
      baseConfig,
    );

    expect(result.labelA).toBe('cem-compare-a.json');
    expect(result.labelB).toBe('cem-compare-b.json');
  });

  it('rejects path traversal in cemPathA', async () => {
    await expect(
      compareLibraries({ cemPathA: '../etc/passwd', cemPathB: 'cem-compare-b.json' }, baseConfig),
    ).rejects.toThrow();
  });

  it('rejects path traversal in cemPathB', async () => {
    await expect(
      compareLibraries({ cemPathA: 'cem-compare-a.json', cemPathB: '../etc/passwd' }, baseConfig),
    ).rejects.toThrow();
  });

  it('rejects absolute path in cemPathA', async () => {
    await expect(
      compareLibraries({ cemPathA: '/etc/passwd', cemPathB: 'cem-compare-b.json' }, baseConfig),
    ).rejects.toThrow();
  });

  it('rejects absolute path in cemPathB', async () => {
    await expect(
      compareLibraries({ cemPathA: 'cem-compare-a.json', cemPathB: '/etc/passwd' }, baseConfig),
    ).rejects.toThrow();
  });
});
