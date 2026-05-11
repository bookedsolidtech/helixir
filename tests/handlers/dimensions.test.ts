import { describe, it, expect } from 'vitest';
import {
  DIMENSION_REGISTRY,
  DIMENSION_CLASSIFICATION,
  GRADE_THRESHOLDS,
  TOTAL_WEIGHT,
  calculateGrade,
  computeWeightedScore,
  type DimensionResult,
} from '../../packages/core/src/handlers/dimensions.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDimension(overrides: Partial<DimensionResult> = {}): DimensionResult {
  return {
    name: 'Test Dimension',
    score: 80,
    weight: 10,
    tier: 'important',
    confidence: 'verified',
    measured: true,
    ...overrides,
  };
}

function _makeCriticalDimensions(scores: Record<string, number>): DimensionResult[] {
  return DIMENSION_CLASSIFICATION.critical.map((name) => ({
    name,
    score: scores[name] ?? 80,
    weight: DIMENSION_REGISTRY.find((d) => d.name === name)!.weight,
    tier: 'critical' as const,
    confidence: 'verified' as const,
    measured: true,
  }));
}

function makeFullDimensions(
  criticalScores: Record<string, number> = {},
  importantScore = 80,
  advancedScore = 80,
): DimensionResult[] {
  return DIMENSION_REGISTRY.map((def) => {
    const isCritical = DIMENSION_CLASSIFICATION.critical.includes(def.name);
    const isImportant = DIMENSION_CLASSIFICATION.important.includes(def.name);
    return {
      name: def.name,
      score: isCritical
        ? (criticalScores[def.name] ?? 80)
        : isImportant
          ? importantScore
          : advancedScore,
      weight: def.weight,
      tier: def.tier,
      confidence: 'verified' as const,
      measured: true,
    };
  });
}

// ─── DIMENSION_REGISTRY ──────────────────────────────────────────────────────

describe('DIMENSION_REGISTRY', () => {
  it('contains exactly 21 dimensions', () => {
    // Phase 3: legacy 'Accessibility' (1 dim) split into 8 new dims → 14 - 1 + 8 = 21.
    expect(DIMENSION_REGISTRY).toHaveLength(21);
  });

  it('has 16 cem-native dimensions', () => {
    // Phase 3: 9 original CEM-native minus Accessibility = 8, plus 8 new = 16.
    const cemNative = DIMENSION_REGISTRY.filter((d) => d.source === 'cem-native');
    expect(cemNative).toHaveLength(16);
  });

  it('has 5 external dimensions', () => {
    const external = DIMENSION_REGISTRY.filter((d) => d.source === 'external');
    expect(external).toHaveLength(5);
  });

  it('total weight equals 107', () => {
    // Phase 3: legacy Accessibility (10) replaced by 8 new dims summing to 12 → 105 - 10 + 12 = 107.
    expect(TOTAL_WEIGHT).toBe(107);
  });

  it('all registry weights are non-negative (advanced "AAA Audit Self-Certification" is 0)', () => {
    // Phase 3: AAA Audit Self-Certification is an advanced informational
    // dim with weight 0 — it surfaces in reports but does not affect the
    // weighted score. All other dims remain strictly positive.
    for (const d of DIMENSION_REGISTRY) {
      expect(d.weight).toBeGreaterThanOrEqual(0);
      if (d.name !== 'AAA Audit Self-Certification') {
        expect(d.weight).toBeGreaterThan(0);
      }
    }
  });

  it('every dimension has a valid tier', () => {
    for (const d of DIMENSION_REGISTRY) {
      expect(['critical', 'important', 'advanced']).toContain(d.tier);
    }
  });

  it('critical tier sum-weight exceeds advanced tier sum-weight', () => {
    // Phase 3: per-dim weights are intentionally heterogeneous after the
    // Accessibility split (APG Keyboard Contract is critical at weight 2;
    // Performance is advanced at weight 5). The invariant we still hold
    // is at the tier level: critical dims collectively outweigh advanced.
    const criticalSum = DIMENSION_REGISTRY.filter((d) => d.tier === 'critical').reduce(
      (s, d) => s + d.weight,
      0,
    );
    const advancedSum = DIMENSION_REGISTRY.filter((d) => d.tier === 'advanced').reduce(
      (s, d) => s + d.weight,
      0,
    );
    expect(criticalSum).toBeGreaterThan(advancedSum);
  });
});

