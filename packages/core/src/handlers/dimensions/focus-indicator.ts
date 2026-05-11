/**
 * Focus Indicator dimension scorer — Phase 2.
 *
 * Important-tier (weight 1 in the AAA-decomposed Accessibility group).
 *
 * Pure source-driven. The only inputs are the regex flags the Phase-1
 * detector already ran against the component's styles file.
 *
 *   1. sourceChecks undefined           → 0  / unknown    / measured:false
 *   2. has2pxOutlineRule  === true       → 100 / verified
 *   3. hasFocusVisibleRule === true (no 2px) → 60 / heuristic + note
 *   4. neither                            → 0  / heuristic + note
 *
 * The "no rule found" path returns confidence:heuristic — we DID
 * measure (the styles file was readable, no rule was found), so it is
 * not `unknown`; but the absence-of-rule is a regex inference, not a
 * runtime check, so it stops short of `verified`.
 */

import type { CemDeclaration } from '../cem.js';
import type { HelixAaaEvidence } from '../evidence/helix-aaa-evidence.js';
import type { DimScoreResult } from './types.js';

export function scoreFocusIndicator(
  _decl: CemDeclaration,
  evidence: HelixAaaEvidence,
): DimScoreResult {
  const checks = evidence.sourceChecks;
  if (!checks) {
    return { score: 0, confidence: 'unknown', measured: false };
  }

  if (checks.has2pxOutlineRule) {
    return {
      score: 100,
      confidence: 'verified',
      measured: true,
      subMetrics: [
        {
          name: 'focus-visible-2px-outline',
          score: 1,
          maxScore: 1,
          note: 'meets helix 2px AAA focus-ring contract',
        },
      ],
    };
  }

  if (checks.hasFocusVisibleRule) {
    return {
      score: 60,
      confidence: 'heuristic',
      measured: true,
      notes: ['focus-visible-rule-found-but-not-2px-aaa', 'focus-visible-rule-degraded'],
      subMetrics: [
        {
          name: 'focus-visible-2px-outline',
          score: 0,
          maxScore: 1,
          note: 'focus-visible rule present but does not match 2px contract',
        },
      ],
    };
  }

  return {
    score: 0,
    confidence: 'heuristic',
    measured: true,
    notes: ['no-focus-visible-rule-in-styles', 'focus-ring-degraded'],
    subMetrics: [
      {
        name: 'focus-visible-2px-outline',
        score: 0,
        maxScore: 1,
        note: 'no :focus-visible rule found in styles file',
      },
    ],
  };
}
