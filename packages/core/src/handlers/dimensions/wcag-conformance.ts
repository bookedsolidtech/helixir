/**
 * WCAG Conformance dimension scorer — Phase 2.
 *
 * Critical-tier (weight 4 in the AAA-decomposed Accessibility group).
 *
 * Scoring decision tree (from the upgrade plan §2.2 +
 * orchestrator reality-check on aaa-verdicts.json shape):
 *
 *   1. verdictSnapshot.certified === true AND criteria.length ≥ 9
 *        → 100 / verified
 *   2. helixMeta.aaa.certified === true AND helixMeta.aaa.criteria.length ≥ 9
 *      (no verdictSnapshot but meta-claimed cert)
 *        → 95 / verified
 *   3. helixMeta.aaa partially present (criteria array exists)
 *        → round((criteria.length / 9) * 70) / heuristic
 *   4. CEM has aria-* attrs/members (presence-only fallback)
 *        → 30 / heuristic
 *   5. otherwise
 *        → 0 / unknown / measured:false
 *
 * Cert-claim overclaim detection (defect class 15):
 *   When the snapshot claims `certified: true` AND `sourceChecks` are
 *   available but contradict a claimed SC, cap the score at 70 with a
 *   `cert-claim-evidence-mismatch` note. The two source-evidence
 *   contradictions we can detect today:
 *     - SC 2.4.13 (Focus Appearance) claimed but no 2px focus-ring CSS
 *     - SC 1.4.6 / 1.4.11 claimed but forcedColorsSupported mismatch
 *
 * Phase-1 contract: this scorer NEVER reads disk. It only consumes the
 * pre-computed {@link HelixAaaEvidence}; if `sourceChecks` is
 * `undefined`, the overclaim detector is silent (we cannot tell).
 */

import type { CemDeclaration } from '../cem.js';
import type { HelixAaaEvidence } from '../evidence/helix-aaa-evidence.js';
import type { DimScoreResult } from './types.js';

const CERT_CRITERIA_THRESHOLD = 9;
const OVERCLAIM_CAP_SCORE = 70;

// SC codes that map onto source-check signals.
const SC_FOCUS_APPEARANCE = '2.4.13'; // requires 2px outline contract
const SC_NON_TEXT_CONTRAST = '1.4.11'; // forced-colors contract
const SC_CONTRAST_ENHANCED = '1.4.6'; // forced-colors contract (AAA)

