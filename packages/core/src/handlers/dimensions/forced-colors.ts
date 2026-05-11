/**
 * Forced Colors dimension scorer — Phase 2.
 *
 * Important-tier (weight 1 in the AAA-decomposed Accessibility group).
 *
 * Decision tree:
 *   1. sourceChecks undefined                                       → 0 / unknown
 *   2. helixMeta.forcedColorsSupported === false (explicit opt-out) → 100 / verified
 *   3. helixMeta.forcedColorsSupported === true AND
 *      sourceChecks.hasForcedColorsBlock === true                    → 100 / verified
 *   4. helixMeta.forcedColorsSupported === true AND
 *      sourceChecks.hasForcedColorsBlock === false                   → 0 / verified
 *      (defect class 19 — claim vs evidence mismatch)
 *   5. sourceChecks.hasForcedColorsBlock === true (no claim)        → 100 / heuristic
 *   6. otherwise                                                     → 0 / heuristic
 *
 * In all branches `measured: true` when sourceChecks exists.
 */

import type { CemDeclaration } from '../cem.js';
import type { HelixAaaEvidence } from '../evidence/helix-aaa-evidence.js';
import type { DimScoreResult } from './types.js';

export function scoreForcedColors(
  _decl: CemDeclaration,
  evidence: HelixAaaEvidence,
): DimScoreResult {
  const checks = evidence.sourceChecks;
  const claim = evidence.helixMeta?.forcedColorsSupported;

  // ── Branch 1: nothing measured ───────────────────────────────────────
  if (!checks) {
    return { score: 0, confidence: 'unknown', measured: false };
  }

  // ── Branch 2: explicit opt-out is a verified pass ───────────────────
  if (claim === false) {
    return {
      score: 100,
      confidence: 'verified',
      measured: true,
      notes: ['forced-colors-not-supported-by-design'],
    };
  }

  // ── Branches 3 + 4: explicit claim of support ───────────────────────
  if (claim === true) {
    if (checks.hasForcedColorsBlock) {
      return {
        score: 100,
        confidence: 'verified',
        measured: true,
        subMetrics: [{ name: 'forced-colors-media-block', score: 1, maxScore: 1 }],
      };
    }
    // The defect-class-19 case.
    return {
      score: 0,
      confidence: 'verified',
      measured: true,
      notes: ['claim-vs-evidence-mismatch', 'forced-colors-media-block-missing'],
      subMetrics: [
        {
          name: 'forced-colors-media-block',
          score: 0,
          maxScore: 1,
          note: 'helixMeta claims forced-colors support but @media block is absent',
        },
      ],
    };
  }

  // ── Branch 5: block present without a claim ─────────────────────────
  if (checks.hasForcedColorsBlock) {
    return {
      score: 100,
      confidence: 'heuristic',
      measured: true,
      notes: ['forced-colors-block-inferred-from-source'],
      subMetrics: [{ name: 'forced-colors-media-block', score: 1, maxScore: 1 }],
    };
  }

  // ── Branch 6: no claim, no block ────────────────────────────────────
  return {
    score: 0,
    confidence: 'heuristic',
    measured: true,
    notes: ['no-forced-colors-block-and-no-claim', 'forced-colors-media-block-missing'],
    subMetrics: [
      {
        name: 'forced-colors-media-block',
        score: 0,
        maxScore: 1,
      },
    ],
  };
}
