import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { McpWcConfig } from '../../packages/core/src/config.js';
import {
  scoreComponentMultiDimensional,
  scoreAllComponentsMultiDimensional,
  type MultiDimensionalHealth,
} from '../../packages/core/src/handlers/health.js';
import type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';
import { DIMENSION_REGISTRY } from '../../packages/core/src/handlers/dimensions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../__fixtures__');
const NO_HISTORY_DIR = resolve(FIXTURE_DIR, 'health-history-nonexistent');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(healthHistoryDir: string = NO_HISTORY_DIR): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: '/',
    componentPrefix: '',
    healthHistoryDir,
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PERFECT_DECL: CemDeclaration = {
  kind: 'class',
  name: 'PerfectComponent',
  tagName: 'perfect-component',
  description: 'A perfectly documented accessible component with keyboard and ARIA support.',
  members: [
    {
      kind: 'field',
      name: 'value',
      type: { text: 'string' },
      description: 'Current value.',
      attribute: 'value',
      reflects: true,
      default: '""',
    },
    {
      kind: 'field',
      name: 'disabled',
      type: { text: 'boolean' },
      description: 'Disabled state.',
      attribute: 'disabled',
      reflects: true,
      default: 'false',
    },
    {
      kind: 'field',
      name: 'label',
      type: { text: 'string' },
      description: 'Accessible label.',
      attribute: 'label',
      default: '""',
    },
    {
      kind: 'field',
      name: 'aria-label',
      type: { text: 'string' },
      description: 'ARIA label attribute.',
    },
    {
      kind: 'method',
      name: 'focus',
      description: 'Focus the element.',
      return: { type: { text: 'void' } },
    },
  ],
  events: [
    {
      name: 'value-change',
      type: { text: 'CustomEvent<{ value: string }>' },
      description: 'Emitted when value changes.',
    },
    {
      name: 'key-press',
      type: { text: 'CustomEvent<KeyboardEvent>' },
      description: 'Keyboard event.',
    },
  ],
  slots: [
    { name: '', description: 'Default content slot.' },
    { name: 'label', description: 'Label slot.' },
  ],
  cssParts: [{ name: 'base', description: 'Root element.' }],
  cssProperties: [
    { name: '--pc-color', default: 'inherit', description: 'Text color.' },
    { name: '--pc-size', default: '16px', description: 'Font size.' },
  ],
};

const MINIMAL_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MinimalComponent',
  tagName: 'minimal-component',
  // no description, no members, no events, etc.
};

const LOW_TYPE_COVERAGE_DECL: CemDeclaration = {
  kind: 'class',
  name: 'LowType',
  tagName: 'low-type',
  description: 'A component with poor type coverage.',
  members: [
    { kind: 'field', name: 'value' }, // no type
    { kind: 'field', name: 'count' }, // no type
    { kind: 'method', name: 'doStuff' }, // no return type
  ],
  events: [
    { name: 'change' }, // no type, no description
    { name: 'update' }, // no type, no description
  ],
};

const HIGH_CEM_LOW_TYPE_DECL: CemDeclaration = {
  kind: 'class',
  name: 'HighCemLowType',
  tagName: 'high-cem-low-type',
  description: 'Well documented but poorly typed.',
  members: [
    { kind: 'field', name: 'value', description: 'The value.' },
    { kind: 'field', name: 'count', description: 'The count.' },
  ],
  events: [{ name: 'my-change', type: { text: 'CustomEvent' }, description: 'Fires on change.' }],
  slots: [{ name: '', description: 'Default.' }],
  cssParts: [{ name: 'base', description: 'Root.' }],
};

// ─── scoreComponentMultiDimensional ──────────────────────────────────────────