// ─── DIMENSION_CLASSIFICATION ────────────────────────────────────────────────

describe('DIMENSION_CLASSIFICATION', () => {
  it('has 6 critical dimensions', () => {
    // Phase 3: legacy 'Accessibility' (1 critical) → split into
    // 'WCAG Conformance' + 'APG Keyboard Contract' (2 critical).
    // Net: 5 - 1 + 2 = 6.
    expect(DIMENSION_CLASSIFICATION.critical).toHaveLength(6);
  });

  it('has 11 important dimensions', () => {
    // Phase 3: previous 7 + Focus Indicator, Form Association,
    // Accessible Label Pattern, Forced Colors Mode = 11.
    expect(DIMENSION_CLASSIFICATION.important).toHaveLength(11);
  });

  it('has 4 advanced dimensions', () => {
    // Phase 3: previous 2 (Performance, Drupal Readiness) + new
    // Form Validity Reporting + AAA Audit Self-Certification = 4.
    expect(DIMENSION_CLASSIFICATION.advanced).toHaveLength(4);
  });

  it('all registry dimension names are classified', () => {
    const allClassified = [
      ...DIMENSION_CLASSIFICATION.critical,
      ...DIMENSION_CLASSIFICATION.important,
      ...DIMENSION_CLASSIFICATION.advanced,
    ];
    for (const d of DIMENSION_REGISTRY) {
      expect(allClassified).toContain(d.name);
    }
  });

  it('Test Coverage is critical', () => {
    expect(DIMENSION_CLASSIFICATION.critical).toContain('Test Coverage');
  });

  it('CEM Completeness is critical', () => {
    expect(DIMENSION_CLASSIFICATION.critical).toContain('CEM Completeness');
  });
});

// ─── GRADE_THRESHOLDS ────────────────────────────────────────────────────────

describe('GRADE_THRESHOLDS', () => {
  it('A requires minWeighted >= 90', () => {
    expect(GRADE_THRESHOLDS.A.minWeighted).toBe(90);
  });

  it('A allows zero untested critical dimensions', () => {
    expect(GRADE_THRESHOLDS.A.maxUntestedCritical).toBe(0);
  });

  it('D allows up to 3 untested critical dimensions', () => {
    expect(GRADE_THRESHOLDS.D.maxUntestedCritical).toBe(3);
  });

  it('thresholds decrease from A to D', () => {
    expect(GRADE_THRESHOLDS.A.minWeighted).toBeGreaterThan(GRADE_THRESHOLDS.B.minWeighted);
    expect(GRADE_THRESHOLDS.B.minWeighted).toBeGreaterThan(GRADE_THRESHOLDS.C.minWeighted);
    expect(GRADE_THRESHOLDS.C.minWeighted).toBeGreaterThan(GRADE_THRESHOLDS.D.minWeighted);
  });
});

// ─── computeWeightedScore ────────────────────────────────────────────────────

