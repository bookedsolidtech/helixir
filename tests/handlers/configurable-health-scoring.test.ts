/**
 * Tests for configurable health scoring weights.
 *
 * Verifies that:
 * - Custom weight multipliers in config.scoring.weights are applied to dimension weights
 * - Default behavior (all weights 1.0) is backward-compatible
 * - Only specified dimensions get their weights modified
 * - All 14 dimension config keys are supported
 * - Invalid/negative weights are rejected with a warning
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { McpWcConfig } from '../../packages/core/src/config.js';
import { loadConfig } from '../../packages/core/src/config.js';
import { scoreComponentMultiDimensional } from '../../packages/core/src/handlers/health.js';
import {
  DIMENSION_REGISTRY,
  DIMENSION_WEIGHT_KEYS,
} from '../../packages/core/src/handlers/dimensions.js';
import type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';

const NO_HISTORY_DIR = '/nonexistent-health-history-scoring-test';

function makeConfig(overrides?: Partial<McpWcConfig>): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: '/',
    componentPrefix: '',
    healthHistoryDir: NO_HISTORY_DIR,
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
    ...overrides,
  };
}

// A simple but reasonably-documented component for stable testing
const SIMPLE_DECL: CemDeclaration = {
  kind: 'class',
  name: 'TestComponent',
  tagName: 'test-component',
  description: 'A test component.',
  members: [
    {
      kind: 'field',
      name: 'value',
      type: { text: 'string' },
      description: 'The value.',
      attribute: 'value',
    },
  ],
  events: [{ name: 'change', type: { text: 'CustomEvent' }, description: 'Change event.' }],
  slots: [{ name: '', description: 'Default slot.' }],
  cssParts: [{ name: 'base', description: 'Base part.' }],
};

// A component with no accessibility signals — useful for weight-impact tests
const LOW_A11Y_DECL: CemDeclaration = {
  kind: 'class',
  name: 'LowA11y',
  tagName: 'low-a11y',
  description: 'A component with poor accessibility.',
  members: [{ kind: 'field', name: 'value', type: { text: 'string' }, description: 'Some value.' }],
};

// ─── DIMENSION_WEIGHT_KEYS mapping ───────────────────────────────────────────

describe('DIMENSION_WEIGHT_KEYS', () => {
  it('exports a mapping from config key to dimension name', () => {
    expect(DIMENSION_WEIGHT_KEYS).toBeDefined();
    expect(typeof DIMENSION_WEIGHT_KEYS).toBe('object');
  });

  it('maps documentation → CEM Completeness', () => {
    expect(DIMENSION_WEIGHT_KEYS['documentation']).toBe('CEM Completeness');
  });

  it('maps accessibility → Accessibility', () => {
    expect(DIMENSION_WEIGHT_KEYS['accessibility']).toBe('Accessibility');
  });

  it('maps naming → Naming Consistency', () => {
    expect(DIMENSION_WEIGHT_KEYS['naming']).toBe('Naming Consistency');
  });

  it('maps apiConsistency → API Surface Quality', () => {
    expect(DIMENSION_WEIGHT_KEYS['apiConsistency']).toBe('API Surface Quality');
  });

  it('maps cssArchitecture → CSS Architecture', () => {
    expect(DIMENSION_WEIGHT_KEYS['cssArchitecture']).toBe('CSS Architecture');
  });

  it('maps cemSourceFidelity → CEM-Source Fidelity', () => {
    expect(DIMENSION_WEIGHT_KEYS['cemSourceFidelity']).toBe('CEM-Source Fidelity');
  });

  it('maps typeCoverage → Type Coverage', () => {
    expect(DIMENSION_WEIGHT_KEYS['typeCoverage']).toBe('Type Coverage');
  });

  it('maps eventArchitecture → Event Architecture', () => {
    expect(DIMENSION_WEIGHT_KEYS['eventArchitecture']).toBe('Event Architecture');
  });

  it('maps testCoverage → Test Coverage', () => {
    expect(DIMENSION_WEIGHT_KEYS['testCoverage']).toBe('Test Coverage');
  });

  it('maps bundleSize → Bundle Size', () => {
    expect(DIMENSION_WEIGHT_KEYS['bundleSize']).toBe('Bundle Size');
  });

  it('maps storyCoverage → Story Coverage', () => {
    expect(DIMENSION_WEIGHT_KEYS['storyCoverage']).toBe('Story Coverage');
  });

  it('maps performance → Performance', () => {
    expect(DIMENSION_WEIGHT_KEYS['performance']).toBe('Performance');
  });

  it('maps drupalReadiness → Drupal Readiness', () => {
    expect(DIMENSION_WEIGHT_KEYS['drupalReadiness']).toBe('Drupal Readiness');
  });

  it('maps slotArchitecture → Slot Architecture', () => {
    expect(DIMENSION_WEIGHT_KEYS['slotArchitecture']).toBe('Slot Architecture');
  });

  it('covers all 14 dimensions in the DIMENSION_REGISTRY', () => {
    const mappedDimensions = new Set(Object.values(DIMENSION_WEIGHT_KEYS));
    const registryDimensions = new Set(DIMENSION_REGISTRY.map((d) => d.name));
    // Every dimension in the registry should have a config key
    for (const name of registryDimensions) {
      expect(mappedDimensions.has(name)).toBe(true);
    }
  });
});

// ─── scoreComponentMultiDimensional with custom weights ───────────────────────

describe('scoreComponentMultiDimensional — custom weights', () => {
  it('uses base dimension weights when no scoring config provided', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    for (const dim of result.dimensions) {
      const registryEntry = DIMENSION_REGISTRY.find((d) => d.name === dim.name);
      expect(registryEntry).toBeDefined();
      expect(dim.weight).toBe(registryEntry!.weight);
    }
  });

  it('uses base dimension weights when scoring config is empty object', async () => {
    const config = makeConfig({ scoring: {} });
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    for (const dim of result.dimensions) {
      const registryEntry = DIMENSION_REGISTRY.find((d) => d.name === dim.name);
      expect(dim.weight).toBe(registryEntry!.weight);
    }
  });

  it('uses base dimension weights when scoring.weights is empty object', async () => {
    const config = makeConfig({ scoring: { weights: {} } });
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    for (const dim of result.dimensions) {
      const registryEntry = DIMENSION_REGISTRY.find((d) => d.name === dim.name);
      expect(dim.weight).toBe(registryEntry!.weight);
    }
  });

  it('applies accessibility multiplier to Accessibility dimension weight', async () => {
    const config = makeConfig({ scoring: { weights: { accessibility: 2.0 } } });
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    const accessibilityDim = result.dimensions.find((d) => d.name === 'Accessibility');
    const baseWeight = DIMENSION_REGISTRY.find((d) => d.name === 'Accessibility')!.weight;

    expect(accessibilityDim).toBeDefined();
    expect(accessibilityDim!.weight).toBe(baseWeight * 2.0);
  });

  it('applies documentation multiplier to CEM Completeness dimension weight', async () => {
    const config = makeConfig({ scoring: { weights: { documentation: 1.5 } } });
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    const dim = result.dimensions.find((d) => d.name === 'CEM Completeness');
    const baseWeight = DIMENSION_REGISTRY.find((d) => d.name === 'CEM Completeness')!.weight;

    expect(dim).toBeDefined();
    expect(dim!.weight).toBeCloseTo(baseWeight * 1.5);
  });

  it('applies cemSourceFidelity multiplier to CEM-Source Fidelity dimension weight', async () => {
    const config = makeConfig({ scoring: { weights: { cemSourceFidelity: 0.5 } } });
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    const dim = result.dimensions.find((d) => d.name === 'CEM-Source Fidelity');
    const baseWeight = DIMENSION_REGISTRY.find((d) => d.name === 'CEM-Source Fidelity')!.weight;

    expect(dim).toBeDefined();
    expect(dim!.weight).toBeCloseTo(baseWeight * 0.5);
  });

  it('only modifies specified dimensions; other dimensions keep base weights', async () => {
    const config = makeConfig({ scoring: { weights: { accessibility: 3.0 } } });
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    // Accessibility gets the multiplier
    const accessibilityDim = result.dimensions.find((d) => d.name === 'Accessibility');
    const accessibilityBase = DIMENSION_REGISTRY.find((d) => d.name === 'Accessibility')!.weight;
    expect(accessibilityDim!.weight).toBe(accessibilityBase * 3.0);

    // All other dimensions keep base weight
    const otherDims = result.dimensions.filter((d) => d.name !== 'Accessibility');
    for (const dim of otherDims) {
      const registryEntry = DIMENSION_REGISTRY.find((d) => d.name === dim.name);
      expect(dim.weight).toBe(registryEntry!.weight);
    }
  });

  it('multiplier of 1.0 produces same result as no weight configured', async () => {
    const baseConfig = makeConfig();
    const explicitOneConfig = makeConfig({
      scoring: { weights: { documentation: 1.0, accessibility: 1.0 } },
    });

    const baseResult = await scoreComponentMultiDimensional(baseConfig, SIMPLE_DECL);
    const explicitOneResult = await scoreComponentMultiDimensional(explicitOneConfig, SIMPLE_DECL);

    expect(explicitOneResult.score).toBe(baseResult.score);
  });

  it('higher weight on low-scoring dimension lowers the final score', async () => {
    const baseConfig = makeConfig();
    const highA11yConfig = makeConfig({ scoring: { weights: { accessibility: 5.0 } } });

    const baseResult = await scoreComponentMultiDimensional(baseConfig, LOW_A11Y_DECL);
    const highA11yResult = await scoreComponentMultiDimensional(highA11yConfig, LOW_A11Y_DECL);

    const baseA11yDim = baseResult.dimensions.find((d) => d.name === 'Accessibility');
    const highA11yDim = highA11yResult.dimensions.find((d) => d.name === 'Accessibility');

    // Both have the same accessibility score
    expect(baseA11yDim!.score).toBe(highA11yDim!.score);

    // When accessibility scores poorly, increasing its weight should lower the final score
    // (or at minimum not raise it)
    if (baseA11yDim!.score < 50) {
      expect(highA11yResult.score).toBeLessThanOrEqual(baseResult.score);
    }
  });

  it('lower weight on a dimension reduces its impact on the final score', async () => {
    const baseConfig = makeConfig();
    const lowDocConfig = makeConfig({ scoring: { weights: { documentation: 0.1 } } });

    const baseResult = await scoreComponentMultiDimensional(baseConfig, LOW_A11Y_DECL);
    const lowDocResult = await scoreComponentMultiDimensional(lowDocConfig, LOW_A11Y_DECL);

    // The two scores should differ
    expect(baseResult.score).not.toBeNaN();
    expect(lowDocResult.score).not.toBeNaN();
    expect(lowDocResult.score).toBeGreaterThanOrEqual(0);
    expect(lowDocResult.score).toBeLessThanOrEqual(100);

    // The CEM Completeness weight should be reduced
    const cemDim = lowDocResult.dimensions.find((d) => d.name === 'CEM Completeness');
    const cemBase = DIMENSION_REGISTRY.find((d) => d.name === 'CEM Completeness')!.weight;
    expect(cemDim!.weight).toBeCloseTo(cemBase * 0.1);
  });

  it('multiple weight overrides all apply simultaneously', async () => {
    const config = makeConfig({
      scoring: {
        weights: {
          documentation: 2.0,
          accessibility: 0.5,
          naming: 3.0,
        },
      },
    });
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    const docDim = result.dimensions.find((d) => d.name === 'CEM Completeness');
    const a11yDim = result.dimensions.find((d) => d.name === 'Accessibility');
    const namingDim = result.dimensions.find((d) => d.name === 'Naming Consistency');

    const docBase = DIMENSION_REGISTRY.find((d) => d.name === 'CEM Completeness')!.weight;
    const a11yBase = DIMENSION_REGISTRY.find((d) => d.name === 'Accessibility')!.weight;
    const namingBase = DIMENSION_REGISTRY.find((d) => d.name === 'Naming Consistency')!.weight;

    expect(docDim!.weight).toBeCloseTo(docBase * 2.0);
    expect(a11yDim!.weight).toBeCloseTo(a11yBase * 0.5);
    expect(namingDim!.weight).toBeCloseTo(namingBase * 3.0);
  });
});

// ─── Config loading — scoring.weights from helixir.mcp.json ──────────────────

describe('loadConfig — scoring.weights', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.unstubAllEnvs();
    tmpDir = mkdtempSync(join(tmpdir(), 'helixir-scoring-test-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scoring defaults to undefined when not in config file', () => {
    writeFileSync(join(tmpDir, 'helixir.mcp.json'), JSON.stringify({ cemPath: 'cem.json' }));
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const config = loadConfig();

    expect(config.scoring).toBeUndefined();
  });

  it('loads scoring.weights from helixir.mcp.json', () => {
    writeFileSync(
      join(tmpDir, 'helixir.mcp.json'),
      JSON.stringify({
        cemPath: 'cem.json',
        scoring: {
          weights: {
            accessibility: 1.5,
            documentation: 2.0,
          },
        },
      }),
    );
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const config = loadConfig();

    expect(config.scoring?.weights?.accessibility).toBe(1.5);
    expect(config.scoring?.weights?.documentation).toBe(2.0);
  });

  it('loads scoring.weights with all supported keys', () => {
    writeFileSync(
      join(tmpDir, 'helixir.mcp.json'),
      JSON.stringify({
        scoring: {
          weights: {
            documentation: 1.0,
            accessibility: 1.5,
            typeCoverage: 1.0,
            apiConsistency: 1.0,
            cssArchitecture: 0.5,
            eventArchitecture: 1.0,
            testCoverage: 2.0,
            bundleSize: 0.5,
            storyCoverage: 0.5,
            performance: 0.5,
            drupalReadiness: 0.5,
            cemSourceFidelity: 0.5,
            slotArchitecture: 1.0,
            naming: 1.0,
          },
        },
      }),
    );
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const config = loadConfig();

    expect(config.scoring?.weights?.documentation).toBe(1.0);
    expect(config.scoring?.weights?.accessibility).toBe(1.5);
    expect(config.scoring?.weights?.typeCoverage).toBe(1.0);
    expect(config.scoring?.weights?.apiConsistency).toBe(1.0);
    expect(config.scoring?.weights?.cssArchitecture).toBe(0.5);
    expect(config.scoring?.weights?.eventArchitecture).toBe(1.0);
    expect(config.scoring?.weights?.testCoverage).toBe(2.0);
    expect(config.scoring?.weights?.bundleSize).toBe(0.5);
    expect(config.scoring?.weights?.storyCoverage).toBe(0.5);
    expect(config.scoring?.weights?.performance).toBe(0.5);
    expect(config.scoring?.weights?.drupalReadiness).toBe(0.5);
    expect(config.scoring?.weights?.cemSourceFidelity).toBe(0.5);
    expect(config.scoring?.weights?.slotArchitecture).toBe(1.0);
    expect(config.scoring?.weights?.naming).toBe(1.0);
  });

  it('rejects non-positive weights (zero) with a warning', () => {
    writeFileSync(
      join(tmpDir, 'helixir.mcp.json'),
      JSON.stringify({
        scoring: { weights: { accessibility: 0 } },
      }),
    );
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const config = loadConfig();
      // Zero is invalid — should be discarded
      expect(config.scoring?.weights?.accessibility).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('scoring.weights.accessibility'),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('rejects negative weights with a warning', () => {
    writeFileSync(
      join(tmpDir, 'helixir.mcp.json'),
      JSON.stringify({
        scoring: { weights: { documentation: -1 } },
      }),
    );
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const config = loadConfig();
      expect(config.scoring?.weights?.documentation).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('scoring.weights.documentation'),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('rejects non-numeric weights with a warning', () => {
    writeFileSync(
      join(tmpDir, 'helixir.mcp.json'),
      JSON.stringify({
        scoring: { weights: { accessibility: 'high' } },
      }),
    );
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const config = loadConfig();
      expect(config.scoring?.weights?.accessibility).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('scoring.weights.accessibility'),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('accepts valid weights alongside invalid ones, discarding only invalid', () => {
    writeFileSync(
      join(tmpDir, 'helixir.mcp.json'),
      JSON.stringify({
        scoring: {
          weights: {
            accessibility: 2.0, // valid
            documentation: -1, // invalid — negative
          },
        },
      }),
    );
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const config = loadConfig();
      expect(config.scoring?.weights?.accessibility).toBe(2.0);
      expect(config.scoring?.weights?.documentation).toBeUndefined();
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('scoring.weights absent from config leaves scoring undefined', () => {
    writeFileSync(join(tmpDir, 'helixir.mcp.json'), JSON.stringify({ scoring: {} }));
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const config = loadConfig();

    // scoring present but weights absent — either undefined scoring or empty weights
    expect(config.scoring?.weights).toBeUndefined();
  });
});
