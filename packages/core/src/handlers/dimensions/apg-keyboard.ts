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
import { loadApgPatterns, type ApgPattern } from './apg-patterns-loader.js';
import type { DimScoreResult } from './types.js';

// ───────────────────────────────────────────────────────────────────────
// parseKeyboardContract — also exported for verify-extension.ts.
// ───────────────────────────────────────────────────────────────────────

/**
 * Parse a `@keyboard-contract` JSDoc string into the structured
 * {@link KeyboardContract} shape. Returns `null` when the input is
 * empty / unparseable.
 *
 * Accepted grammar (case-insensitive on key buckets, case-sensitive
 * on key names so they match KeyboardEvent.key):
 *
 *   activate: Enter, Space
 *   navigate: ArrowDown, ArrowUp; dismiss: Escape
 *   disabledSuppresses: true
 *
 * Separators between bucket clauses: `;` `\n` or `|`.
 * Separators between keys within a bucket: `,` or whitespace.
 */
export function parseKeyboardContract(input: string | undefined | null): KeyboardContract | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  // Allow callers to pass the raw JSDoc line including `@keyboard-contract`.
  const stripped = trimmed.replace(/^@?keyboard[-_ ]?contract\s*[:=-]?\s*/i, '');

  const buckets = stripped
    .split(/[;\n|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (buckets.length === 0) return null;

  const result: KeyboardContract = { disabledSuppresses: false };
  let anyParsed = false;

  for (const clause of buckets) {
    const m = /^([a-z][a-zA-Z]*)\s*[:=]\s*(.+)$/.exec(clause);
    if (!m) continue;
    const bucketName = (m[1] ?? '').toLowerCase();
    const rhs = (m[2] ?? '').trim();
    if (!bucketName || rhs.length === 0) continue;

    if (bucketName === 'disabledsuppresses') {
      result.disabledSuppresses = /^(true|yes|on|1)$/i.test(rhs);
      anyParsed = true;
      continue;
    }

    const keys = rhs
      .split(/[,\s]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    if (keys.length === 0) continue;

    switch (bucketName) {
      case 'activate':
        result.activate = keys;
        anyParsed = true;
        break;
      case 'navigate':
        result.navigate = keys;
        anyParsed = true;
        break;
      case 'dismiss':
        result.dismiss = keys;
        anyParsed = true;
        break;
      default:
        // unknown bucket — ignore, but don't fail
        break;
    }
  }

  return anyParsed ? result : null;
}

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
