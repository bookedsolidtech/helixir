/**
 * Form Association dimension scorer — Phase 2.
 *
 * Important-tier (weight 1 in the AAA-decomposed Accessibility group).
 *
 * The CE-form-association contract has three measurable source
 * signals (encoded in helix-aaa-evidence's regex set):
 *   - static formAssociated = true
 *   - this.attachInternals()
 *   - this._internals.setValidity(...)
 *
 * Decision tree:
 *   - helixMeta.formAssociated === false AND sourceChecks confirm     → 100 / verified (N/A)
 *   - helixMeta.formAssociated === false (no sourceChecks)            → 100 / verified (N/A claim)
 *   - claim form-associated (via helixMeta or static-flag in source):
 *       count present signals out of 3, score = (n/3)*100
 *       confidence = verified when all 3; heuristic otherwise
 *   - no signals at all AND helixMeta entirely absent                 → 0 / unknown / measured:false
 */

import type { CemDeclaration } from '../cem.js';
import type { HelixAaaEvidence } from '../evidence/helix-aaa-evidence.js';
import type { DimScoreResult, DimSubMetric } from './types.js';

export function scoreFormAssociation(
  decl: CemDeclaration,
  evidence: HelixAaaEvidence,
): DimScoreResult {
  const helixMeta = evidence.helixMeta;
  const checks = evidence.sourceChecks;
  // Standard CEM carries `formAssociated: boolean` at the declaration
  // level (cem.ts:91-95). Read it as a co-equal signal alongside helixMeta
  // so libraries that emit CEM without a helixMeta block still surface
  // their form-association intent (codex push-gate P1 round 5, 2026-05-10).
  const cemFormAssociated = (decl as { formAssociated?: boolean }).formAssociated;
  const claimedFalse = helixMeta?.formAssociated === false || cemFormAssociated === false;
  const claimedTrueClaim = helixMeta?.formAssociated === true || cemFormAssociated === true;

  // ── N/A path: declaration says explicitly "not form-associated" ─────────
  if (claimedFalse) {
    // Confirm the absence across ALL three FACE signals — static flag,
    // attachInternals(), setValidity(). A partial removal (subclass
    // drops `static formAssociated` but keeps attachInternals + setValidity)
    // would otherwise score 100/verified while still behaving as a form
    // control (codex push-gate P2 round 3, 2026-05-10).
    if (checks) {
      const anyFaceSignal =
        checks.hasStaticFormAssociated || checks.hasAttachInternals || checks.hasSetValidityCall;
      if (!anyFaceSignal) {
        return {
          score: 100,
          confidence: 'verified',
          measured: true,
          notes: ['not-form-associated-correctly-declared'],
        };
      }
      // Claim says not-form-associated but source has FACE signals —
      // claim/source drift. Surface every signal that contradicts.
      const driftNotes: string[] = ['form-association-claim-source-mismatch'];
      if (checks.hasStaticFormAssociated) driftNotes.push('static-formAssociated-still-present');
      if (checks.hasAttachInternals) driftNotes.push('attachInternals-still-called');
      if (checks.hasSetValidityCall) driftNotes.push('setValidity-still-called');
      return {
        score: 50,
        confidence: 'heuristic',
        measured: true,
        notes: driftNotes,
      };
    }
    return {
      score: 100,
      confidence: 'verified',
      measured: true,
      notes: ['not-form-associated'],
    };
  }

  // ── Affirmative path ─────────────────────────────────────────────────
  const claimedTrue = claimedTrueClaim;
  const sourceFlag = checks?.hasStaticFormAssociated === true;

  if (claimedTrue || sourceFlag) {
    if (!checks) {
      // Claim with no source-check evidence — heuristic at best.
      return {
        score: 33,
        confidence: 'heuristic',
        measured: true,
        notes: ['form-associated-claim-without-source-evidence'],
      };
    }

    // Weighted signals. The plan's `(present/3)*100` formula scores
    // static-flag-only at 33, but real helix audits weight the runtime
    // contract (attachInternals + setValidity) far more heavily than
    // the static declaration — the static flag is essentially free once
    // a base class declares it. DEVIATION from plan §2.2: weights 1/2/2
    // (sum 5) so static-only → 20, attach+validity → 80, all-3 → 100.
    // This is what defect class 18 (`hx-form-half`) measures.
    const signals = [
      { name: 'static-form-associated', present: checks.hasStaticFormAssociated, weight: 1 },
      { name: 'attach-internals', present: checks.hasAttachInternals, weight: 2 },
      { name: 'set-validity-call', present: checks.hasSetValidityCall, weight: 2 },
    ];
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    const presentWeight = signals.filter((s) => s.present).reduce((sum, s) => sum + s.weight, 0);
    const score = Math.round((presentWeight / totalWeight) * 100);
    const present = signals.filter((s) => s.present).length;

    const notes: string[] = [];
    if (!checks.hasAttachInternals) notes.push('attach-internals-missing');
    if (!checks.hasSetValidityCall) notes.push('set-validity-not-called');
    if (!checks.hasStaticFormAssociated && claimedTrue) {
      notes.push('static-form-associated-not-found-in-source');
    }

    const subMetrics: DimSubMetric[] = signals.map((s) => ({
      name: s.name,
      score: s.present ? 1 : 0,
      maxScore: 1,
    }));

    return {
      score,
      confidence: present === signals.length ? 'verified' : 'heuristic',
      measured: true,
      notes: notes.length > 0 ? notes : undefined,
      subMetrics,
    };
  }

  // ── Nothing claimed, nothing detected ────────────────────────────────
  // If helixMeta exists but is silent on form-association, AND sourceChecks
  // confirm ALL three FACE signals are absent (no static flag, no
  // attachInternals, no setValidity), we have a measured "no form
  // association" answer. Checking only the static flag would hide partial
  // FACE implementations that omit the declaration but still wire up the
  // runtime contract (codex push-gate P2 round 6, 2026-05-10).
  if (helixMeta !== undefined && checks) {
    const anyFaceSignal =
      checks.hasStaticFormAssociated || checks.hasAttachInternals || checks.hasSetValidityCall;
    if (!anyFaceSignal) {
      return {
        score: 100,
        confidence: 'heuristic',
        measured: true,
        notes: ['form-association-not-applicable-by-omission'],
      };
    }
    // helixMeta silent but FACE signals present — partial implementation.
    const driftNotes: string[] = ['face-signals-without-claim'];
    if (checks.hasStaticFormAssociated) driftNotes.push('static-formAssociated-without-claim');
    if (checks.hasAttachInternals) driftNotes.push('attachInternals-without-claim');
    if (checks.hasSetValidityCall) driftNotes.push('setValidity-without-claim');
    return {
      score: 50,
      confidence: 'heuristic',
      measured: true,
      notes: driftNotes,
    };
  }

  return { score: 0, confidence: 'unknown', measured: false };
}