describe('scoreComponentMultiDimensional', () => {
  it('returns all 21 dimensions', async () => {
    // Phase 3 dimensional upgrade: legacy 'Accessibility' split into 8 dims
    // → 14 - 1 + 8 = 21.
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    expect(result.dimensions).toHaveLength(21);
  });

  it('includes tagName in result', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    expect(result.tagName).toBe('perfect-component');
  });

  it('measurable CEM-native dimensions are measured; source-dependent a11y dims are unknown without libraryRoot', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const cemNative = result.dimensions.filter(
      (d) => DIMENSION_REGISTRY.find((r) => r.name === d.name)?.source === 'cem-native',
    );
    // CEM-Source Fidelity stays N/A when no CEM is passed — caller hasn't
    // asked for cross-CEM analysis (preserves existing entry points like
    // generateAuditReport(config, declarations) per round-2 codex review).
    // Strict mode (M2 follow-up work) will surface this as `unknown` for
    // callers that opt in.
    const cemSourceFidelity = cemNative.find((d) => d.name === 'CEM-Source Fidelity');
    expect(cemSourceFidelity).toBeDefined();
    expect(cemSourceFidelity?.measured).toBe(false);
    // Naming Consistency: when no precomputed conventions are passed AND
    // no CEM is available to derive them from, it's `unknown`.
    const namingConsistency = cemNative.find((d) => d.name === 'Naming Consistency');
    expect(namingConsistency).toBeDefined();
    expect(namingConsistency?.measured).toBe(true);
    expect(namingConsistency?.confidence).toBe('unknown');

    // Phase 3 dimensional upgrade: 6 of the 8 new a11y dims depend on
    // helix-AAA source signals (sourceChecks / verdictSnapshot from
    // helix-aaa-evidence) that require `libraryRoot`. Without it, the
    // scorers return `unknown` / `measured: false` by contract — they
    // refuse to gaslight a verified verdict from missing inputs.
    const SOURCE_DEPENDENT_A11Y_DIMS = [
      'APG Keyboard Contract',
      'Focus Indicator',
      'Form Association',
      'Forced Colors Mode',
      'Form Validity Reporting',
      'AAA Audit Self-Certification',
    ];
    for (const name of SOURCE_DEPENDENT_A11Y_DIMS) {
      const dim = cemNative.find((d) => d.name === name);
      expect(dim, `expected '${name}' in CEM-native dims`).toBeDefined();
      // No libraryRoot → no sourceChecks → unknown. Per the codex-fixed
      // contract these stay `measured: true` so they pull the weighted
      // score down at score 0 — surfacing the gap rather than silently
      // dropping out of the denominator (codex push-gate P1, 2026-05-10).
      // The AAA Audit Self-Certification dim is weight-0 informational
      // and returns confidence:'untested' (no helix audit md → N/A), so
      // it's the one exception that legitimately drops as notApplicable.
      if (name === 'AAA Audit Self-Certification') {
        expect(dim?.confidence).toBe('untested');
      } else {
        expect(dim?.confidence).toBe('unknown');
        expect(dim?.score).toBe(0);
        expect(dim?.measured).toBe(true);
      }
    }

    // The remaining CEM-native dims (everything not in the exception sets
    // above) must be `measured: true`. This covers CEM Completeness,
    // Type Coverage, API Surface Quality, CSS/Event/Slot Architecture,
    // plus WCAG Conformance and Accessible Label Pattern (the two new
    // a11y dims that can score from CEM evidence alone).
    const measurableNative = cemNative.filter(
      (d) =>
        d.name !== 'CEM-Source Fidelity' &&
        d.name !== 'Naming Consistency' &&
        !SOURCE_DEPENDENT_A11Y_DIMS.includes(d.name),
    );
    expect(measurableNative.every((d) => d.measured)).toBe(true);
  });

  it('external dimensions are untested when no history', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const external = result.dimensions.filter(
      (d) => DIMENSION_REGISTRY.find((r) => r.name === d.name)?.source === 'external',
    );
    expect(external.every((d) => !d.measured)).toBe(true);
    expect(external.every((d) => d.confidence === 'untested')).toBe(true);
  });

  it('includes confidence summary', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    expect(result.confidenceSummary).toBeDefined();
    expect(result.confidenceSummary.verified).toBeGreaterThan(0);
    // Phase 3 buckets for a bare CEM-only PERFECT_DECL (no libraryRoot,
    // no history):
    //   verified  (3): CEM Completeness, Type Coverage, Slot Architecture
    //   heuristic (5): API Surface Quality, CSS Architecture, Event
    //                   Architecture, WCAG Conformance, Accessible Label
    //                   Pattern
    //   untested  (7): 5 external dims (Test Coverage, Bundle Size,
    //                   Story Coverage, Performance, Drupal Readiness)
    //                   + CEM-Source Fidelity (N/A without CEM)
    //                   + AAA Audit Self-Certification (untested without
    //                   verdict snapshot)
    //   unknown   (6): Naming Consistency (no conventions, no CEM) +
    //                   5 source-dependent a11y dims that require
    //                   libraryRoot (APG Keyboard Contract, Focus
    //                   Indicator, Form Association, Forced Colors Mode,
    //                   Form Validity Reporting)
    expect(result.confidenceSummary.untested).toBe(7);
    expect(result.confidenceSummary.unknown).toBe(6);
    // Spot-check that the four buckets sum to the registry length.
    const total =
      result.confidenceSummary.verified +
      result.confidenceSummary.heuristic +
      result.confidenceSummary.untested +
      result.confidenceSummary.unknown;
    expect(total).toBe(21);
  });

  it('includes a timestamp', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    expect(typeof result.timestamp).toBe('string');
    expect(result.timestamp.length).toBeGreaterThan(0);
  });

  it('includes gradingNotes', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    expect(Array.isArray(result.gradingNotes)).toBe(true);
  });

  it('each dimension has correct weight from registry', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    for (const dim of result.dimensions) {
      const regEntry = DIMENSION_REGISTRY.find((r) => r.name === dim.name);
      expect(regEntry).toBeDefined();
      expect(dim.weight).toBe(regEntry!.weight);
    }
  });

  it('each dimension has correct tier from registry', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    for (const dim of result.dimensions) {
      const regEntry = DIMENSION_REGISTRY.find((r) => r.name === dim.name);
      expect(dim.tier).toBe(regEntry!.tier);
    }
  });

  it('dimension scores are between 0 and 100', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    for (const dim of result.dimensions) {
      if (dim.measured) {
        expect(dim.score).toBeGreaterThanOrEqual(0);
        expect(dim.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('well-documented component gets CEM Completeness close to 100', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const cemDim = result.dimensions.find((d) => d.name === 'CEM Completeness');
    expect(cemDim).toBeDefined();
    expect(cemDim!.score).toBeGreaterThanOrEqual(90);
  });

  it('well-documented component has subMetrics on CEM Completeness', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const cemDim = result.dimensions.find((d) => d.name === 'CEM Completeness');
    expect(cemDim!.subMetrics).toBeDefined();
    expect(cemDim!.subMetrics!.length).toBeGreaterThan(0);
  });

  // Phase 3 dimensional upgrade: the legacy `Accessibility` dim was split
  // into 8 dims. Each test below asserts the dispatcher routes through
  // the corresponding Phase-2 scorer for a CEM-only PERFECT_DECL. The
  // first two dims can score from CEM alone; the rest need libraryRoot
  // source evidence to score and report `unknown` without it.

  it('WCAG Conformance dimension wires through scoreWcagConformance', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const dim = result.dimensions.find((d) => d.name === 'WCAG Conformance');
    expect(dim).toBeDefined();
    // Branch 4 of scoreWcagConformance: CEM has aria-* member ('aria-label')
    // → score 30, heuristic, measured=true.
    expect(dim!.measured).toBe(true);
    expect(dim!.confidence).toBe('heuristic');
    expect(dim!.score).toBe(30);
  });

  it('APG Keyboard Contract dimension wires through scoreApgKeyboard', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const dim = result.dimensions.find((d) => d.name === 'APG Keyboard Contract');
    expect(dim).toBeDefined();
    // No helixMeta.keyboardContract, no @keyboard-contract JSDoc, no CEM
    // event whose name includes keydown/keyup/keypress (PERFECT_DECL's
    // 'key-press' is hyphenated and doesn't substring-match the scorer's
    // CEM-fallback predicate). All branches miss → unknown / score 0 /
    // measured:true (surfaces in weighted score per codex-fix contract).
    expect(dim!.confidence).toBe('unknown');
    expect(dim!.score).toBe(0);
    expect(dim!.measured).toBe(true);
  });

  it('Focus Indicator dimension wires through scoreFocusIndicator', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const dim = result.dimensions.find((d) => d.name === 'Focus Indicator');
    expect(dim).toBeDefined();
    // No libraryRoot → no sourceChecks → unknown / score 0 / measured:true.
    expect(dim!.confidence).toBe('unknown');
    expect(dim!.score).toBe(0);
    expect(dim!.measured).toBe(true);
  });

  it('Form Association dimension wires through scoreFormAssociation', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const dim = result.dimensions.find((d) => d.name === 'Form Association');
    expect(dim).toBeDefined();
    // No helixMeta + no sourceChecks → unknown / score 0 / measured:true.
    expect(dim!.confidence).toBe('unknown');
    expect(dim!.score).toBe(0);
    expect(dim!.measured).toBe(true);
  });

  it('Accessible Label Pattern dimension wires through scoreAccessibleLabel', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const dim = result.dimensions.find((d) => d.name === 'Accessible Label Pattern');
    expect(dim).toBeDefined();
    // PERFECT_DECL has slot `label` AND member `label` / `aria-label` →
    // CEM-label-surface heuristic returns 50 / heuristic.
    expect(dim!.measured).toBe(true);
    expect(dim!.confidence).toBe('heuristic');
    expect(dim!.score).toBe(50);
  });

  it('Type Coverage dimension measures type annotations', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const tc = result.dimensions.find((d) => d.name === 'Type Coverage');
    expect(tc).toBeDefined();
    expect(tc!.measured).toBe(true);
    expect(tc!.confidence).toBe('verified');
    expect(tc!.score).toBeGreaterThanOrEqual(80);
  });

  it('minimal component still returns valid result', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, MINIMAL_DECL);
    expect(result.dimensions).toHaveLength(21);
    expect(typeof result.score).toBe('number');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
  });
});

