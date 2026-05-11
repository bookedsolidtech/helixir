/**
 * Form Validity Reporting dimension scorer — Phase 2.
 *
 * Advanced-tier (weight 1 in the AAA-decomposed Accessibility group).
 *
 * Decision tree:
 *   1. helixMeta.formAssociated === false (explicit N/A)        → 100 / verified
 *   2. sourceChecks undefined                                    → 0 / unknown
 *   3. sourceChecks.hasSetValidityCall === true                 → 100 / verified
 *   4. form-associated AND no setValidity call                  → 0 / verified
 *      (defect class 18 — half-implemented form association)
 *   5. neither claim nor source signals                          → 0 / unknown
 */

import type { CemDeclaration } from '../cem.js';
import type { HelixAaaEvidence } from '../evidence/helix-aaa-evidence.js';
import type { DimScoreResult } from './types.js';

export function scoreFormValidityReporting(
  _decl: CemDeclaration,
  evidence: HelixAaaEvidence,
): DimScoreResult {
  const helixMeta = evidence.helixMeta;
  const checks = evidence.sourceChecks;

  // ── Branch 1: explicit N/A ──────────────────────────────────────────
  if (helixMeta?.formAssociated === false) {
    return {
      score: 100,
      confidence: 'verified',
      measured: true,
      notes: ['form-validity-not-applicable'],
    };
  }

  // ── Branch 2: no source signals at all ──────────────────────────────
  if (!checks) {
    return { score: 0, confidence: 'unknown', measured: false };
  }

  // ── Branch 3: setValidity present ───────────────────────────────────
  if (checks.hasSetValidityCall) {
    return {
      score: 100,
      confidence: 'verified',
      measured: true,
      subMetrics: [{ name: 'set-validity-call', score: 1, maxScore: 1 }],
    };
  }

  // ── Branch 4: form-associated with no validity reporting ────────────
  const formAssociated =
    helixMeta?.formAssociated === true || checks.hasStaticFormAssociated === true;
  if (formAssociated) {
    return {
      score: 0,
      confidence: 'verified',
      measured: true,
      notes: ['form-associated-without-validity-reporting', 'set-validity-not-called'],
      subMetrics: [{ name: 'set-validity-call', score: 0, maxScore: 1 }],
    };
  }

  // ── Branch 5: silent on form association, no signals ────────────────
  return { score: 0, confidence: 'unknown', measured: false };
}