describe('computeWeightedScore', () => {
  it('returns 0 for empty dimensions array', () => {
    expect(computeWeightedScore([])).toBe(0);
  });

  it('returns 100 when all measured dimensions score 100', () => {
    const dims = DIMENSION_REGISTRY.map((d) =>
      makeDimension({
        name: d.name,
        score: 100,
        weight: d.weight,
        measured: true,
      }),
    );
    expect(computeWeightedScore(dims)).toBe(100);
  });

  it('returns 0 when all measured dimensions score 0', () => {
    const dims = DIMENSION_REGISTRY.map((d) =>
      makeDimension({
        name: d.name,
        score: 0,
        weight: d.weight,
        measured: true,
      }),
    );
    expect(computeWeightedScore(dims)).toBe(0);
  });

  it('excludes unmeasured dimensions from calculation', () => {
    const dims = [
      makeDimension({ score: 100, weight: 10, measured: true }),
      makeDimension({ score: 0, weight: 10, measured: false }),
    ];
    // Only the measured dimension counts → 100
    expect(computeWeightedScore(dims)).toBe(100);
  });

  it('returns 0 when all dimensions are unmeasured', () => {
    const dims = [makeDimension({ measured: false }), makeDimension({ measured: false })];
    expect(computeWeightedScore(dims)).toBe(0);
  });

  it('correctly weights different dimension scores', () => {
    const dims = [
      makeDimension({ score: 100, weight: 15, measured: true }),
      makeDimension({ score: 50, weight: 10, measured: true }),
    ];
    // (100*15 + 50*10) / 25 = 2000/25 = 80
    expect(computeWeightedScore(dims)).toBe(80);
  });
});

// ─── calculateGrade ──────────────────────────────────────────────────────────