export function scoreWcagConformance(
  decl: CemDeclaration,
  evidence: HelixAaaEvidence,
): DimScoreResult {
  const notes: string[] = [];

  // ── Branch 1: certified per verdict snapshot ───────────────────────────
  const snapshot = evidence.verdictSnapshot;
  if (
    snapshot?.certified === true &&
    Array.isArray(snapshot.criteria) &&
    snapshot.criteria.length >= CERT_CRITERIA_THRESHOLD
  ) {
    const overclaim = detectOverclaim(snapshot.criteria, evidence);
    if (overclaim.length > 0) {
      notes.push('cert-claim-evidence-mismatch', ...overclaim);
      return {
        score: OVERCLAIM_CAP_SCORE,
        confidence: 'heuristic',
        measured: true,
        notes,
        subMetrics: [
          {
            name: 'criteria-supported',
            score: snapshot.criteria.length,
            maxScore: CERT_CRITERIA_THRESHOLD,
            note: 'cert claim contradicted by source evidence',
          },
        ],
      };
    }
    return {
      score: 100,
      confidence: 'verified',
      measured: true,
      subMetrics: [
        {
          name: 'criteria-supported',
          score: snapshot.criteria.length,
          maxScore: CERT_CRITERIA_THRESHOLD,
        },
      ],
    };
  }

  // ── Branch 2: helixMeta.aaa cert claim (no snapshot) ──────────────────
  const aaa = evidence.helixMeta?.aaa;
  if (
    aaa?.certified === true &&
    Array.isArray(aaa.criteria) &&
    aaa.criteria.length >= CERT_CRITERIA_THRESHOLD
  ) {
    const overclaim = detectOverclaim(aaa.criteria, evidence);
    if (overclaim.length > 0) {
      notes.push('cert-claim-evidence-mismatch', ...overclaim);
      return {
        score: OVERCLAIM_CAP_SCORE,
        confidence: 'heuristic',
        measured: true,
        notes,
      };
    }
    return { score: 95, confidence: 'verified', measured: true };
  }

  // ── Branch 3: partial aaa criteria array ──────────────────────────────
  if (aaa && Array.isArray(aaa.criteria)) {
    const score = Math.round((aaa.criteria.length / CERT_CRITERIA_THRESHOLD) * 70);
    // Overclaim detection still applies here — claim is partial but the
    // criteria array MAY contain SCs the source contradicts.
    const overclaim = detectOverclaim(aaa.criteria, evidence);
    if (overclaim.length > 0) {
      notes.push('cert-claim-evidence-mismatch', ...overclaim);
    }
    return {
      score: Math.max(0, Math.min(70, score)),
      confidence: 'heuristic',
      measured: true,
      notes: notes.length > 0 ? notes : undefined,
      subMetrics: [
        {
          name: 'criteria-supported',
          score: aaa.criteria.length,
          maxScore: CERT_CRITERIA_THRESHOLD,
        },
      ],
    };
  }

  // ── Branch 4: aria-* presence heuristic from CEM ──────────────────────
  const members = decl.members ?? [];
  const attributes = ((decl as { attributes?: Array<{ name?: unknown }> }).attributes ??
    []) as Array<{
    name?: unknown;
  }>;
  const hasAriaSignal =
    members.some((m) => typeof m.name === 'string' && m.name.toLowerCase().startsWith('aria-')) ||
    attributes.some((a) => typeof a.name === 'string' && a.name.toLowerCase().startsWith('aria-'));

  if (hasAriaSignal) {
    return {
      score: 30,
      confidence: 'heuristic',
      measured: true,
      notes: ['no-helix-meta-aaa-fallback-to-cem-heuristic'],
    };
  }

  // ── Branch 5: nothing to score ────────────────────────────────────────
  return { score: 0, confidence: 'unknown', measured: false };
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

/**
 * Returns a list of overclaim notes when claimed SCs contradict the
 * source-derived evidence. Returns an empty array when sourceChecks is
 * undefined (we cannot judge) or no contradictions are found.
 */
function detectOverclaim(criteria: string[], evidence: HelixAaaEvidence): string[] {
  const sourceChecks = evidence.sourceChecks;
  if (!sourceChecks) return [];

  const notes: string[] = [];

  // SC 2.4.13 Focus Appearance — requires the 2px contract from helix
  // commit e54e069ff. `hasFocusVisibleRule === false` AND the SC is
  // claimed is the canonical class-15 defect.
  if (criteria.includes(SC_FOCUS_APPEARANCE)) {
    if (!sourceChecks.hasFocusVisibleRule || !sourceChecks.has2pxOutlineRule) {
      notes.push(`sc-${SC_FOCUS_APPEARANCE}-claim-without-2px-focus-ring`);
    }
  }

  // SC 1.4.11 / 1.4.6 — forced-colors. The claim mismatches the
  // source when helixMeta claims forced-colors AND the @media block
  // is absent (or vice versa: claim absent but block present, which
  // we treat as evidence-vs-claim drift, not overclaim — silent).
  const forcedClaimed =
    evidence.helixMeta?.forcedColorsSupported === true ||
    criteria.includes(SC_NON_TEXT_CONTRAST) ||
    criteria.includes(SC_CONTRAST_ENHANCED);
  if (forcedClaimed && sourceChecks.hasForcedColorsBlock === false) {
    if (criteria.includes(SC_NON_TEXT_CONTRAST) || criteria.includes(SC_CONTRAST_ENHANCED)) {
      const sc = criteria.includes(SC_CONTRAST_ENHANCED)
        ? SC_CONTRAST_ENHANCED
        : SC_NON_TEXT_CONTRAST;
      notes.push(`sc-${sc}-claim-without-forced-colors-block`);
    }
  }

  return notes;
}
