/**
 * Single source of truth for the `@keyboard-contract` JSDoc grammar.
 *
 * Imported by:
 *   - apg-keyboard.ts (scoring)
 *   - helix-aaa-evidence.ts (detector — surfaces the parsed contract on
 *     HelixAaaEvidence so every consumer of detect_helix_evidence /
 *     analyze_accessibility sees the same data the scorer used)
 *
 * Grammar (case-insensitive on key buckets, case-sensitive on key names
 * so they match KeyboardEvent.key):
 *
 *   activate: Enter, Space
 *   navigate: ArrowDown, ArrowUp; dismiss: Escape
 *   disabledSuppresses: true
 *
 * Separators between bucket clauses: `;` `\n` or `|`.
 * Separators between keys within a bucket: `,` or whitespace.
 *
 * The tag prefix (`@keyboard-contract`) is located anywhere in the
 * input — multi-line JSDoc descriptions with a summary paragraph
 * before the tag are supported.
 */

import type { KeyboardContract } from '../evidence/helix-aaa-evidence.js';

export function parseKeyboardContract(input: string | undefined | null): KeyboardContract | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const tagMatch = /@?keyboard[-_ ]?contract\s*[:=-]?\s*/i.exec(trimmed);
  const stripped = tagMatch ? trimmed.slice((tagMatch.index ?? 0) + tagMatch[0].length) : trimmed;

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
        // unknown bucket — ignore but don't fail
        break;
    }
  }

  return anyParsed ? result : null;
}