describe('calculateGrade', () => {
  it('awards A when all criteria met: weighted >= 90, all critical >= 80%, no untested critical', () => {
    const dims = makeFullDimensions(
      {
        'CEM Completeness': 95,
        'WCAG Conformance': 85,
        'Type Coverage': 90,
        'Test Coverage': 85,
      },
      90,
      90,
    );
    const result = calculateGrade(92, dims);
    expect(result.grade).toBe('A');
  });

  it('awards B when weighted >= 80 but not all criteria for A', () => {
    const dims = makeFullDimensions(
      {
        'CEM Completeness': 85,
        'WCAG Conformance': 75,
        'Type Coverage': 80,
        'Test Coverage': 75,
      },
      80,
      80,
    );
    const result = calculateGrade(82, dims);
    expect(result.grade).toBe('B');
  });

  it('awards F when weighted < 60', () => {
    const dims = makeFullDimensions(
      {
        'CEM Completeness': 30,
        'WCAG Conformance': 30,
        'Type Coverage': 30,
        'Test Coverage': 30,
      },
      30,
      30,
    );
    const result = calculateGrade(30, dims);
    expect(result.grade).toBe('F');
  });

  it('caps grade at C when any measured critical dimension scores 0%', () => {
    const dims = makeFullDimensions(
      {
        'CEM Completeness': 95,
        'WCAG Conformance': 0,
        'Type Coverage': 95,
        'Test Coverage': 90,
      },
      90,
      90,
    );
    const result = calculateGrade(85, dims);
    // 0% on Accessibility caps at C
    expect(result.grade).not.toBe('A');
    expect(result.grade).not.toBe('B');
    expect(result.gradingNotes.length).toBeGreaterThan(0);
  });

  it('caps grade at D when any measured critical dimension scores < 50%', () => {
    const dims = makeFullDimensions(
      {
        'CEM Completeness': 95,
        'WCAG Conformance': 40,
        'Type Coverage': 95,
        'Test Coverage': 90,
      },
      90,
      90,
    );
    const result = calculateGrade(88, dims);
    expect(result.gradingNotes.some((n) => n.includes('below 50%'))).toBe(true);
  });

  it('untested critical dimensions prevent higher grades', () => {
    const dims = DIMENSION_REGISTRY.map((def) => ({
      name: def.name,
      score: def.name === 'Test Coverage' ? 0 : 95,
      weight: def.weight,
      tier: def.tier,
      confidence: def.name === 'Test Coverage' ? ('untested' as const) : ('verified' as const),
      measured: def.name !== 'Test Coverage',
    }));
    const result = calculateGrade(92, dims);
    // 1 untested critical prevents A (which requires 0 untested)
    expect(result.grade).not.toBe('A');
    expect(result.gradingNotes.some((n) => n.includes('untested'))).toBe(true);
  });

  // M2: `unknown` confidence = "input data missing" must count against
  // maxUntestedCritical the same way `untested` does. Without this, a CEM
  // with absent keys would silently exclude its dimensions from grading
  // and the component would still score A — exactly the gaslighting
  // pattern documented in defect-corpus class 12.
  it('unknown-confidence critical dimensions count against maxUntestedCritical (same as untested)', () => {
    const dims = DIMENSION_REGISTRY.map((def) => ({
      name: def.name,
      score: def.name === 'CEM-Source Fidelity' ? 0 : 95,
      weight: def.weight,
      tier: def.tier,
      // CEM-Source Fidelity is critical — mark it `unknown` (input absent),
      // not `untested` (no measurement). Both should drop the grade.
      confidence: def.name === 'CEM-Source Fidelity' ? ('unknown' as const) : ('verified' as const),
      // `measured: true` here — the analyzer ran, it just couldn't answer.
      // This is the case M2 fixes: pre-M2, this dimension would have
      // come back `notApplicable: true / measured: false` and dropped
      // from the weighted score entirely.
      measured: true,
    }));
    const result = calculateGrade(92, dims);
    expect(result.grade).not.toBe('A');
    expect(result.gradingNotes.some((n) => n.includes('untested'))).toBe(true);
  });

  it('mixing untested + unknown stacks against the same critical budget', () => {
    // Grade B allows up to 1 untested critical. With 1 untested + 1 unknown,
    // we have 2 in the pool and B should be unreachable.
    const dims = DIMENSION_REGISTRY.map((def) => {
      const isTestCoverage = def.name === 'Test Coverage';
      const isFidelity = def.name === 'CEM-Source Fidelity';
      let confidence: 'verified' | 'untested' | 'unknown' = 'verified';
      let measured = true;
      if (isTestCoverage) {
        confidence = 'untested';
        measured = false;
      } else if (isFidelity) {
        confidence = 'unknown';
        measured = true;
      }
      return {
        name: def.name,
        score: isTestCoverage || isFidelity ? 0 : 95,
        weight: def.weight,
        tier: def.tier,
        confidence,
        measured,
      };
    });
    const result = calculateGrade(85, dims);
    // 2 in the untested+unknown pool — A=0, B=1, both gated; C=2 is the
    // ceiling. Result must be C or worse.
    expect(['C', 'D', 'F']).toContain(result.grade);
  });

  it('a component with 95% CEM but 0% type coverage cannot get above C', () => {
    const dims = makeFullDimensions(
      {
        'CEM Completeness': 95,
        'WCAG Conformance': 85,
        'Type Coverage': 0,
        'Test Coverage': 90,
      },
      85,
      85,
    );
    const result = calculateGrade(80, dims);
    expect(['C', 'D', 'F']).toContain(result.grade);
  });

  it('includes grading notes explaining why grade was limited', () => {
    const dims = makeFullDimensions(
      {
        'CEM Completeness': 95,
        'WCAG Conformance': 0,
        'Type Coverage': 95,
        'Test Coverage': 90,
      },
      90,
      90,
    );
    const result = calculateGrade(85, dims);
    expect(result.gradingNotes.length).toBeGreaterThan(0);
    expect(result.gradingNotes.some((n) => n.includes('WCAG Conformance'))).toBe(true);
  });

  it('returns weightedScore in the result', () => {
    const dims = makeFullDimensions({}, 80, 80);
    const result = calculateGrade(82.5, dims);
    expect(result.weightedScore).toBe(82.5);
  });

  it('handles all dimensions untested gracefully', () => {
    const dims = DIMENSION_REGISTRY.map((def) => ({
      name: def.name,
      score: 0,
      weight: def.weight,
      tier: def.tier,
      confidence: 'untested' as const,
      measured: false,
    }));
    const result = calculateGrade(0, dims);
    expect(result.grade).toBe('F');
  });
});
