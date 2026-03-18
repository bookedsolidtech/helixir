/**
 * Cross-Library Benchmark Suite — validates the multi-dimensional web component
 * scorer against 11 real libraries (material, spectrum, vaadin, fluentui, carbon,
 * ui5, calcite, porsche, ionic, wired, elix) plus helix.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  scoreAllComponentsMultiDimensional,
  type MultiDimensionalHealth,
} from '../../packages/core/src/handlers/health.js';
import { DIMENSION_REGISTRY } from '../../packages/core/src/handlers/dimensions.js';
import { loadAllLibraries, type LoadedLibrary } from './library-loader.js';
import { generateScorecard, type LibraryScorecard } from './scorecard-generator.js';
import {
  generateComparisonTable,
  formatComparisonTableText,
  type ComparisonTable,
} from './comparison-table-generator.js';
import { PerformanceMonitor } from './performance-monitor.js';

// Libraries require local /Volumes/Development/booked paths — skip in CI when absent
const WC_LIBRARIES_AVAILABLE = existsSync('/Volumes/Development/booked/wc-libraries');
const HELIX_AVAILABLE = existsSync(
  '/Volumes/Development/booked/helix/packages/hx-library/custom-elements.json',
);
const BENCHMARK_AVAILABLE = WC_LIBRARIES_AVAILABLE && HELIX_AVAILABLE;

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, '../__fixtures__/benchmark-results');

// ─── Shared State ───────────────────────────────────────────────────────────

const libraryResults = new Map<string, MultiDimensionalHealth[]>();
const scorecards = new Map<string, LibraryScorecard>();
let comparisonTable: ComparisonTable;
let loadedLibraries: LoadedLibrary[] = [];
let failedLibraries: Array<{ name: string; error: string }> = [];
const perfMonitor = new PerformanceMonitor();

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  perfMonitor.start();

  // Load all libraries
  perfMonitor.startPhase('load-libraries');
  const { loaded, failed } = loadAllLibraries();
  loadedLibraries = loaded;
  failedLibraries = failed;
  perfMonitor.endPhase('load-libraries');

  // Log skipped libraries per deviation rules
  if (failed.length > 0) {
    console.warn(
      `Skipped ${failed.length} libraries: ${failed.map((f) => `${f.name} (${f.error})`).join(', ')}`,
    );
  }

  // Score all components for each library
  perfMonitor.startPhase('score-all-libraries');
  for (const lib of loadedLibraries) {
    perfMonitor.startPhase(`score-${lib.name}`);
    const results = await scoreAllComponentsMultiDimensional(
      lib.config,
      lib.declarations ?? [],
      lib.cem,
      lib.name,
    );
    libraryResults.set(lib.name, results);
    perfMonitor.endPhase(`score-${lib.name}`);
  }
  perfMonitor.endPhase('score-all-libraries');

  // Generate scorecards
  perfMonitor.startPhase('generate-scorecards');
  for (const [name, results] of libraryResults) {
    const scorecard = generateScorecard(name as LoadedLibrary['name'], results);
    scorecards.set(name, scorecard);
  }
  perfMonitor.endPhase('generate-scorecards');

  // Generate comparison table
  perfMonitor.startPhase('generate-comparison');
  comparisonTable = generateComparisonTable([...scorecards.values()]);
  perfMonitor.endPhase('generate-comparison');

  // Write results to fixtures for historical comparison
  try {
    mkdirSync(RESULTS_DIR, { recursive: true });
    const output = {
      timestamp: new Date().toISOString(),
      scorecards: Object.fromEntries(scorecards),
      comparisonTable,
      performance: perfMonitor.getResult(),
    };
    writeFileSync(resolve(RESULTS_DIR, 'latest-benchmark.json'), JSON.stringify(output, null, 2));
  } catch {
    // Non-fatal: fixture writing is optional
  }
}, 60_000);

// ─── Library Loading Tests ──────────────────────────────────────────────────

describe('Library Loading', () => {
  it.skipIf(!BENCHMARK_AVAILABLE)('loads all 11 wc-libraries and helix successfully', () => {
    const expectedLibraries = [
      'material',
      'spectrum',
      'vaadin',
      'fluentui',
      'carbon',
      'ui5',
      'calcite',
      'porsche',
      'ionic',
      'wired',
      'elix',
      'helix',
    ];
    const loadedNames = loadedLibraries.map((l) => l.name);
    for (const name of expectedLibraries) {
      expect(loadedNames, `Library "${name}" should be loaded`).toContain(name);
    }
  });

  it.skipIf(!BENCHMARK_AVAILABLE)('parses all CEM files without errors', () => {
    expect(failedLibraries).toHaveLength(0);
  });

  it('finds components in every library', () => {
    for (const lib of loadedLibraries) {
      expect(lib.componentCount, `${lib.name} should have at least 1 component`).toBeGreaterThan(0);
    }
  });
});

// ─── Scoring Tests ──────────────────────────────────────────────────────────

describe('Component Scoring', () => {
  it('scores all components between 0-100', () => {
    for (const [libName, results] of libraryResults) {
      for (const r of results) {
        if (r.score < 0 || r.score > 100) {
          throw new Error(
            `Score out of range: ${r.tagName} in ${libName} scored ${r.score}. ` +
              `Dimensions: ${JSON.stringify(r.dimensions.map((d) => ({ name: d.name, score: d.score })))}`,
          );
        }
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('assigns valid grades (A-F) to all components', () => {
    const validGrades = ['A', 'B', 'C', 'D', 'F'];
    for (const [, results] of libraryResults) {
      for (const r of results) {
        expect(validGrades).toContain(r.grade);
      }
    }
  });

  it('returns correct number of dimensions per component', () => {
    const expectedDimCount = DIMENSION_REGISTRY.length;
    for (const [, results] of libraryResults) {
      for (const r of results) {
        expect(r.dimensions).toHaveLength(expectedDimCount);
      }
    }
  });

  it.skipIf(!BENCHMARK_AVAILABLE)('produces sensible grade distribution across the benchmark', () => {
    // With external dimensions untested, many wc-libraries score all F — expected.
    // Helix (with CEM-native dimensions well covered) should show grade variety,
    // and the overall benchmark should show score variation across libraries.
    const helixCard = scorecards.get('helix');
    expect(helixCard, 'helix scorecard should exist').toBeDefined();
    if (helixCard) {
      const dist = helixCard.gradeDistribution;
      const gradesUsed = Object.values(dist).filter((v) => v > 0).length;
      expect(gradesUsed, 'helix should have at least 2 different grades').toBeGreaterThanOrEqual(2);
    }

    // Verify there's overall variation — not every library has the same avg score
    const averages = [...scorecards.values()].map((s) => s.averageScore);
    const min = Math.min(...averages);
    const max = Math.max(...averages);
    expect(max - min, 'Libraries should show score variation').toBeGreaterThan(10);
  });
});

// ─── Scorecard Tests ────────────────────────────────────────────────────────

describe('Scorecard Generation', () => {
  it('generates scorecards for all loaded libraries', () => {
    for (const lib of loadedLibraries) {
      expect(scorecards.has(lib.name), `Scorecard for ${lib.name}`).toBe(true);
    }
  });

  it('scorecards contain dimension averages', () => {
    for (const [, scorecard] of scorecards) {
      expect(Object.keys(scorecard.dimensionAverages).length).toBeGreaterThan(0);
    }
  });

  it('scorecards contain confidence breakdown', () => {
    for (const [, scorecard] of scorecards) {
      const { verified, heuristic, untested } = scorecard.confidenceBreakdown;
      expect(verified + heuristic + untested).toBeGreaterThan(0);
    }
  });

  it('scorecards contain top 5 and bottom 5', () => {
    for (const [, scorecard] of scorecards) {
      if (scorecard.componentCount >= 5) {
        expect(scorecard.top5).toHaveLength(5);
        expect(scorecard.bottom5).toHaveLength(5);
      }
    }
  });

  it('scorecards contain dimension insights', () => {
    for (const [, scorecard] of scorecards) {
      expect(scorecard.dimensionInsights.length).toBeGreaterThan(0);
    }
  });
});

// ─── Comparison Table Tests ─────────────────────────────────────────────────

describe('Cross-Library Comparison', () => {
  it('comparison table ranks all loaded libraries by average score', () => {
    expect(comparisonTable.overallRankings).toHaveLength(loadedLibraries.length);
    // Verify sorted descending
    for (let i = 1; i < comparisonTable.overallRankings.length; i++) {
      expect(comparisonTable.overallRankings[i].averageScore).toBeLessThanOrEqual(
        comparisonTable.overallRankings[i - 1].averageScore,
      );
    }
  });

  it.skipIf(!BENCHMARK_AVAILABLE)('comparison table has per-dimension rankings', () => {
    expect(comparisonTable.perDimensionRankings.length).toBeGreaterThan(0);
    for (const dimRanking of comparisonTable.perDimensionRankings) {
      expect(dimRanking.rankings.length).toBeGreaterThan(0);
    }
  });

  it.skipIf(!BENCHMARK_AVAILABLE)('identifies differentiating dimensions', () => {
    expect(comparisonTable.differentiatingDimensions.length).toBeGreaterThan(0);
  });

  it('produces formatted comparison table text', () => {
    const text = formatComparisonTableText(comparisonTable);
    expect(text).toContain('Cross-Library Comparison Table');
    expect(text).toContain('Rank');
    expect(text).toContain('Library');
  });
});

// ─── Performance Gate ───────────────────────────────────────────────────────

describe('Performance Gate', () => {
  it('benchmark completes in under 60 seconds', () => {
    const result = perfMonitor.getResult();
    console.log(`Total benchmark time: ${result.totalMs}ms`);
    for (const phase of result.phases) {
      console.log(`  ${phase.name}: ${phase.durationMs}ms`);
    }
    expect(result.withinGate, `Benchmark took ${result.totalMs}ms (limit: 60000ms)`).toBe(true);
  });
});

// ─── Summary Output ─────────────────────────────────────────────────────────

describe('Benchmark Summary', () => {
  it('prints summary to stdout', () => {
    console.log('\n=== Benchmark Summary ===');
    console.log(`Libraries loaded: ${loadedLibraries.length}`);
    console.log(`Libraries failed: ${failedLibraries.length}`);
    console.log('');

    for (const [name, scorecard] of scorecards) {
      console.log(
        `${name}: avg=${scorecard.averageScore}, components=${scorecard.componentCount}, ` +
          `grades=${JSON.stringify(scorecard.gradeDistribution)}`,
      );
    }

    console.log('');
    console.log(formatComparisonTableText(comparisonTable));
  });
});