// ─── Enterprise Grade Algorithm Integration ──────────────────────────────────

describe('enterprise grade algorithm integration', () => {
  it('component with 95% CEM but 0% type coverage does not get A or B', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, LOW_TYPE_COVERAGE_DECL);
    const tcDim = result.dimensions.find((d) => d.name === 'Type Coverage');
    expect(tcDim!.score).toBeLessThan(50);
    // With low type coverage and untested Test Coverage, grade should be capped
    expect(['A', 'B']).not.toContain(result.grade);
  });

  it('well-documented component with high CEM but low types gets grading notes', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, HIGH_CEM_LOW_TYPE_DECL);
    // Type Coverage should be low (no type annotations on fields)
    const tcDim = result.dimensions.find((d) => d.name === 'Type Coverage');
    expect(tcDim!.score).toBeLessThan(100);
  });

  it('untested critical dimensions affect grade', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    // Test Coverage is untested (no external history) → in untested-critical bucket.
    const testDim = result.dimensions.find((d) => d.name === 'Test Coverage');
    expect(testDim!.measured).toBe(false);
    expect(testDim!.confidence).toBe('untested');
    // CEM-Source Fidelity stays N/A in this single-component path
    // (round-2 codex review pinned this — preserves existing callers).
    // Test Coverage alone (1 untested critical) gates A but B is reachable.
    expect(result.gradingNotes.some((n) => n.includes('untested'))).toBe(true);
  });

  it('grade is A-F string', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
  });

  it('score is a number between 0 and 100', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ─── scoreAllComponentsMultiDimensional ──────────────────────────────────────

describe('scoreAllComponentsMultiDimensional', () => {
  it('scores all provided components', async () => {
    const config = makeConfig();
    const decls = [PERFECT_DECL, MINIMAL_DECL, LOW_TYPE_COVERAGE_DECL];
    const results = await scoreAllComponentsMultiDimensional(config, decls);
    expect(results).toHaveLength(3);
  });

  it('skips declarations without tagName', async () => {
    const config = makeConfig();
    const declNoTag: CemDeclaration = { kind: 'class', name: 'NoTag' };
    const decls = [PERFECT_DECL, declNoTag];
    const results = await scoreAllComponentsMultiDimensional(config, decls);
    expect(results).toHaveLength(1);
    expect(results[0]!.tagName).toBe('perfect-component');
  });

  it('each result has all 21 dimensions', async () => {
    const config = makeConfig();
    const results = await scoreAllComponentsMultiDimensional(config, [PERFECT_DECL, MINIMAL_DECL]);
    for (const result of results) {
      expect(result.dimensions).toHaveLength(21);
    }
  });

  it('returns empty array for empty input', async () => {
    const config = makeConfig();
    const results = await scoreAllComponentsMultiDimensional(config, []);
    expect(results).toHaveLength(0);
  });
});

// ─── JSONL-compatible output shape ───────────────────────────────────────────

describe('JSONL output shape', () => {
  it('result is serializable to valid JSON', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json) as MultiDimensionalHealth;
    expect(parsed.tagName).toBe('perfect-component');
    expect(parsed.dimensions).toHaveLength(21);
  });

  it('each dimension in JSON has required fields', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json) as MultiDimensionalHealth;
    for (const dim of parsed.dimensions) {
      expect(dim).toHaveProperty('name');
      expect(dim).toHaveProperty('score');
      expect(dim).toHaveProperty('weight');
      expect(dim).toHaveProperty('tier');
      expect(dim).toHaveProperty('confidence');
      expect(dim).toHaveProperty('measured');
    }
  });
});
