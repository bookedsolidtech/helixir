/**
 * Scorecard Generator — produces per-library scorecards from multi-dimensional
 * health results, including dimension insights and confidence breakdown.
 */
import type { MultiDimensionalHealth } from '../../packages/core/src/handlers/health.js';
import type { DimensionResult } from '../../packages/core/src/handlers/dimensions.js';
import type { LibraryName } from './library-loader.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DimensionInsight {
  dimension: string;
  average: number;
  tier: string;
  confidence: string;
  note: string;
}

export interface LibraryScorecard {
  library: LibraryName;
  componentCount: number;
  averageScore: number;
  gradeDistribution: Record<string, number>;
  dimensionAverages: Record<string, number>;
  top5: Array<{ tagName: string; score: number; grade: string }>;
  bottom5: Array<{ tagName: string; score: number; grade: string }>;
  dimensionInsights: DimensionInsight[];
  confidenceBreakdown: { verified: number; heuristic: number; untested: number };
  timestamp: string;
}

// ─── Generator ──────────────────────────────────────────────────────────────

export function generateScorecard(
  library: LibraryName,
  results: MultiDimensionalHealth[],
): LibraryScorecard {
  if (results.length === 0) {
    return {
      library,
      componentCount: 0,
      averageScore: 0,
      gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
      dimensionAverages: {},
      top5: [],
      bottom5: [],
      dimensionInsights: [],
      confidenceBreakdown: { verified: 0, heuristic: 0, untested: 0 },
      timestamp: new Date().toISOString(),
    };
  }

  // Average score
  const averageScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  // Grade distribution
  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const r of results) {
    gradeDistribution[r.grade] = (gradeDistribution[r.grade] ?? 0) + 1;
  }

  // Dimension averages
  const dimensionAverages = computeDimensionAverages(results);

  // Top 5 / Bottom 5
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const top5 = sorted.slice(0, 5).map((r) => ({
    tagName: r.tagName,
    score: r.score,
    grade: r.grade,
  }));
  const bottom5 = sorted
    .slice(-5)
    .reverse()
    .map((r) => ({
      tagName: r.tagName,
      score: r.score,
      grade: r.grade,
    }));

  // Dimension insights
  const dimensionInsights = generateDimensionInsights(results, dimensionAverages);

  // Confidence breakdown (aggregate across all components)
  const confidenceBreakdown = { verified: 0, heuristic: 0, untested: 0 };
  for (const r of results) {
    confidenceBreakdown.verified += r.confidenceSummary.verified;
    confidenceBreakdown.heuristic += r.confidenceSummary.heuristic;
    confidenceBreakdown.untested += r.confidenceSummary.untested;
  }

  return {
    library,
    componentCount: results.length,
    averageScore: Math.round(averageScore * 100) / 100,
    gradeDistribution,
    dimensionAverages,
    top5,
    bottom5,
    dimensionInsights,
    confidenceBreakdown,
    timestamp: new Date().toISOString(),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeDimensionAverages(
  results: MultiDimensionalHealth[],
): Record<string, number> {
  const sums: Record<string, { total: number; count: number }> = {};

  for (const r of results) {
    for (const dim of r.dimensions) {
      if (!sums[dim.name]) {
        sums[dim.name] = { total: 0, count: 0 };
      }
      sums[dim.name].total += dim.score;
      sums[dim.name].count += 1;
    }
  }

  const averages: Record<string, number> = {};
  for (const [name, data] of Object.entries(sums)) {
    averages[name] = Math.round((data.total / data.count) * 100) / 100;
  }
  return averages;
}

function generateDimensionInsights(
  results: MultiDimensionalHealth[],
  dimensionAverages: Record<string, number>,
): DimensionInsight[] {
  const insights: DimensionInsight[] = [];
  const overallAvg =
    Object.values(dimensionAverages).reduce((s, v) => s + v, 0) /
    Object.values(dimensionAverages).length;

  // Get dimension metadata from first result
  const dimMeta = new Map<string, DimensionResult>();
  if (results.length > 0) {
    for (const dim of results[0].dimensions) {
      dimMeta.set(dim.name, dim);
    }
  }

  for (const [name, avg] of Object.entries(dimensionAverages)) {
    const meta = dimMeta.get(name);
    const tier = meta?.tier ?? 'unknown';
    const confidence = meta?.confidence ?? 'unknown';

    let note = '';
    if (avg < overallAvg - 20) {
      note = `Significantly below average (${Math.round(overallAvg)}). Major drag on scores.`;
    } else if (avg < overallAvg - 10) {
      note = `Below average (${Math.round(overallAvg)}). Room for improvement.`;
    } else if (avg > overallAvg + 10) {
      note = `Above average. Strong dimension.`;
    } else {
      note = `Near average.`;
    }

    insights.push({ dimension: name, average: avg, tier, confidence, note });
  }

  // Sort by average ascending so worst dimensions come first
  insights.sort((a, b) => a.average - b.average);
  return insights;
}
