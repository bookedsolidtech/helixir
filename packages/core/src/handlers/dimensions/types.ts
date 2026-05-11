/**
 * Shared types for the eight Phase-2 dimensional scorers.
 *
 * Each scorer under `packages/core/src/handlers/dimensions/` returns a
 * {@link DimScoreResult}: a single 0-100 score, an explicit confidence
 * verdict, and an optional list of sub-metrics + notes. The shape is
 * designed so the Phase-3 aggregator can fold dim scores into the
 * weighted DimensionResult shape in `dimensions.ts` without reshaping.
 *
 * The scorers DO NOT depend on each other. They only consume
 * {@link CemDeclaration} and {@link HelixAaaEvidence} (produced by the
 * Phase-1 detector at `evidence/helix-aaa-evidence.ts`).
 */

import type { ConfidenceLevel } from '../dimensions.js';

export interface DimSubMetric {
  name: string;
  score: number;
  maxScore: number;
  note?: string;
}

export interface DimScoreResult {
  /** 0-100. */
  score: number;
  /** Verdict — see {@link ConfidenceLevel} in `dimensions.ts`. */
  confidence: ConfidenceLevel;
  /** False when `confidence` is `unknown` or `untested`. */
  measured: boolean;
  /** Optional breakdown — surfaced by the aggregator for UI/report consumers. */
  subMetrics?: DimSubMetric[];
  /** Optional issue strings — used by tests via `issueIncludes` matching. */
  notes?: string[];
}

export type { ConfidenceLevel };
