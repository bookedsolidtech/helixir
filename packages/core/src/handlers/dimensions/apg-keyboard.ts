/**
 * APG Keyboard Contract dimension scorer — Phase 2.
 *
 * Critical-tier (weight 2 in the AAA-decomposed Accessibility group).
 *
 * Also exports {@link parseKeyboardContract}, the keyboard-contract
 * grammar parser, for reuse by `verify-extension.ts` (extension
 * defect-class 16). The parser accepts both the structured shape
 * helixMeta carries already AND the legacy `@keyboard-contract`
 * JSDoc tag the upgrade plan calls out (e.g.
 * `@keyboard-contract activate: Enter,Space; dismiss: Escape`).
 *
 * Scoring decision tree:
 *   1. contract resolved AND APG pattern resolved AND every expected
 *      key covered                                  → 100 / verified
 *   2. contract resolved AND APG pattern resolved BUT missing keys
 *      → 70 - (missingCount * 10) / heuristic
 *   3. contract resolved WITHOUT an APG pattern    → 50 / heuristic
 *   4. CEM has keydown/keyup/keypress events       → 25 / heuristic
 *   5. otherwise                                    → 0 / unknown
 */

import type { CemDeclaration } from '../cem.js';
import type { HelixAaaEvidence, KeyboardContract } from '../evidence/helix-aaa-evidence.js';
import { loadApgPatterns, isPassiveApgPattern, type ApgPattern } from './apg-patterns-loader.js';
import { parseKeyboardContract as parseFromShared } from './keyboard-contract-parser.js';
import type { DimScoreResult } from './types.js';

// Re-export the canonical parser from the shared module. verify-extension.ts
// and the detector both import from there too, so all three callers use
// the same grammar (codex push-gate P3 round 12, 2026-05-11).
export const parseKeyboardContract = parseFromShared;

// ───────────────────────────────────────────────────────────────────────
// Scorer
// ───────────────────────────────────────────────────────────────────────

export function scoreApgKeyboard(decl: CemDeclaration, evidence: HelixAaaEvidence): DimScoreResult {
  // helixMeta is preferred when both are present.
  const contract: KeyboardContract | null =
    evidence.helixMeta?.keyboardContract ?? parseKeyboardContract(decl.description);

  const patternKey = evidence.helixMeta?.ariaPattern;
  const patternBook = loadApgPatterns();
  const pattern: ApgPattern | undefined =
    patternKey && Object.prototype.hasOwnProperty.call(patternBook, patternKey)
      ? patternBook[patternKey]
      : undefined;

  // Passive APG patterns (tabpanel, group, etc.) carry no required
  // keys — their keyboard contract belongs to a parent (tablist, form,
  // etc.). A component with a recognized passive pattern is satisfied
  // by definition; flagging it as missing-contract would gaslight every
  // correct tabpanel/group component (codex push-gate P2, 2026-05-10).
  if (patternKey && pattern && isPassiveApgPattern(patternKey, patternBook)) {
    return {
      score: 100,
      confidence: 'verified',
      measured: true,
      notes: [`apg-passive-pattern:${patternKey}`],
    };
  }

  if (contract && pattern) {
    const expected = collectExpectedKeys(pattern);
    const covered = collectContractKeys(contract);
    const missing = expected.filter((k) => !covered.has(k));
    if (missing.length === 0) {
      return {
        score: 100,
        confidence: 'verified',
        measured: true,
        subMetrics: [
          {
            name: 'apg-keys-covered',
            score: expected.length,
            maxScore: expected.length,
          },
        ],
      };
    }
    const score = Math.max(0, 70 - missing.length * 10);
    return {
      score,
      confidence: 'heuristic',
      measured: true,
      notes: [`apg-keyboard-missing-keys: ${missing.join(', ')}`],
      subMetrics: [
        {
          name: 'apg-keys-covered',
          score: expected.length - missing.length,
          maxScore: expected.length,
          note: `missing ${missing.length} key(s)`,
        },
      ],
    };
  }

  if (contract && !pattern) {
    return {
      score: 50,
      confidence: 'heuristic',
      measured: true,
      notes: ['keyboard-contract-present-without-apg-pattern'],
    };
  }

  // CEM event-based fallback.
  const events = decl.events ?? [];
  const hasKeyboardEvent = events.some((e) => {
    const n = (e.name ?? '').toLowerCase();
    return n.includes('keydown') || n.includes('keyup') || n.includes('keypress');
  });
  if (hasKeyboardEvent) {
    return {
      score: 25,
      confidence: 'heuristic',
      measured: true,
      notes: ['cem-keyboard-events-only-no-contract'],
    };
  }

  return { score: 0, confidence: 'unknown', measured: false };
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function collectExpectedKeys(pattern: ApgPattern): string[] {
  const all: string[] = [];
  if (Array.isArray(pattern.activate)) all.push(...pattern.activate);
  if (Array.isArray(pattern.navigate)) all.push(...pattern.navigate);
  if (Array.isArray(pattern.dismiss)) all.push(...pattern.dismiss);
  return all;
}

function collectContractKeys(contract: KeyboardContract): Set<string> {
  const out = new Set<string>();
  for (const k of contract.activate ?? []) out.add(k);
  for (const k of contract.navigate ?? []) out.add(k);
  for (const k of contract.dismiss ?? []) out.add(k);
  return out;
}
