/**
 * Helix Deep-Dive Report — generates component-by-component breakdown,
 * compares against Material Web and Carbon as gold standards, and produces
 * an actionable issue list for the helix team.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  scoreAllComponentsMultiDimensional,
  type MultiDimensionalHealth,
} from '../../packages/core/src/handlers/health.js';
import { loadAllLibraries, type LoadedLibrary } from './library-loader.js';
import { generateScorecard, type LibraryScorecard } from './scorecard-generator.js';
import {
  generateHelixDeepDive,
  extractCemSourceFidelityFindings,
  compareAgainstGoldStandards,
  type HelixDeepDive,
} from './helix-issue-extractor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, '../__fixtures__/benchmark-results');

// ─── Shared State ───────────────────────────────────────────────────────────

let helixResults: MultiDimensionalHealth[] = [];
let helixScorecard: LibraryScorecard;
let materialScorecard: LibraryScorecard | undefined;
let carbonScorecard: LibraryScorecard | undefined;
let deepDive: HelixDeepDive;

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const { loaded } = loadAllLibraries();

  // Score helix, material, and carbon
  const librariesToScore = ['helix', 'material', 'carbon'] as const;
  const scorecards = new Map<string, LibraryScorecard>();

  for (const libName of librariesToScore) {
    const lib = loaded.find((l) => l.name === libName);
    if (!lib) {
      console.warn(`${libName} library not found, skipping`);
      continue;
    }

    const results = await scoreAllComponentsMultiDimensional(
      lib.config,
      lib.declarations ?? [],
      lib.cem,
      lib.name,
    );

    const scorecard = generateScorecard(lib.name, results);
    scorecards.set(libName, scorecard);

    if (libName === 'helix') {
      helixResults = results;
      helixScorecard = scorecard;
    }
  }

  materialScorecard = scorecards.get('material');
  carbonScorecard = scorecards.get('carbon');

  // Generate deep dive
  deepDive = generateHelixDeepDive(
    helixResults,
    helixScorecard,
    materialScorecard,
    carbonScorecard,
  );

  // Write helix report as structured JSON
  try {
    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(resolve(RESULTS_DIR, 'helix-report.json'), JSON.stringify(deepDive, null, 2));
  } catch {
    // Non-fatal
  }
}, 60_000);

// ─── Helix Scoring Tests ───────────────────────────────────────────────────

describe('Helix Component Scoring', () => {
  it('scores all hx-library components successfully', () => {
    expect(helixResults.length).toBeGreaterThan(0);
    for (const r of helixResults) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it('generates component-by-component breakdown', () => {
    expect(deepDive.componentBreakdown.length).toBe(helixResults.length);
    for (const comp of deepDive.componentBreakdown) {
      expect(comp.tagName).toBeTruthy();
      expect(comp.score).toBeGreaterThanOrEqual(0);
      expect(comp.score).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(comp.grade);
    }
  });

  it('all helix components have valid tag names', () => {
    for (const r of helixResults) {
      expect(r.tagName).toBeTruthy();
    }
  });
});

// ─── CEM-Source Fidelity Tests ──────────────────────────────────────────────

describe('CEM-Source Fidelity', () => {
  it('CEM-Source Fidelity dimension is scored for helix', () => {
    for (const r of helixResults) {
      const fidelity = r.dimensions.find((d) => d.name === 'CEM-Source Fidelity');
      expect(fidelity, `${r.tagName} should have CEM-Source Fidelity dimension`).toBeDefined();
    }
  });

  it('CEM-Source Fidelity catches at least one discrepancy in helix', () => {
    const findings = extractCemSourceFidelityFindings(helixResults);
    // The carousel bug and other known discrepancies should produce findings
    console.log(`CEM-Source Fidelity findings: ${findings.length}`);
    for (const f of findings.slice(0, 5)) {
      console.log(`  ${f.tagName}: score=${f.score}, ${f.description}`);
    }
    expect(
      findings.length,
      'CEM-Source Fidelity should catch at least 1 real discrepancy in helix',
    ).toBeGreaterThanOrEqual(1);
  });

  it('reports CEM-Source Fidelity findings in deep dive', () => {
    expect(deepDive.cemSourceFidelityFindings.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Gold Standard Comparison ───────────────────────────────────────────────

describe('Gold Standard Comparison (Material Web & Carbon)', () => {
  it('compares helix against Material Web and Carbon', () => {
    expect(deepDive.goldStandardComparison.length).toBeGreaterThan(0);
  });

  it('helix is competitive with Material Web on CEM-native dimensions', () => {
    const cemNativeDimensions = [
      'CEM Completeness',
      'Accessibility',
      'Type Coverage',
      'API Surface Quality',
      'CSS Architecture',
      'Event Architecture',
    ];

    const cemNativeComparisons = deepDive.goldStandardComparison.filter((c) =>
      cemNativeDimensions.includes(c.dimension),
    );

    console.log('\nHelix vs Gold Standards (CEM-native dimensions):');
    for (const c of cemNativeComparisons) {
      console.log(
        `  ${c.dimension}: helix=${c.helixAverage}, material=${c.materialAverage}, carbon=${c.carbonAverage} → ${c.status}`,
      );
    }

    // At least some CEM-native dimensions should be competitive or better
    const competitiveOrBetter = cemNativeComparisons.filter(
      (c) => c.status === 'competitive' || c.status === 'ahead',
    );
    expect(
      competitiveOrBetter.length,
      'Helix should be competitive on at least 1 CEM-native dimension vs gold standards',
    ).toBeGreaterThanOrEqual(1);
  });

  it('comparison includes all scored dimensions', () => {
    for (const comp of deepDive.goldStandardComparison) {
      expect(comp.dimension).toBeTruthy();
      expect(comp.helixAverage).toBeGreaterThanOrEqual(0);
      expect(['ahead', 'competitive', 'behind', 'far-behind']).toContain(comp.status);
    }
  });
});

// ─── Actionable Issues ──────────────────────────────────────────────────────

describe('Actionable Issue List', () => {
  it('extracts actionable issues from helix scoring', () => {
    console.log(`\nTotal actionable issues: ${deepDive.actionableIssues.length}`);
    const critical = deepDive.actionableIssues.filter((i) => i.severity === 'critical');
    const warnings = deepDive.actionableIssues.filter((i) => i.severity === 'warning');
    console.log(`  Critical: ${critical.length}`);
    console.log(`  Warning: ${warnings.length}`);

    // Log top 10 critical issues
    for (const issue of critical.slice(0, 10)) {
      console.log(`  [${issue.severity}] ${issue.tagName} - ${issue.description}`);
    }
  });

  it('issues are sorted by severity', () => {
    const issues = deepDive.actionableIssues;
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    for (let i = 1; i < issues.length; i++) {
      expect(severityOrder[issues[i].severity]).toBeGreaterThanOrEqual(
        severityOrder[issues[i - 1].severity],
      );
    }
  });
});

// ─── Report Output ──────────────────────────────────────────────────────────

describe('Helix Report Output', () => {
  it('prints helix report summary to stdout', () => {
    console.log('\n=== Helix Deep-Dive Report ===');
    console.log(`Total components: ${deepDive.totalComponents}`);
    console.log(`Average score: ${deepDive.averageScore}`);
    console.log(`Actionable issues: ${deepDive.actionableIssues.length}`);
    console.log(`CEM-Source Fidelity findings: ${deepDive.cemSourceFidelityFindings.length}`);

    console.log('\nBottom 5 components:');
    for (const comp of deepDive.componentBreakdown.slice(0, 5)) {
      console.log(`  ${comp.tagName}: score=${comp.score}, grade=${comp.grade}`);
    }

    console.log('\nTop 5 components:');
    for (const comp of deepDive.componentBreakdown.slice(-5).reverse()) {
      console.log(`  ${comp.tagName}: score=${comp.score}, grade=${comp.grade}`);
    }
  });
});
