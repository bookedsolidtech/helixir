/**
 * JSONL Audit Report Generator — scores every component and writes
 * one JSON object per line, one line per component.
 */

import { writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { McpWcConfig } from '../config.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';
import type { Cem, CemDeclaration } from './cem.js';
import { scoreComponentMultiDimensional } from './health.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuditSummary {
  totalComponents: number;
  averageScore: number;
  gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
  dimensionAverages: Record<string, number>;
  confidenceSummary: { verified: number; heuristic: number; untested: number; unknown: number };
  timestamp: string;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scores every component and generates a JSONL audit report.
 * Each line is a self-contained JSON object for one component.
 */
export async function generateAuditReport(
  config: McpWcConfig,
  cemDeclarations: CemDeclaration[],
  options?: { outputPath?: string; libraryId?: string; cem?: Cem; libraryRoot?: string },
): Promise<{ lines: string[]; summary: AuditSummary }> {
  const withTag = cemDeclarations.filter((decl) => decl.tagName !== undefined);
  const libraryId = options?.libraryId ?? 'default';
  // Default libraryRoot to config.projectRoot so audit_library picks up
  // source-level evidence (focus-visible, attachInternals, forced-colors)
  // the same way score_component does. Without this the two entry points
  // produce divergent scores for the same input — codex push-gate P1,
  // round 3 (2026-05-10).
  const libraryRoot = options?.libraryRoot ?? config.projectRoot;
  const lines: string[] = [];

  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const dimensionTotals: Record<string, { sum: number; count: number }> = {};
  const globalConfidence = { verified: 0, heuristic: 0, untested: 0, unknown: 0 };
  let totalScore = 0;

  for (const decl of withTag) {
    const health = await scoreComponentMultiDimensional(
      config,
      decl,
      options?.cem,
      libraryId,
      undefined,
      libraryRoot,
    );
    const line = JSON.stringify(health);
    lines.push(line);

    totalScore += health.score;
    gradeDistribution[health.grade]++;

    // Aggregate dimension scores
    for (const dim of health.dimensions) {
      if (!dimensionTotals[dim.name]) {
        dimensionTotals[dim.name] = { sum: 0, count: 0 };
      }
      if (dim.measured) {
        const entry = dimensionTotals[dim.name];
        if (entry) {
          entry.sum += dim.score;
          entry.count++;
        }
      }
    }

    // Aggregate confidence — including the M2 `unknown` bucket so the
    // library-level summary surfaces the same anti-gaslighting signal
    // as per-component results. Without this, a library full of
    // CEM-incomplete components would show a clean confidence rollup
    // even though every component flagged unknowns.
    if (health.confidenceSummary) {
      globalConfidence.verified += health.confidenceSummary.verified;
      globalConfidence.heuristic += health.confidenceSummary.heuristic;
      globalConfidence.untested += health.confidenceSummary.untested;
      globalConfidence.unknown += health.confidenceSummary.unknown;
    }
  }

  const totalComponents = withTag.length;
  const averageScore =
    totalComponents === 0 ? 0 : Math.round((totalScore / totalComponents) * 10) / 10;

  const dimensionAverages: Record<string, number> = {};
  for (const [name, totals] of Object.entries(dimensionTotals)) {
    dimensionAverages[name] =
      totals.count === 0 ? 0 : Math.round((totals.sum / totals.count) * 10) / 10;
  }

  const summary: AuditSummary = {
    totalComponents,
    averageScore,
    gradeDistribution,
    dimensionAverages,
    confidenceSummary: globalConfidence,
    timestamp: new Date().toISOString(),
  };

  // Write to file if outputPath provided — with path containment check
  if (options?.outputPath) {
    const resolvedRoot = resolve(config.projectRoot);
    const outputFile = resolve(resolvedRoot, options.outputPath);
    if (!outputFile.startsWith(resolvedRoot + sep) && outputFile !== resolvedRoot) {
      throw new MCPError(
        'outputPath must resolve to a location within the project root.',
        ErrorCategory.VALIDATION,
      );
    }
    await writeFile(outputFile, lines.join('\n') + '\n', 'utf-8');
  }

  return { lines, summary };
}
