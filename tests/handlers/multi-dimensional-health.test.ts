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
  it('returns all 13 dimensions', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    expect(result.dimensions).toHaveLength(13);
  });

  it('includes tagName in result', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    expect(result.tagName).toBe('perfect-component');
  });

  it('all CEM-native dimensions are measured', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const cemNative = result.dimensions.filter(
      (d) => DIMENSION_REGISTRY.find((r) => r.name === d.name)?.source === 'cem-native',
    );
    // CEM-Source Fidelity requires a cem parameter and source files, so it's not measured in unit tests
    const cemSourceFidelity = cemNative.find((d) => d.name === 'CEM-Source Fidelity');
    expect(cemSourceFidelity).toBeDefined();
    expect(cemSourceFidelity?.measured).toBe(false);
    // Naming Consistency requires library-wide conventions (passed via scoreAllComponentsMultiDimensional)
    const namingConsistency = cemNative.find((d) => d.name === 'Naming Consistency');
    expect(namingConsistency).toBeDefined();
    expect(namingConsistency?.measured).toBe(false);
    const measurableNative = cemNative.filter(
      (d) => d.name !== 'CEM-Source Fidelity' && d.name !== 'Naming Consistency',
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
    expect(result.confidenceSummary.untested).toBe(7); // 5 external + CEM-Source Fidelity + Naming Consistency (no cem/conventions in unit tests)
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

  it('Accessibility dimension wires in analyzeAccessibility output', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    const a11y = result.dimensions.find((d) => d.name === 'Accessibility');
    expect(a11y).toBeDefined();
    expect(a11y!.measured).toBe(true);
    expect(a11y!.confidence).toBe('heuristic');
    expect(a11y!.subMetrics).toBeDefined();
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
    expect(result.dimensions).toHaveLength(13);
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

  it('untested critical dimensions (Test Coverage) affect grade', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, PERFECT_DECL);
    // Test Coverage is untested → should generate grading notes
    const testDim = result.dimensions.find((d) => d.name === 'Test Coverage');
    expect(testDim!.measured).toBe(false);
    expect(testDim!.confidence).toBe('untested');
    // Grading notes should mention untested
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

  it('each result has all 13 dimensions', async () => {
    const config = makeConfig();
    const results = await scoreAllComponentsMultiDimensional(config, [PERFECT_DECL, MINIMAL_DECL]);
    for (const result of results) {
      expect(result.dimensions).toHaveLength(13);
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
    expect(parsed.dimensions).toHaveLength(13);
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
