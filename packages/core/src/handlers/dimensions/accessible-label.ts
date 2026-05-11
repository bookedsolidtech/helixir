/**
 * Accessible Label dimension scorer — Phase 2.
 *
 * Important-tier (weight 2 in the AAA-decomposed Accessibility group).
 *
 * Decision tree:
 *   1. helixMeta.ariaPattern is in the APG catalogue           → 100 / verified
 *   2. CEM has a labelling surface (slot `label`, member
 *      `label` or `accessibleLabel`, attribute `aria-label` /
 *      `aria-labelledby`)                                       → 50 / heuristic
 *   3. otherwise                                                → 0  / unknown
 *
 * The heuristic predicate intentionally re-implements the
 * `hasLabelSupport` test from `handlers/accessibility.ts` (lines
 * ~144-145) — the original is internal-scope and not exported, and
 * accessible-label widens the check to attributes + the
 * `accessibleLabel` member name. Keep both predicates in mind when
 * editing one.
 */

import type { CemDeclaration } from '../cem.js';
import type { HelixAaaEvidence } from '../evidence/helix-aaa-evidence.js';
import { loadApgPatterns } from './apg-patterns-loader.js';
import type { DimScoreResult } from './types.js';

export function scoreAccessibleLabel(
  decl: CemDeclaration,
  evidence: HelixAaaEvidence,
): DimScoreResult {
  // ── Verified path: ARIA pattern recognised ────────────────────────────
  const patternKey = evidence.helixMeta?.ariaPattern;
  if (patternKey) {
    const patterns = loadApgPatterns();
    if (Object.prototype.hasOwnProperty.call(patterns, patternKey)) {
      return {
        score: 100,
        confidence: 'verified',
        measured: true,
        subMetrics: [
          {
            name: 'apg-pattern-recognized',
            score: 1,
            maxScore: 1,
            note: `pattern: ${patternKey}`,
          },
        ],
      };
    }
  }

  // ── Heuristic path: CEM-derived label surfaces ───────────────────────
  if (hasCemLabelSurface(decl)) {
    return {
      score: 50,
      confidence: 'heuristic',
      measured: true,
      notes: ['accessible-label-inferred-from-cem'],
      subMetrics: [
        {
          name: 'cem-label-surface',
          score: 1,
          maxScore: 1,
          note: 'slot/member/attribute label surface detected in CEM',
        },
      ],
    };
  }

  return { score: 0, confidence: 'unknown', measured: false };
}

/**
 * Mirrors `hasLabelSupport` from `handlers/accessibility.ts`, widened
 * to also count `aria-label` / `aria-labelledby` attributes and the
 * conventional `accessibleLabel` member name.
 */
function hasCemLabelSurface(decl: CemDeclaration): boolean {
  const slots = decl.slots ?? [];
  if (slots.some((s) => s.name === 'label')) return true;

  const members = decl.members ?? [];
  if (
    members.some((m) => {
      const n = (m.name ?? '').toLowerCase();
      return (
        n === 'label' || n === 'accessiblelabel' || n === 'aria-label' || n === 'aria-labelledby'
      );
    })
  ) {
    return true;
  }

  const attributes = ((decl as { attributes?: Array<{ name?: unknown }> }).attributes ??
    []) as Array<{
    name?: unknown;
  }>;
  if (
    attributes.some((a) => {
      const n = typeof a.name === 'string' ? a.name.toLowerCase() : '';
      return n === 'aria-label' || n === 'aria-labelledby' || n === 'label';
    })
  ) {
    return true;
  }

  return false;
}
