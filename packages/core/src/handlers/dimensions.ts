/**
 * Dimension Registry — defines the 12 health dimensions, grade thresholds,
 * and the enterprise-grade algorithm for multi-dimensional health scoring.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type DimensionTier = 'critical' | 'important' | 'advanced';
export type DimensionSource = 'cem-native' | 'external';
export type ConfidenceLevel = 'verified' | 'heuristic' | 'untested';

export interface DimensionDefinition {
  name: string;
  weight: number;
  tier: DimensionTier;
  source: DimensionSource;
  phase: string;
}

export interface SubMetric {
  name: string;
  score: number;
  maxScore: number;
  note?: string;
}

export interface DimensionResult {
  name: string;
  score: number;
  weight: number;
  tier: DimensionTier;
  confidence: ConfidenceLevel;
  measured: boolean;
  subMetrics?: SubMetric[];
}

export interface GradeResult {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  weightedScore: number;
  gradingNotes: string[];
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const DIMENSION_REGISTRY: DimensionDefinition[] = [
  // CEM-native dimensions (helixir can score these)
  {
    name: 'CEM Completeness',
    weight: 15,
    tier: 'critical',
    source: 'cem-native',
    phase: 'cem-analysis',
  },
  {
    name: 'Accessibility',
    weight: 10,
    tier: 'critical',
    source: 'cem-native',
    phase: 'cem-analysis',
  },
  {
    name: 'Type Coverage',
    weight: 10,
    tier: 'critical',
    source: 'cem-native',
    phase: 'cem-analysis',
  },
  {
    name: 'API Surface Quality',
    weight: 10,
    tier: 'important',
    source: 'cem-native',
    phase: 'cem-analysis',
  },
  {
    name: 'CSS Architecture',
    weight: 5,
    tier: 'important',
    source: 'cem-native',
    phase: 'cem-analysis',
  },
  {
    name: 'Event Architecture',
    weight: 5,
    tier: 'important',
    source: 'cem-native',
    phase: 'cem-analysis',
  },
  // External-data dimensions (reported as untested unless history provides scores)
  {
    name: 'Test Coverage',
    weight: 10,
    tier: 'critical',
    source: 'external',
    phase: 'external-data',
  },
  { name: 'Bundle Size', weight: 5, tier: 'important', source: 'external', phase: 'external-data' },
  {
    name: 'Story Coverage',
    weight: 5,
    tier: 'important',
    source: 'external',
    phase: 'external-data',
  },
  { name: 'Performance', weight: 5, tier: 'advanced', source: 'external', phase: 'external-data' },
  {
    name: 'Drupal Readiness',
    weight: 5,
    tier: 'advanced',
    source: 'external',
    phase: 'external-data',
  },
  // Dimension 12: CEM-Source Fidelity — catches CEM vs source divergence
  {
    name: 'CEM-Source Fidelity',
    weight: 10,
    tier: 'critical',
    source: 'cem-native',
    phase: 'cem-analysis',
  },
  // Dimension 13: Slot Architecture — slot documentation, type constraints, coherence
  {
    name: 'Slot Architecture',
    weight: 5,
    tier: 'important',
    source: 'cem-native',
    phase: 'cem-analysis',
  },
];

export const DIMENSION_CLASSIFICATION = {
  critical: [
    'CEM Completeness',
    'Accessibility',
    'Type Coverage',
    'Test Coverage',
    'CEM-Source Fidelity',
  ],
  important: [
    'API Surface Quality',
    'CSS Architecture',
    'Event Architecture',
    'Slot Architecture',
    'Bundle Size',
    'Story Coverage',
  ],
  advanced: ['Performance', 'Drupal Readiness'],
} as const;

export const TOTAL_WEIGHT = DIMENSION_REGISTRY.reduce((sum, d) => sum + d.weight, 0);

// ─── Grade Thresholds ────────────────────────────────────────────────────────

interface GradeThreshold {
  minWeighted: number;
  minCritical: number;
  maxUntestedCritical: number;
}

export const GRADE_THRESHOLDS: Record<'A' | 'B' | 'C' | 'D', GradeThreshold> = {
  A: { minWeighted: 90, minCritical: 80, maxUntestedCritical: 0 },
  B: { minWeighted: 80, minCritical: 70, maxUntestedCritical: 1 },
  C: { minWeighted: 70, minCritical: 60, maxUntestedCritical: 2 },
  D: { minWeighted: 60, minCritical: 50, maxUntestedCritical: 3 },
};

// ─── Enterprise Grade Algorithm ──────────────────────────────────────────────

/**
 * Calculates grade using the enterprise algorithm with critical dimension gates.
 *
 * Grade gates prevent gaming the score through weighted averaging alone:
 * - 0% on any measured critical → grade capped at C
 * - <50% on any measured critical → grade capped at D
 * - Untested critical → treated as 0% for gate checks
 */
