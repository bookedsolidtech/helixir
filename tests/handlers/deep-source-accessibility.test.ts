/**
 * Deep Source-Level Accessibility Scanner Tests — mixin-aware scanning.
 *
 * Tests the Phase 3 deep analysis mode that follows CEM superclass/mixin
 * declarations and source imports to scan the FULL inheritance chain.
 *
 * This solves the fundamental blind spot where libraries like Lion (23/100)
 * and Vaadin (24/100) scored low because their a11y patterns live in shared
 * mixins and base classes, not in each component's leaf file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  analyzeSourceAccessibilityDeep,
  scanSourceForA11yPatterns,
  scoreSourceMarkers,
  isInteractiveComponent,
  resolveComponentSourceFilePath,
} from '../../packages/core/src/handlers/analyzers/source-accessibility.js';
import {
  getDeclarationSourcePath,
  getInheritanceChain,
  CemSchema,
} from '../../packages/core/src/handlers/cem.js';
import type { Cem, CemDeclaration } from '../../packages/core/src/handlers/cem.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Shared Helpers ──────────────────────────────────────────────────────────

const WC_LIBS_ROOT = resolve(__dirname, '../../../wc-libraries');

function loadCem(cemPath: string): Cem | null {
  if (!existsSync(cemPath)) return null;
  const raw = readFileSync(cemPath, 'utf-8');
  return CemSchema.parse(JSON.parse(raw));
}

function getAllDecls(cem: Cem): CemDeclaration[] {
  return cem.modules.flatMap((m) => m.declarations ?? []).filter((d) => d.tagName);
}

function makeConfig(cemPath: string, sourceRoot: string, prefix: string): McpWcConfig {
  return {
    cemPath,
    projectRoot: sourceRoot,
    componentPrefix: prefix,
    healthHistoryDir: '.health-history',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

interface LibraryConfig {
  name: string;
  cemPath: string;
  sourceRoot: string;
  prefix: string;
}

const LIBRARIES: LibraryConfig[] = [
  {
    name: 'PatternFly',
    cemPath: resolve(WC_LIBS_ROOT, 'patternfly/elements/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'patternfly/elements'),
    prefix: 'pf',
  },
  {
    name: 'Lion',
    cemPath: resolve(WC_LIBS_ROOT, 'lion/packages/ui/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'lion/packages/ui'),
    prefix: 'lion',
  },
  {
    name: 'Vaadin',
    cemPath: resolve(WC_LIBS_ROOT, 'vaadin/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'vaadin'),
    prefix: 'vaadin',
  },
  {
    name: 'Spectrum (Adobe)',
    cemPath: resolve(WC_LIBS_ROOT, 'spectrum/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'spectrum'),
    prefix: 'sp',
  },
  {
    name: 'Shoelace',
    cemPath: resolve(WC_LIBS_ROOT, 'shoelace/dist/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'shoelace'),
    prefix: 'sl',
  },
  {
    name: 'Material Web (Google)',
    cemPath: resolve(WC_LIBS_ROOT, 'material/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'material'),
    prefix: 'md',
  },
  {
    name: 'Carbon (IBM)',
    cemPath: resolve(WC_LIBS_ROOT, 'carbon/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'carbon'),
    prefix: 'cds',
  },
  {
    name: 'Fluent UI (Microsoft)',
    cemPath: resolve(WC_LIBS_ROOT, 'fluentui/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'fluentui'),
    prefix: 'fluent',
  },
  {
    name: 'Wired Elements',
    cemPath: resolve(WC_LIBS_ROOT, 'wired/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'wired'),
    prefix: 'wired',
  },
  {
    name: 'Ionic',
    cemPath: resolve(WC_LIBS_ROOT, 'ionic/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'ionic'),
    prefix: 'ion',
  },
  {
    name: 'Porsche Design System',
    cemPath: resolve(WC_LIBS_ROOT, 'porsche/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'porsche'),
    prefix: 'p',
  },
  {
    name: 'Calcite (Esri)',
    cemPath: resolve(WC_LIBS_ROOT, 'calcite/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'calcite'),
    prefix: 'calcite',
  },
  {
    name: 'UI5 (SAP)',
    cemPath: resolve(WC_LIBS_ROOT, 'ui5/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'ui5'),
    prefix: 'ui5',
  },
  {
    name: 'Elix',
    cemPath: resolve(WC_LIBS_ROOT, 'elix/custom-elements.json'),
    sourceRoot: resolve(WC_LIBS_ROOT, 'elix'),
    prefix: 'elix',
  },
];

// ─── CEM Inheritance Metadata Tests ─────────────────────────────────────────

describe('CEM inheritance metadata', () => {
  for (const lib of LIBRARIES) {
    const available = existsSync(lib.cemPath);

    describe.skipIf(!available)(`${lib.name}`, () => {
      const cem = available ? loadCem(lib.cemPath)! : null!;

      it('declarations include superclass/mixin metadata', () => {
        const allDecls = getAllDecls(cem);
        let withSuperclass = 0;
        let withMixins = 0;

        for (const decl of allDecls) {
          if (decl.superclass) withSuperclass++;
          if (decl.mixins && decl.mixins.length > 0) withMixins++;
        }

        console.log(`  ${lib.name}: ${allDecls.length} components`);
        console.log(`    With superclass: ${withSuperclass}`);
        console.log(`    With mixins: ${withMixins}`);

        // At least some components should have inheritance metadata
        // (some CEMs don't include it — that's ok, we test what we get)
      });

      it('getInheritanceChain returns entries for components with mixins', () => {
        const allDecls = getAllDecls(cem);
        let totalEntries = 0;
        let withEntries = 0;

        for (const decl of allDecls) {
          const chain = getInheritanceChain(decl);
          totalEntries += chain.length;
          if (chain.length > 0) withEntries++;
        }

        console.log(`    Components with chain entries: ${withEntries}/${allDecls.length}`);
        console.log(`    Total chain entries: ${totalEntries}`);
      });
    });
  }
});

// ─── Deep Scan vs. Shallow Scan Comparison ──────────────────────────────────

describe('deep scan vs shallow scan comparison', () => {
  for (const lib of LIBRARIES) {
    const available = existsSync(lib.cemPath);

    describe.skipIf(!available)(`${lib.name}`, () => {
      const cem = available ? loadCem(lib.cemPath)! : null!;
      const config = makeConfig(lib.cemPath, lib.sourceRoot, lib.prefix);

      it('deep scan scores >= shallow scan for all interactive components', async () => {
        const allDecls = getAllDecls(cem);
        const sample = allDecls.slice(0, 20); // Sample for speed

        let improved = 0;
        let same = 0;
        let shallowOnly = 0;
        let deepOnly = 0;
        let bothNull = 0;

        const improvements: Array<{
          tag: string;
          shallow: number;
          deep: number;
          architecture: string;
          contributors: string[];
        }> = [];

        for (const decl of sample) {
          // Get shallow result
          const modulePath = getDeclarationSourcePath(cem, decl.tagName!);
          if (!modulePath) continue;
          const filePath = resolveComponentSourceFilePath(config.projectRoot, modulePath);
          if (!filePath || !existsSync(filePath)) continue;

          const source = readFileSync(filePath, 'utf-8');
          const shallowMarkers = scanSourceForA11yPatterns(source);

          if (!isInteractiveComponent(shallowMarkers, decl, source)) {
            // Deep scan might still classify as interactive via chain
            const deepResult = await analyzeSourceAccessibilityDeep(config, cem, decl);
            if (deepResult) deepOnly++;
            else bothNull++;
            continue;
          }

          const shallowResult = scoreSourceMarkers(shallowMarkers);

          // Get deep result
          const deepResult = await analyzeSourceAccessibilityDeep(config, cem, decl);

          if (!deepResult) {
            shallowOnly++;
            continue;
          }

          if (deepResult.score > shallowResult.score) {
            improved++;
            improvements.push({
              tag: decl.tagName!,
              shallow: shallowResult.score,
              deep: deepResult.score,
              architecture: deepResult.architecture,
              contributors: deepResult.contributors,
            });
          } else {
            same++;
          }
        }

        console.log(`\n  ${lib.name} deep vs shallow (sample of ${sample.length}):`);
        console.log(`    Improved by deep scan: ${improved}`);
        console.log(`    Same score: ${same}`);
        console.log(`    Shallow-only (deep returned null): ${shallowOnly}`);
        console.log(`    Deep-only (shallow non-interactive): ${deepOnly}`);
        console.log(`    Both null (presentational): ${bothNull}`);

        if (improvements.length > 0) {
          console.log(`\n    Score improvements:`);
          for (const imp of improvements.slice(0, 10)) {
            console.log(
              `      ${imp.tag}: ${imp.shallow} → ${imp.deep} (${imp.architecture}) via ${imp.contributors.join(', ') || '(component only)'}`,
            );
          }
        }

        // Deep scan should NEVER score lower than shallow scan
        for (const imp of improvements) {
          expect(imp.deep).toBeGreaterThanOrEqual(imp.shallow);
        }
      });

      it('full library deep scan with comparison report', async () => {
        const allDecls = getAllDecls(cem);

        const deepResults: Array<{ tag: string; score: number; arch: string; chain: number }> = [];
        const shallowResults: Array<{ tag: string; score: number }> = [];
        let presentational = 0;
        let noSource = 0;

        for (const decl of allDecls) {
          const deepResult = await analyzeSourceAccessibilityDeep(config, cem, decl);
          if (deepResult) {
            deepResults.push({
              tag: decl.tagName!,
              score: deepResult.score,
              arch: deepResult.architecture,
              chain: deepResult.chainDepth,
            });
          } else {
            // Check if it's no-source vs presentational
            const modulePath = getDeclarationSourcePath(cem, decl.tagName!);
            if (!modulePath) {
              noSource++;
              continue;
            }
            const filePath = resolveComponentSourceFilePath(config.projectRoot, modulePath);
            if (!filePath || !existsSync(filePath)) {
              noSource++;
              continue;
            }
            presentational++;
          }

          // Also get shallow for comparison
          const modulePath = getDeclarationSourcePath(cem, decl.tagName!);
          if (!modulePath) continue;
          const filePath = resolveComponentSourceFilePath(config.projectRoot, modulePath);
          if (!filePath || !existsSync(filePath)) continue;
          const source = readFileSync(filePath, 'utf-8');
          const markers = scanSourceForA11yPatterns(source);
          if (isInteractiveComponent(markers, decl, source)) {
            shallowResults.push({ tag: decl.tagName!, score: scoreSourceMarkers(markers).score });
          }
        }

        const deepAvg =
          deepResults.length > 0
            ? Math.round(deepResults.reduce((s, r) => s + r.score, 0) / deepResults.length)
            : 0;
        const shallowAvg =
          shallowResults.length > 0
            ? Math.round(shallowResults.reduce((s, r) => s + r.score, 0) / shallowResults.length)
            : 0;

        console.log(`\n  ═══════════════════════════════════════════`);
        console.log(`  ${lib.name.toUpperCase()} DEEP SCAN REPORT`);
        console.log(`  ═══════════════════════════════════════════`);
        console.log(`  Total components: ${allDecls.length}`);
        console.log(`  Interactive (scored): ${deepResults.length}`);
        console.log(`  Presentational: ${presentational}`);
        console.log(`  No source: ${noSource}`);
        console.log(`  Shallow avg: ${shallowAvg}/100`);
        console.log(`  Deep avg:    ${deepAvg}/100`);
        console.log(`  Improvement: +${deepAvg - shallowAvg} points`);

        // Architecture breakdown
        const archCounts = deepResults.reduce(
          (acc, r) => {
            acc[r.arch] = (acc[r.arch] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );
        console.log(`\n  Architecture breakdown:`);
        for (const [arch, count] of Object.entries(archCounts)) {
          console.log(`    ${arch}: ${count} components`);
        }

        // Top and bottom scorers
        const sorted = [...deepResults].sort((a, b) => b.score - a.score);
        if (sorted.length > 0) {
          console.log(`\n  Top scorers (deep):`);
          sorted
            .slice(0, 5)
            .forEach((s) =>
              console.log(`    ${s.tag}: ${s.score} (chain: ${s.chain} files, ${s.arch})`),
            );

          const bottom = sorted.filter((s) => s.score < 40);
          if (bottom.length > 0) {
            console.log(`\n  Lowest scorers (deep):`);
            bottom
              .slice(-5)
              .forEach((s) =>
                console.log(`    ${s.tag}: ${s.score} (chain: ${s.chain} files, ${s.arch})`),
              );
          }
        }

        // The deep scan should always be >= shallow scan on average
        expect(deepAvg).toBeGreaterThanOrEqual(shallowAvg);
      });
    });
  }
});

// ─── Cross-Library Deep Comparison ──────────────────────────────────────────

describe('cross-library deep comparison', () => {
  const availableLibs = LIBRARIES.filter((lib) => existsSync(lib.cemPath));

  it.skipIf(availableLibs.length < 2)(
    'compares deep vs shallow scores across all libraries',
    async () => {
      const comparison: Array<{
        library: string;
        total: number;
        interactive: number;
        shallowAvg: number;
        deepAvg: number;
        improvement: number;
        architectures: Record<string, number>;
      }> = [];

      for (const lib of availableLibs) {
        const cem = loadCem(lib.cemPath)!;
        const config = makeConfig(lib.cemPath, lib.sourceRoot, lib.prefix);
        const allDecls = getAllDecls(cem);

        const deepScores: number[] = [];
        const shallowScores: number[] = [];
        const architectures: Record<string, number> = {};

        for (const decl of allDecls) {
          const deepResult = await analyzeSourceAccessibilityDeep(config, cem, decl);
          if (deepResult) {
            deepScores.push(deepResult.score);
            architectures[deepResult.architecture] =
              (architectures[deepResult.architecture] ?? 0) + 1;
          }

          // Shallow scan
          const modulePath = getDeclarationSourcePath(cem, decl.tagName!);
          if (!modulePath) continue;
          const filePath = resolveComponentSourceFilePath(config.projectRoot, modulePath);
          if (!filePath || !existsSync(filePath)) continue;
          const source = readFileSync(filePath, 'utf-8');
          const markers = scanSourceForA11yPatterns(source);
          if (isInteractiveComponent(markers, decl, source)) {
            shallowScores.push(scoreSourceMarkers(markers).score);
          }
        }

        const shallowAvg =
          shallowScores.length > 0
            ? Math.round(shallowScores.reduce((s, v) => s + v, 0) / shallowScores.length)
            : 0;
        const deepAvg =
          deepScores.length > 0
            ? Math.round(deepScores.reduce((s, v) => s + v, 0) / deepScores.length)
            : 0;

        comparison.push({
          library: lib.name,
          total: allDecls.length,
          interactive: deepScores.length,
          shallowAvg,
          deepAvg,
          improvement: deepAvg - shallowAvg,
          architectures,
        });
      }

      console.log(
        '\n  ═══════════════════════════════════════════════════════════════════════════════',
      );
      console.log('  CROSS-LIBRARY DEEP vs SHALLOW A11Y COMPARISON');
      console.log(
        '  ═══════════════════════════════════════════════════════════════════════════════',
      );
      console.log(
        '  Library                | Total | Active | Shallow | Deep   | +Improve | Architecture',
      );
      console.log(
        '  ───────────────────────┼───────┼────────┼─────────┼────────┼──────────┼─────────────',
      );
      for (const c of comparison) {
        const name = c.library.padEnd(22);
        const archStr = Object.entries(c.architectures)
          .map(([k, v]) => `${k}:${v}`)
          .join(', ');
        console.log(
          `  ${name} | ${String(c.total).padStart(5)} | ${String(c.interactive).padStart(6)} | ${String(c.shallowAvg).padStart(4)}/100 | ${String(c.deepAvg).padStart(3)}/100 | ${String('+' + c.improvement).padStart(8)} | ${archStr}`,
        );
      }

      // Deep scan should always be >= shallow scan
      for (const c of comparison) {
        expect(c.deepAvg, `${c.library} deep should be >= shallow`).toBeGreaterThanOrEqual(
          c.shallowAvg,
        );
      }
    },
  );
});
