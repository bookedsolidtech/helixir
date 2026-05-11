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
  decl: CemDeclaration,
  evidence: HelixAaaEvidence,
): DimScoreResult {
  const helixMeta = evidence.helixMeta;
  const checks = evidence.sourceChecks;
  // Read both helixMeta.formAssociated AND the top-level CEM
  // `formAssociated` field — same plumbing as scoreFormAssociation
  // (codex push-gate P1 round 5, 2026-05-10).
  const cemFormAssociated = (decl as { formAssociated?: boolean }).formAssociated;
  // CEM wins over helixMeta when they disagree — same precedence as
  // scoreFormAssociation (codex push-gate P1 round 12, 2026-05-11).
  const effectiveFormAssociated =
    cemFormAssociated !== undefined ? cemFormAssociated : helixMeta?.formAssociated;
  const claimedFalse = effectiveFormAssociated === false;
  const claimedTrue = effectiveFormAssociated === true;

  // ── Branch 1: explicit N/A ──────────────────────────────────────────
  // Confirm the claim against source signals when available — symmetric
  // to scoreFormAssociation's N/A path. A stale CEM/helixMeta that
  // declares formAssociated:false while the implementation still calls
  // attachInternals()/setValidity() should NOT score 100/verified
  // (codex push-gate P2 round 7, 2026-05-10).
  if (claimedFalse) {
    if (checks) {
      const anyFaceSignal =
        checks.hasStaticFormAssociated || checks.hasAttachInternals || checks.hasSetValidityCall;
      if (anyFaceSignal) {
        const driftNotes: string[] = ['form-validity-claim-source-mismatch'];
        if (checks.hasSetValidityCall) driftNotes.push('setValidity-still-called');
        if (checks.hasAttachInternals) driftNotes.push('attachInternals-still-called');
        if (checks.hasStaticFormAssociated) driftNotes.push('static-formAssociated-still-present');
        return {
          score: 50,
          confidence: 'heuristic',
          measured: true,
          notes: driftNotes,
        };
      }
    }
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
  const formAssociated = claimedTrue || checks.hasStaticFormAssociated === true;
  if (formAssociated) {
    return {
      score: 0,
      confidence: 'verified',
      measured: true,
      notes: ['form-associated-without-validity-reporting', 'set-validity-not-called'],
      subMetrics: [{ name: 'set-validity-call', score: 0, maxScore: 1 }],
    };
  }

  // ── Branch 5: source confirms no FACE signals AND helixMeta is present
  // → N/A. Requiring helixMeta as the second condition prevents declaring
  // N/A on components whose form-association is genuinely unknown (no
  // claim, no local signals — could be an inherited FACE subclass whose
  // FACE contract lives on the parent's source file the detector doesn't
  // walk). Form Validity Reporting can only be N/A when Form Association
  // itself is known to be N/A (codex push-gate P2 round-2, 2026-05-11).
  const noFaceSignals =
    !checks.hasStaticFormAssociated && !checks.hasAttachInternals && !checks.hasSetValidityCall;
  if (noFaceSignals && helixMeta !== undefined) {
    return {
      score: 100,
      confidence: 'verified',
      measured: true,
      notes: ['form-validity-not-applicable'],
    };
  }

  // ── Branch 6: source signals present without a claim — defer to
  // form-association for the drift report; here we just say unknown.
  return { score: 0, confidence: 'unknown', measured: false };
}