export function calculateGrade(weightedScore: number, dimensions: DimensionResult[]): GradeResult {
  const notes: string[] = [];

  const criticalNames: readonly string[] = DIMENSION_CLASSIFICATION.critical;
  const criticalDims = dimensions.filter((d) => criticalNames.includes(d.name));

  const measuredCritical = criticalDims.filter((d) => d.measured);
  const untestedCritical = criticalDims.filter((d) => !d.measured);

  // Check for penalty conditions
  let gradeCap: 'A' | 'B' | 'C' | 'D' | 'F' | null = null;

  // 0% on any measured critical → capped at C
  const zeroCritical = measuredCritical.filter((d) => d.score === 0);
  if (zeroCritical.length > 0) {
    gradeCap = 'C';
    notes.push(`${zeroCritical.map((d) => d.name).join(', ')} scored 0% — grade capped at C`);
  }

  // <50% on any measured critical → capped at D
  const lowCritical = measuredCritical.filter((d) => d.score < 50 && d.score > 0);
  if (lowCritical.length > 0) {
    const newCap = 'D';
    if (gradeCap === null || gradeOrdinal(newCap) > gradeOrdinal(gradeCap)) {
      gradeCap = newCap;
    }
    notes.push(`${lowCritical.map((d) => d.name).join(', ')} scored below 50% — grade capped at D`);
  }

  // Determine base grade from weighted score + gate checks
  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';

  for (const g of ['A', 'B', 'C', 'D'] as const) {
    const threshold = GRADE_THRESHOLDS[g];
    if (weightedScore < threshold.minWeighted) continue;
    if (untestedCritical.length > threshold.maxUntestedCritical) {
      notes.push(`${untestedCritical.length} untested critical dimension(s) prevent grade ${g}`);
      continue;
    }

    // Check all measured critical meet minimum
    const allCriticalMeetMin = measuredCritical.every((d) => d.score >= threshold.minCritical);
    if (!allCriticalMeetMin) {
      const failing = measuredCritical.filter((d) => d.score < threshold.minCritical);
      notes.push(
        `${failing.map((d) => `${d.name} (${d.score}%)`).join(', ')} below ${threshold.minCritical}% minimum for grade ${g}`,
      );
      continue;
    }

    grade = g;
    break;
  }

  // Apply cap if penalty is worse
  if (gradeCap !== null && gradeOrdinal(gradeCap) > gradeOrdinal(grade)) {
    grade = gradeCap;
  }

  return { grade, weightedScore, gradingNotes: notes };
}

/**
 * Computes the weighted score (0-100) from dimension results.
 * Unmeasured dimensions are excluded from the denominator.
 */
export function computeWeightedScore(dimensions: DimensionResult[]): number {
  const measured = dimensions.filter((d) => d.measured);
  if (measured.length === 0) return 0;

  const totalWeight = measured.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = measured.reduce((sum, d) => sum + (d.score / 100) * d.weight, 0);
  return Math.round((weightedSum / totalWeight) * 100 * 10) / 10;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gradeOrdinal(grade: 'A' | 'B' | 'C' | 'D' | 'F'): number {
  const ordinals: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };
  return ordinals[grade] ?? 4;
}
