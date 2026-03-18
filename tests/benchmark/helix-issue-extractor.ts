/**
 * Helix Issue Extractor — extracts actionable issues from helix component
 * scoring results, comparing against gold standard libraries.
 */
import type { MultiDimensionalHealth } from '../../packages/core/src/handlers/health.js';
import type { LibraryScorecard } from './scorecard-generator.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ComponentIssue {
  tagName: string;
  dimension: string;
  score: number;
  tier: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface GoldStandardComparison {
  dimension: string;
  helixAverage: number;
  materialAverage: number;
  carbonAverage: number;
  gap: number;
  status: 'ahead' | 'competitive' | 'behind' | 'far-behind';
}

export interface HelixDeepDive {
  totalComponents: number;
  averageScore: number;
  componentBreakdown: Array<{
    tagName: string;
    score: number;
    grade: string;
    issues: ComponentIssue[];
  }>;
  goldStandardComparison: GoldStandardComparison[];
  actionableIssues: ComponentIssue[];
  cemSourceFidelityFindings: ComponentIssue[];
}

// ─── Extractor ──────────────────────────────────────────────────────────────

export function extractHelixIssues(results: MultiDimensionalHealth[]): ComponentIssue[] {
  const issues: ComponentIssue[] = [];

  for (const r of results) {
    for (const dim of r.dimensions) {
      if (dim.score < 50 && dim.tier === 'critical') {
        issues.push({
          tagName: r.tagName,
          dimension: dim.name,
          score: dim.score,
          tier: dim.tier,
          description: `Critical dimension "${dim.name}" scores ${dim.score}/100`,
          severity: 'critical',
        });
      } else if (dim.score < 50 && dim.tier === 'important') {
        issues.push({
          tagName: r.tagName,
          dimension: dim.name,
          score: dim.score,
          tier: dim.tier,
          description: `Important dimension "${dim.name}" scores ${dim.score}/100`,
          severity: 'warning',
        });
      } else if (dim.score < 30) {
        issues.push({
          tagName: r.tagName,
          dimension: dim.name,
          score: dim.score,
          tier: dim.tier,
          description: `Dimension "${dim.name}" scores very low at ${dim.score}/100`,
          severity: 'warning',
        });
      }
    }

    // Extract issues from the health result itself
    for (const issue of r.issues) {
      if (issue.includes('CEM-Source Fidelity') || issue.includes('fidelity')) {
        issues.push({
          tagName: r.tagName,
          dimension: 'CEM-Source Fidelity',
          score: 0,
          tier: 'critical',
          description: issue,
          severity: 'critical',
        });
      }
    }
  }

  return issues;
}

export function extractCemSourceFidelityFindings(
  results: MultiDimensionalHealth[],
): ComponentIssue[] {
  const findings: ComponentIssue[] = [];

  for (const r of results) {
    const fidelityDim = r.dimensions.find((d) => d.name === 'CEM-Source Fidelity');
    if (fidelityDim && fidelityDim.score < 100) {
      findings.push({
        tagName: r.tagName,
        dimension: 'CEM-Source Fidelity',
        score: fidelityDim.score,
        tier: fidelityDim.tier,
        description: `CEM-Source Fidelity score: ${fidelityDim.score}/100. ${
          fidelityDim.subMetrics
            ?.map((s) => s.note)
            .filter(Boolean)
            .join('; ') ?? 'Check source files for discrepancies.'
        }`,
        severity: fidelityDim.score < 50 ? 'critical' : 'warning',
      });
    }
  }

  return findings;
}

export function compareAgainstGoldStandards(
  helixScorecard: LibraryScorecard,
  materialScorecard: LibraryScorecard | undefined,
  carbonScorecard: LibraryScorecard | undefined,
): GoldStandardComparison[] {
  const comparisons: GoldStandardComparison[] = [];

  for (const [dim, helixAvg] of Object.entries(helixScorecard.dimensionAverages)) {
    const materialAvg = materialScorecard?.dimensionAverages[dim] ?? 0;
    const carbonAvg = carbonScorecard?.dimensionAverages[dim] ?? 0;
    const goldAvg = Math.max(materialAvg, carbonAvg);
    const gap = helixAvg - goldAvg;

    let status: GoldStandardComparison['status'];
    if (gap > 5) status = 'ahead';
    else if (gap >= -5) status = 'competitive';
    else if (gap >= -20) status = 'behind';
    else status = 'far-behind';

    comparisons.push({
      dimension: dim,
      helixAverage: helixAvg,
      materialAverage: materialAvg,
      carbonAverage: carbonAvg,
      gap: Math.round(gap * 100) / 100,
      status,
    });
  }

  return comparisons;
}

export function generateHelixDeepDive(
  helixResults: MultiDimensionalHealth[],
  helixScorecard: LibraryScorecard,
  materialScorecard: LibraryScorecard | undefined,
  carbonScorecard: LibraryScorecard | undefined,
): HelixDeepDive {
  const allIssues = extractHelixIssues(helixResults);
  const fidelityFindings = extractCemSourceFidelityFindings(helixResults);

  const componentBreakdown = helixResults.map((r) => ({
    tagName: r.tagName,
    score: r.score,
    grade: r.grade,
    issues: allIssues.filter((i) => i.tagName === r.tagName),
  }));

  // Sort by score ascending so worst components come first
  componentBreakdown.sort((a, b) => a.score - b.score);

  return {
    totalComponents: helixResults.length,
    averageScore: helixScorecard.averageScore,
    componentBreakdown,
    goldStandardComparison: compareAgainstGoldStandards(
      helixScorecard,
      materialScorecard,
      carbonScorecard,
    ),
    actionableIssues: allIssues.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    }),
    cemSourceFidelityFindings: fidelityFindings,
  };
}
