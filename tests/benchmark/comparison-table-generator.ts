/**
 * Comparison Table Generator — ranks libraries by average score and per-dimension,
 * identifying which dimensions differentiate high vs low scoring libraries.
 */
import type { LibraryScorecard } from './scorecard-generator.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LibraryRanking {
  rank: number;
  library: string;
  averageScore: number;
  componentCount: number;
  grade: string;
}

export interface DimensionRanking {
  dimension: string;
  rankings: Array<{ library: string; average: number; rank: number }>;
  spread: number; // difference between best and worst
}

export interface ComparisonTable {
  overallRankings: LibraryRanking[];
  perDimensionRankings: DimensionRanking[];
  differentiatingDimensions: string[];
  timestamp: string;
}

// ─── Generator ──────────────────────────────────────────────────────────────

export function generateComparisonTable(scorecards: LibraryScorecard[]): ComparisonTable {
  // Overall rankings by average score
  const sorted = [...scorecards].sort((a, b) => b.averageScore - a.averageScore);
  const overallRankings: LibraryRanking[] = sorted.map((sc, idx) => ({
    rank: idx + 1,
    library: sc.library,
    averageScore: sc.averageScore,
    componentCount: sc.componentCount,
    grade: scoreToGrade(sc.averageScore),
  }));

  // Per-dimension rankings
  const allDimensions = collectDimensionNames(scorecards);
  const perDimensionRankings: DimensionRanking[] = allDimensions.map((dim) => {
    const libraryScores = scorecards
      .filter((sc) => sc.dimensionAverages[dim] !== undefined)
      .map((sc) => ({
        library: sc.library,
        average: sc.dimensionAverages[dim],
      }))
      .sort((a, b) => b.average - a.average);

    const ranked = libraryScores.map((ls, idx) => ({
      ...ls,
      rank: idx + 1,
    }));

    const spread = ranked.length > 0 ? ranked[0].average - ranked[ranked.length - 1].average : 0;

    return { dimension: dim, rankings: ranked, spread: Math.round(spread * 100) / 100 };
  });

  // Differentiating dimensions: those with highest spread between best and worst
  const differentiatingDimensions = [...perDimensionRankings]
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 5)
    .map((d) => d.dimension);

  return {
    overallRankings,
    perDimensionRankings,
    differentiatingDimensions,
    timestamp: new Date().toISOString(),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectDimensionNames(scorecards: LibraryScorecard[]): string[] {
  const names = new Set<string>();
  for (const sc of scorecards) {
    for (const dim of Object.keys(sc.dimensionAverages)) {
      names.add(dim);
    }
  }
  return [...names];
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function formatComparisonTableText(table: ComparisonTable): string {
  const lines: string[] = [];
  lines.push('=== Cross-Library Comparison Table ===');
  lines.push('');
  lines.push('Overall Rankings:');
  lines.push('Rank | Library       | Avg Score | Components | Grade');
  lines.push('-----|---------------|-----------|------------|------');
  for (const r of table.overallRankings) {
    lines.push(
      `${String(r.rank).padStart(4)} | ${r.library.padEnd(13)} | ${String(r.averageScore).padStart(9)} | ${String(r.componentCount).padStart(10)} | ${r.grade}`,
    );
  }
  lines.push('');
  lines.push(`Differentiating Dimensions: ${table.differentiatingDimensions.join(', ')}`);
  return lines.join('\n');
}
