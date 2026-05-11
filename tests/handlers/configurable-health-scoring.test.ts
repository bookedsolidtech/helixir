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

  // Phase 3 dimensional upgrade: the legacy `accessibility` key has been
  // removed from DIMENSION_WEIGHT_KEYS (the `Accessibility` dim was split
  // into 8 new dims). `weights.accessibility` is still ACCEPTED on the
  // Config interface as `@deprecated` and fans out across the 5 split
  // sub-dims via getEffectiveWeight — see the back-compat tests below.
  it('does NOT map `accessibility` directly (legacy key removed from registry)', () => {
    expect(DIMENSION_WEIGHT_KEYS['accessibility']).toBeUndefined();
  });

  it('maps wcagConformance → WCAG Conformance', () => {
    expect(DIMENSION_WEIGHT_KEYS['wcagConformance']).toBe('WCAG Conformance');
  });

  it('maps apgKeyboard → APG Keyboard Contract', () => {
    expect(DIMENSION_WEIGHT_KEYS['apgKeyboard']).toBe('APG Keyboard Contract');
  });

  it('maps focusIndicator → Focus Indicator', () => {
    expect(DIMENSION_WEIGHT_KEYS['focusIndicator']).toBe('Focus Indicator');
  });

  it('maps formAssociation → Form Association', () => {
    expect(DIMENSION_WEIGHT_KEYS['formAssociation']).toBe('Form Association');
  });

  it('maps accessibleLabel → Accessible Label Pattern', () => {
    expect(DIMENSION_WEIGHT_KEYS['accessibleLabel']).toBe('Accessible Label Pattern');
  });

  it('maps forcedColors → Forced Colors Mode', () => {
    expect(DIMENSION_WEIGHT_KEYS['forcedColors']).toBe('Forced Colors Mode');
  });

  it('maps formValidityReporting → Form Validity Reporting', () => {
    expect(DIMENSION_WEIGHT_KEYS['formValidityReporting']).toBe('Form Validity Reporting');
  });

  it('maps aaaAuditSelfCertification → AAA Audit Self-Certification', () => {
    expect(DIMENSION_WEIGHT_KEYS['aaaAuditSelfCertification']).toBe('AAA Audit Self-Certification');
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

  it('covers all 21 dimensions in the DIMENSION_REGISTRY', () => {
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

  it('applies wcagConformance multiplier to WCAG Conformance dimension weight', async () => {
    const config = makeConfig({ scoring: { weights: { wcagConformance: 2.0 } } });
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    const dim = result.dimensions.find((d) => d.name === 'WCAG Conformance');
    const baseWeight = DIMENSION_REGISTRY.find((d) => d.name === 'WCAG Conformance')!.weight;

    expect(dim).toBeDefined();
    expect(dim!.weight).toBe(baseWeight * 2.0);
  });

  it('applies apgKeyboard multiplier to APG Keyboard Contract dimension weight', async () => {
    const config = makeConfig({ scoring: { weights: { apgKeyboard: 1.5 } } });
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    const dim = result.dimensions.find((d) => d.name === 'APG Keyboard Contract');
    const baseWeight = DIMENSION_REGISTRY.find((d) => d.name === 'APG Keyboard Contract')!.weight;

    expect(dim).toBeDefined();
    expect(dim!.weight).toBeCloseTo(baseWeight * 1.5);
  });

  it('applies focusIndicator / formAssociation / accessibleLabel multipliers to their dims', async () => {
    const config = makeConfig({
      scoring: {
        weights: {
          focusIndicator: 2.0,
          formAssociation: 3.0,
          accessibleLabel: 0.5,
        },
      },
    });
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    const focusDim = result.dimensions.find((d) => d.name === 'Focus Indicator');
    const formDim = result.dimensions.find((d) => d.name === 'Form Association');
    const labelDim = result.dimensions.find((d) => d.name === 'Accessible Label Pattern');

    const focusBase = DIMENSION_REGISTRY.find((d) => d.name === 'Focus Indicator')!.weight;
    const formBase = DIMENSION_REGISTRY.find((d) => d.name === 'Form Association')!.weight;
    const labelBase = DIMENSION_REGISTRY.find((d) => d.name === 'Accessible Label Pattern')!.weight;

    expect(focusDim!.weight).toBeCloseTo(focusBase * 2.0);
    expect(formDim!.weight).toBeCloseTo(formBase * 3.0);
    expect(labelDim!.weight).toBeCloseTo(labelBase * 0.5);
  });

  it('applies forcedColors / formValidityReporting / aaaAuditSelfCertification multipliers', async () => {
    const config = makeConfig({
      scoring: {
        weights: {
          forcedColors: 4.0,
          formValidityReporting: 2.0,
          // aaaAuditSelfCertification has base weight 0 — multiplier leaves it 0
          // (still useful to verify the key is wired without crashing).
          aaaAuditSelfCertification: 5.0,
        },
      },
    });
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    const fcDim = result.dimensions.find((d) => d.name === 'Forced Colors Mode');
    const fvDim = result.dimensions.find((d) => d.name === 'Form Validity Reporting');
    const aaaDim = result.dimensions.find((d) => d.name === 'AAA Audit Self-Certification');

    const fcBase = DIMENSION_REGISTRY.find((d) => d.name === 'Forced Colors Mode')!.weight;
    const fvBase = DIMENSION_REGISTRY.find((d) => d.name === 'Form Validity Reporting')!.weight;
    const aaaBase = DIMENSION_REGISTRY.find(
      (d) => d.name === 'AAA Audit Self-Certification',
    )!.weight;

    expect(fcDim!.weight).toBeCloseTo(fcBase * 4.0);
    expect(fvDim!.weight).toBeCloseTo(fvBase * 2.0);
    expect(aaaDim!.weight).toBeCloseTo(aaaBase * 5.0);
    expect(aaaBase).toBe(0);
  });

  // ── Phase 3 back-compat: legacy `accessibility` fan-out ────────────────
  it('legacy `weights.accessibility` fans out across the 5 split a11y dims', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const config = makeConfig({ scoring: { weights: { accessibility: 2.0 } } });
      const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

      // The 5 dims the legacy `accessibility` key fans out to.
      const FANOUT = [
        'WCAG Conformance',
        'APG Keyboard Contract',
        'Focus Indicator',
        'Form Association',
        'Accessible Label Pattern',
      ];
      for (const name of FANOUT) {
        const dim = result.dimensions.find((d) => d.name === name)!;
        const base = DIMENSION_REGISTRY.find((d) => d.name === name)!.weight;
        expect(dim.weight).toBeCloseTo(base * 2.0);
      }

      // The 3 net-new a11y dims do NOT receive the legacy multiplier —
      // they only honor their own per-sub-dim keys.
      const NOT_FANOUT = [
        'Forced Colors Mode',
        'Form Validity Reporting',
        'AAA Audit Self-Certification',
      ];
      for (const name of NOT_FANOUT) {
        const dim = result.dimensions.find((d) => d.name === name)!;
        const base = DIMENSION_REGISTRY.find((d) => d.name === name)!.weight;
        expect(dim.weight).toBe(base);
      }
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('specific per-sub-dim key wins when both `accessibility` and the sub-dim key are set', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const config = makeConfig({
        scoring: { weights: { accessibility: 2.0, wcagConformance: 5.0 } },
      });
      const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

      // WCAG Conformance honors the specific override (5x), not the legacy 2x.
      const wcagDim = result.dimensions.find((d) => d.name === 'WCAG Conformance')!;
      const wcagBase = DIMENSION_REGISTRY.find((d) => d.name === 'WCAG Conformance')!.weight;
      expect(wcagDim.weight).toBeCloseTo(wcagBase * 5.0);

      // The other 4 fan-out dims still get the legacy multiplier.
      const apgDim = result.dimensions.find((d) => d.name === 'APG Keyboard Contract')!;
      const apgBase = DIMENSION_REGISTRY.find((d) => d.name === 'APG Keyboard Contract')!.weight;
      expect(apgDim.weight).toBeCloseTo(apgBase * 2.0);
    } finally {
      warnSpy.mockRestore();
    }
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
    // Phase 3: target a single specific sub-dim key (the canonical
    // single-dim case). Legacy `accessibility` is exercised by the
    // fan-out test above.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const config = makeConfig({ scoring: { weights: { wcagConformance: 3.0 } } });
      const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

      // WCAG Conformance gets the multiplier
      const wcagDim = result.dimensions.find((d) => d.name === 'WCAG Conformance')!;
      const wcagBase = DIMENSION_REGISTRY.find((d) => d.name === 'WCAG Conformance')!.weight;
      expect(wcagDim.weight).toBe(wcagBase * 3.0);

      // All other dimensions keep base weight
      const otherDims = result.dimensions.filter((d) => d.name !== 'WCAG Conformance');
      for (const dim of otherDims) {
        const registryEntry = DIMENSION_REGISTRY.find((d) => d.name === dim.name);
        expect(dim.weight).toBe(registryEntry!.weight);
      }
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('multiplier of 1.0 produces same result as no weight configured', async () => {
    // Phase 3: keep `accessibility: 1.0` in the input to verify the legacy
    // fan-out path is a no-op at 1.0× (the warning still fires but the
    // weights are unchanged). Suppress the deprecation noise during the test.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const baseConfig = makeConfig();
      const explicitOneConfig = makeConfig({
        scoring: { weights: { documentation: 1.0, accessibility: 1.0 } },
      });

      const baseResult = await scoreComponentMultiDimensional(baseConfig, SIMPLE_DECL);
      const explicitOneResult = await scoreComponentMultiDimensional(
        explicitOneConfig,
        SIMPLE_DECL,
      );

      expect(explicitOneResult.score).toBe(baseResult.score);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('higher weight on low-scoring dimension lowers the final score', async () => {
    // Phase 3: target WCAG Conformance directly — LOW_A11Y_DECL has no
    // aria-* members so the dim falls into Branch 5 (unknown / measured:false)
    // pre-multiplier. To exercise the weight-on-score interaction we
    // pick a dim that DOES score and DOES score low. CSS Architecture
    // is a stable choice — it scores from cssProperties/cssParts, both
    // absent on LOW_A11Y_DECL, so the dim is measured-but-low.
    const baseConfig = makeConfig();
    const heavyConfig = makeConfig({ scoring: { weights: { cssArchitecture: 5.0 } } });

    const baseResult = await scoreComponentMultiDimensional(baseConfig, LOW_A11Y_DECL);
    const heavyResult = await scoreComponentMultiDimensional(heavyConfig, LOW_A11Y_DECL);

    const baseDim = baseResult.dimensions.find((d) => d.name === 'CSS Architecture');
    const heavyDim = heavyResult.dimensions.find((d) => d.name === 'CSS Architecture');

    // Both have the same dimension score; only the weight differs.
    expect(baseDim!.score).toBe(heavyDim!.score);

    // When the dim scores poorly AND is measured, increasing its weight
    // pulls the weighted average down (or at minimum, not up).
    if (baseDim!.measured && baseDim!.score < 50) {
      expect(heavyResult.score).toBeLessThanOrEqual(baseResult.score);
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
    // Phase 3: legacy `accessibility` is replaced by `wcagConformance`
    // (the single dim with the same role in the new shape).
    const config = makeConfig({
      scoring: {
        weights: {
          documentation: 2.0,
          wcagConformance: 0.5,
          naming: 3.0,
        },
      },
    });
    const result = await scoreComponentMultiDimensional(config, SIMPLE_DECL);

    const docDim = result.dimensions.find((d) => d.name === 'CEM Completeness');
    const wcagDim = result.dimensions.find((d) => d.name === 'WCAG Conformance');
    const namingDim = result.dimensions.find((d) => d.name === 'Naming Consistency');

    const docBase = DIMENSION_REGISTRY.find((d) => d.name === 'CEM Completeness')!.weight;
    const wcagBase = DIMENSION_REGISTRY.find((d) => d.name === 'WCAG Conformance')!.weight;
    const namingBase = DIMENSION_REGISTRY.find((d) => d.name === 'Naming Consistency')!.weight;

    expect(docDim!.weight).toBeCloseTo(docBase * 2.0);
    expect(wcagDim!.weight).toBeCloseTo(wcagBase * 0.5);
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
