/**
 * AAA Audit Self-Certification dimension scorer — Phase 2.
 *
 * Advanced-tier, weight 0 — INFORMATIONAL ONLY. This dimension does
 * not contribute to the weighted health score. It surfaces whether a
 * component carries the helix-canonical `AAA-AUDIT.md` sidecar and
 * whether it is fresh relative to the component's source file.
 *
 * Decision tree:
 *   1. auditMdPath present AND auditMdFresh === true AND
 *      verdictSnapshot.certified === true                          → 100 / verified
 *   2. auditMdPath present AND auditMdFresh === false              → 50  / verified
 *   3. auditMdPath absent AND verdictSnapshot.certified === true   → 50  / heuristic
 *   4. otherwise                                                    → 0   / untested
 *
 * `untested` here (not `unknown`) is deliberate: for non-helix libraries
 * the audit-md sidecar is simply not part of the contract — there is
 * nothing to measure rather than a measurement that failed. The
 * dimension's zero weight means this never penalises grade.
 */

import type { CemDeclaration } from '../cem.js';
import type { HelixAaaEvidence } from '../evidence/helix-aaa-evidence.js';
import type { DimScoreResult } from './types.js';

export function scoreAaaAuditSelfCertification(
  _decl: CemDeclaration,
  evidence: HelixAaaEvidence,
): DimScoreResult {
  const hasAudit = typeof evidence.auditMdPath === 'string' && evidence.auditMdPath.length > 0;
  const fresh = evidence.auditMdFresh === true;
  // Cert claim flows from either the verdict snapshot (preferred — derived
  // post-audit) OR helixMeta.aaa.certified (CEM-declared). The sibling
  // detectors and wcag-conformance scorer both accept either; this one
  // matched only verdictSnapshot, which made the scorer disagree with
  // the rest of the pipeline for CEM-only helix consumers that hadn't
  // generated aaa-verdicts.json yet (codex push-gate P2, 2026-05-10).
  const certified =
    evidence.verdictSnapshot?.certified === true || evidence.helixMeta?.aaa?.certified === true;

  if (hasAudit && fresh && certified) {
    return {
      score: 100,
      confidence: 'verified',
      measured: true,
      notes: ['aaa-cert-fresh-and-supported'],
    };
  }

  if (hasAudit && !fresh) {
    return {
      score: 50,
      confidence: 'verified',
      measured: true,
      notes: ['aaa-audit-md-stale'],
    };
  }

  if (!hasAudit && certified) {
    return {
      score: 50,
      confidence: 'heuristic',
      measured: true,
      notes: ['cert-claimed-without-audit-md-sidecar'],
    };
  }

  // Audit md present + fresh + no cert claim → still surfaces an info
  // note, but score remains advisory.
  if (hasAudit && fresh && !certified) {
    return {
      score: 50,
      confidence: 'heuristic',
      measured: true,
      notes: ['audit-md-present-but-no-cert-claim'],
    };
  }

  return { score: 0, confidence: 'untested', measured: false };
}
