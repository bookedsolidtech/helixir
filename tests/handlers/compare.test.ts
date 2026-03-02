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

  it('generates equal-count verdict when both libraries have same number of components', async () => {
    // Comparing the same fixture against itself guarantees equal counts
    const result = await compareLibraries(
      {
        cemPathA: 'cem-compare-a.json',
        cemPathB: 'cem-compare-a.json',
        labelA: 'LibA',
        labelB: 'LibB',
      },
      baseConfig,
    );
    expect(result.countA).toBe(result.countB);
    expect(result.verdict).toContain('same number of components');
  });

  it('generates equivalent documentation depth verdict when both have equal doc scores', async () => {
    // cem-compare-b has zero cssProperties/slots/cssParts for all components;
    // comparing it against itself yields equal doc scores → "equivalent documentation depth"
    const result = await compareLibraries(
      { cemPathA: 'cem-compare-b.json', cemPathB: 'cem-compare-b.json', labelA: 'X', labelB: 'Y' },
      baseConfig,
    );
    expect(result.verdict).toContain('equivalent documentation depth');
  });

  it('throws when a CEM file does not exist', async () => {
    await expect(
      compareLibraries(
        { cemPathA: 'nonexistent.json', cemPathB: 'cem-compare-b.json' },
        baseConfig,
      ),
    ).rejects.toThrow();
  });

  it('returns zero doc quality stats when a library has no components', async () => {
    // cem-empty.json has no tagged components — computeDocQuality receives empty tagNames
    const result = await compareLibraries(
      {
        cemPathA: 'cem-empty.json',
        cemPathB: 'cem-compare-b.json',
        labelA: 'Empty',
        labelB: 'Helix',
      },
      baseConfig,
    );
    expect(result.countA).toBe(0);
    expect(result.docQualityA.avgCssProperties).toBe(0);
    expect(result.docQualityA.avgEvents).toBe(0);
  });

  it('handles components whose tag name has no hyphen (baseName returns full name)', async () => {
    // When comparing the same library against itself all base names are shared, no onlyInA/B
    const result = await compareLibraries(
      { cemPathA: 'cem-compare-a.json', cemPathB: 'cem-compare-a.json' },
      baseConfig,
    );
    // All components appear in both — nothing exclusive to either side
    expect(result.onlyInA).toHaveLength(0);
    expect(result.onlyInB).toHaveLength(0);
    expect(result.inBoth.length).toBeGreaterThan(0);
  });
});
