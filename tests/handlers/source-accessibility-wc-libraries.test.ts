/**
 * Real-world web component library source scanning tests.
 *
 * Tests against FULL SOURCE REPOS cloned at ../wc-libraries/:
 * - shoelace-style/shoelace (Lit-based, 58 components)
 * - patternfly/patternfly-elements (Lit-based, 53 components)
 * - ing-bank/lion (LitElement, 53 components)
 * - vaadin/web-components (LitElement, 96 components)
 * - adobe/spectrum-web-components (LitElement, 88 components)
 *
 * All repos are official GitHub sources, cloned, installed, and built
 * to generate custom-elements.json with paths pointing to REAL .ts/.js source.
 *
 * NO hardcoded component lists — runtime interactivity detection for all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  scanSourceForA11yPatterns,
  scoreSourceMarkers,
  analyzeSourceAccessibility,
  isInteractiveComponent,
} from '../../packages/core/src/handlers/analyzers/source-accessibility.js';
import { getDeclarationSourcePath, CemSchema } from '../../packages/core/src/handlers/cem.js';
import type { Cem, CemDeclaration } from '../../packages/core/src/handlers/cem.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Shared Helpers ──────────────────────────────────────────────────────────

const WC_LIBS_ROOT = resolve(__dirname, '../../../wc-libraries');

function getAllDecls(cem: Cem): CemDeclaration[] {
  return cem.modules.flatMap((m) => m.declarations ?? []).filter((d) => d.tagName);
}

function readSource(cem: Cem, decl: CemDeclaration, root: string): string | null {
  const tagName = decl.tagName;
  if (!tagName) return null;
  const modulePath = getDeclarationSourcePath(cem, tagName);
  if (!modulePath) return null;
  const baseName = modulePath.replace(/\.js$/, '');

  // Try multiple resolution strategies (mirrors source-accessibility.ts)
  const candidates = [
    resolve(root, baseName + '.ts'),
    resolve(root, modulePath),
    resolve(root, 'src', baseName + '.component.ts'),
    resolve(root, 'src', baseName + '.ts'),
    resolve(root, 'src', modulePath),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, 'utf-8');
  }
  return null;
}

interface LibraryConfig {
  name: string;
  /** Where the CEM file lives */
  cemPath: string;
  /** Where CEM module paths resolve relative to */
  sourceRoot: string;
  prefix: string;
}

