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
  _decl: CemDeclaration,
  evidence: HelixAaaEvidence,
): DimScoreResult {
  const helixMeta = evidence.helixMeta;
  const checks = evidence.sourceChecks;

  // ── N/A path: helixMeta says explicitly "not form-associated" ──────────
  if (helixMeta?.formAssociated === false) {
    // If sourceChecks also confirm the absence, this is the strongest
    // N/A signal we can produce.
    if (checks && !checks.hasStaticFormAssociated) {
      return {
        score: 100,
        confidence: 'verified',
        measured: true,
        notes: ['not-form-associated-correctly-declared'],
      };
    }
    if (!checks) {
      return {
        score: 100,
        confidence: 'verified',
        measured: true,
        notes: ['not-form-associated'],
      };
    }
    // Claim says not-form-associated but source has the static flag —
    // claim/source drift. Score heuristic and surface it.
    return {
      score: 50,
      confidence: 'heuristic',
      measured: true,
      notes: ['form-association-claim-source-mismatch'],
    };
  }

  // ── Affirmative path ─────────────────────────────────────────────────
  const claimedTrue = helixMeta?.formAssociated === true;
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
  // If helixMeta exists at all but is silent on form-association, AND
  // sourceChecks are defined and all false, we have a measured "no form
  // association" answer.
  if (helixMeta !== undefined && checks && !checks.hasStaticFormAssociated) {
    return {
      score: 100,
      confidence: 'heuristic',
      measured: true,
      notes: ['form-association-not-applicable-by-omission'],
    };
  }

  return { score: 0, confidence: 'unknown', measured: false };
}