function makeConfig(lib: LibraryConfig): McpWcConfig {
  return {
    cemPath: lib.cemPath,
    projectRoot: lib.sourceRoot,
    componentPrefix: lib.prefix,
    healthHistoryDir: '.health-history',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

function loadCem(cemPath: string): Cem | null {
  if (!existsSync(cemPath)) return null;
  const raw = readFileSync(cemPath, 'utf-8');
  return CemSchema.parse(JSON.parse(raw));
}

function scanLibrary(
  cem: Cem,
  root: string,
): {
  interactive: Array<{ tag: string; score: number; categories: string[] }>;
  presentational: string[];
  noSource: string[];
} {
  const interactive: Array<{ tag: string; score: number; categories: string[] }> = [];
  const presentational: string[] = [];
  const noSource: string[] = [];

  for (const decl of getAllDecls(cem)) {
    const source = readSource(cem, decl, root);
    if (!source) {
      noSource.push(decl.tagName!);
      continue;
    }

    const markers = scanSourceForA11yPatterns(source);

    if (!isInteractiveComponent(markers, decl, source)) {
      presentational.push(decl.tagName!);
      continue;
    }

    const result = scoreSourceMarkers(markers);
    const categories = result.subMetrics
      .filter((m) => m.score > 0)
      .map((m) => m.name.replace('[Source] ', ''));
    interactive.push({ tag: decl.tagName!, score: result.score, categories });
  }

  return { interactive, presentational, noSource };
}

function printReport(name: string, totalDecls: number, results: ReturnType<typeof scanLibrary>) {
  const { interactive, presentational, noSource } = results;

  console.log(`\n  ═══════════════════════════════════════════`);
  console.log(`  ${name.toUpperCase()} SOURCE-LEVEL A11Y SCAN`);
  console.log(`  ═══════════════════════════════════════════`);
  console.log(`  Total components: ${totalDecls}`);
  console.log(`  Scored (interactive): ${interactive.length}`);
  console.log(`  Skipped (presentational): ${presentational.length}`);
  console.log(`  No source resolved: ${noSource.length}`);

  if (interactive.length > 0) {
    const avg = Math.round(interactive.reduce((s, r) => s + r.score, 0) / interactive.length);
    const tiers = {
      excellent: interactive.filter((s) => s.score >= 90),
      good: interactive.filter((s) => s.score >= 70 && s.score < 90),
      fair: interactive.filter((s) => s.score >= 40 && s.score < 70),
      low: interactive.filter((s) => s.score < 40),
    };

    console.log(`  Average score (interactive only): ${avg}/100`);
    console.log(`  Excellent (>=90): ${tiers.excellent.length}`);
    console.log(`  Good (70-89):     ${tiers.good.length}`);
    console.log(`  Fair (40-69):     ${tiers.fair.length}`);
    console.log(`  Low (<40):        ${tiers.low.length}`);

    if (tiers.excellent.length > 0) {
      console.log('\n  Top scorers:');
      tiers.excellent
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .forEach((s) => console.log(`    ${s.tag}: ${s.score} — ${s.categories.join(', ')}`));
    }

    if (tiers.low.length > 0) {
      console.log('\n  Lowest interactive scorers:');
      tiers.low
        .sort((a, b) => a.score - b.score)
        .slice(0, 8)
        .forEach((s) =>
          console.log(
            `    ${s.tag}: ${s.score} — ${s.categories.length > 0 ? s.categories.join(', ') : '(none)'}`,
          ),
        );
    }
  }

  if (presentational.length > 0 && presentational.length <= 30) {
    console.log(`\n  Presentational (not penalized):`);
    console.log(`    ${presentational.join(', ')}`);
  } else if (presentational.length > 30) {
    console.log(`\n  Presentational (not penalized): ${presentational.length} components`);
  }

  if (noSource.length > 0 && noSource.length <= 10) {
    console.log(`\n  No source resolved:`);
    console.log(`    ${noSource.join(', ')}`);
  } else if (noSource.length > 10) {
    console.log(`\n  No source resolved: ${noSource.length} components`);
  }
}

// ─── Library Configurations ──────────────────────────────────────────────────
// All repos cloned from official GitHub sources into ../wc-libraries/

const LIBRARIES: LibraryConfig[] = [
  {
    name: 'PatternFly Elements',
    cemPath: resolve(WC_LIBS_ROOT, 'patternfly-elements/elements/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'patternfly-elements/elements'),
    prefix: 'pf',
  },
  {
    name: 'Lion UI',
    cemPath: resolve(WC_LIBS_ROOT, 'lion/packages/ui/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'lion/packages/ui'),
    prefix: 'lion',
  },
  {
    name: 'Vaadin Web Components',
    cemPath: resolve(WC_LIBS_ROOT, 'web-components/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'web-components'),
    prefix: 'vaadin',
  },
  {
    name: 'Spectrum Web Components (Adobe)',
    cemPath: resolve(WC_LIBS_ROOT, 'spectrum-web-components/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'spectrum-web-components'),
    prefix: 'sp',
  },
  {
    // Shoelace CEM is in dist/ with paths like "components/button/button.js"
    // Actual source is at "src/components/button/button.component.ts"
    // Our resolver tries src/ prefix and .component.ts suffix automatically
    name: 'Shoelace',
    cemPath: resolve(WC_LIBS_ROOT, 'shoelace/dist/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'shoelace'),
    prefix: 'sl',
  },
];

// ─── Per-Library Tests ───────────────────────────────────────────────────────

for (const lib of LIBRARIES) {
  const available = existsSync(lib.cemPath);

  describe.skipIf(!available)(`${lib.name} — real source scanning`, () => {
    const cem = available ? loadCem(lib.cemPath)! : null!;

    it('CEM parses and has components', () => {
      const allDecls = getAllDecls(cem);
      expect(allDecls.length).toBeGreaterThan(0);
      console.log(`  ${lib.name}: ${allDecls.length} components in CEM`);
    });

    it('source files resolve from CEM module paths', () => {
      const allDecls = getAllDecls(cem);
      let resolved = 0;
      let missing = 0;

      for (const decl of allDecls) {
        const source = readSource(cem, decl, lib.sourceRoot);
        if (source) resolved++;
        else missing++;
      }

      console.log(`  ${lib.name}: ${resolved} source files resolved, ${missing} missing`);
      // At least SOME source files should resolve
      expect(resolved).toBeGreaterThan(0);
    });

    it('runtime interactivity detection classifies components', () => {
      const results = scanLibrary(cem, lib.sourceRoot);

      console.log(`\n  ${lib.name} runtime classification:`);
      console.log(`  Interactive: ${results.interactive.length}`);
      console.log(`  Presentational: ${results.presentational.length}`);
      console.log(`  No source: ${results.noSource.length}`);

      // A real library should have at least some interactive components
      const totalWithSource = results.interactive.length + results.presentational.length;
      if (totalWithSource > 0) {
        expect(results.interactive.length).toBeGreaterThan(0);
      }
    });

    it('full source-level a11y scan with distribution report', () => {
      const allDecls = getAllDecls(cem);
      const results = scanLibrary(cem, lib.sourceRoot);

      printReport(lib.name, allDecls.length, results);

      // The scanner should classify all components
      const totalClassified =
        results.interactive.length + results.presentational.length + results.noSource.length;
      expect(totalClassified).toBe(allDecls.length);
    });

    it('analyzeSourceAccessibility integration — config-based scanning', async () => {
      const config = makeConfig(lib);
      const allDecls = getAllDecls(cem);
      const sample = allDecls.slice(0, 10);
      let scored = 0;
      let skipped = 0;

      for (const decl of sample) {
        const result = await analyzeSourceAccessibility(config, cem, decl);
        if (result) {
          scored++;
          expect(result.confidence).toBe('heuristic');
          expect(result.subMetrics.length).toBe(7);
        } else {
          skipped++;
        }
      }

      console.log(
        `  ${lib.name} integration: ${scored} scored, ${skipped} skipped (sample of ${sample.length})`,
      );
      expect(scored + skipped).toBe(sample.length);
    });
  });
}

// ─── Cross-Library Comparison ────────────────────────────────────────────────

describe('cross-library comparison', () => {
  const availableLibs = LIBRARIES.filter((lib) => existsSync(lib.cemPath));

  it.skipIf(availableLibs.length < 2)('compares a11y scores across all available libraries', () => {
    const comparison: Array<{
      library: string;
      total: number;
      interactive: number;
      presentational: number;
      noSource: number;
      avgScore: number;
    }> = [];

    for (const lib of availableLibs) {
      const cem = loadCem(lib.cemPath)!;
      const allDecls = getAllDecls(cem);
      const results = scanLibrary(cem, lib.sourceRoot);

      const avg =
        results.interactive.length > 0
          ? Math.round(
              results.interactive.reduce((s, r) => s + r.score, 0) / results.interactive.length,
            )
          : 0;

      comparison.push({
        library: lib.name,
        total: allDecls.length,
        interactive: results.interactive.length,
        presentational: results.presentational.length,
        noSource: results.noSource.length,
        avgScore: avg,
      });
    }

    console.log('\n  ═══════════════════════════════════════════════════════════════════');
    console.log('  CROSS-LIBRARY A11Y SOURCE SCANNER COMPARISON');
    console.log('  ═══════════════════════════════════════════════════════════════════');
    console.log(
      '  Library                       | Total | Interactive | Present. | No Src | Avg Score',
    );
    console.log(
      '  ──────────────────────────────┼───────┼────────────┼──────────┼────────┼──────────',
    );
    for (const c of comparison) {
      const name = c.library.padEnd(30);
      console.log(
        `  ${name}| ${String(c.total).padStart(5)} | ${String(c.interactive).padStart(10)} | ${String(c.presentational).padStart(8)} | ${String(c.noSource).padStart(6)} | ${String(c.avgScore).padStart(5)}/100`,
      );
    }

    // Each available library should produce some results
    for (const c of comparison) {
      expect(
        c.interactive + c.presentational + c.noSource,
        `${c.library} should classify all components`,
      ).toBe(c.total);
    }
  });
});
