/**
 * Component Import Checker — scans HTML/JSX/template code for custom element
 * tags and verifies they exist in the loaded CEM.
 *
 * Detects:
 * 1. Non-existent custom element tags
 * 2. Misspelled tag names with fuzzy suggestions
 */

import type { Cem } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UnknownTag {
  tagName: string;
  line: number;
  suggestion: string | null;
}

export interface ImportCheckResult {
  knownTags: string[];
  unknownTags: UnknownTag[];
  totalCustomElements: number;
  clean: boolean;
}

// ─── Levenshtein distance ────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 0; i <= m; i++) {
    const row = dp[i];
    if (row) row[0] = i;
  }
  for (let j = 0; j <= n; j++) {
    const row = dp[0];
    if (row) row[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const prevRow = dp[i - 1];
      const currRow = dp[i];
      if (prevRow && currRow) {
        currRow[j] = Math.min(
          (prevRow[j] ?? 0) + 1,
          (currRow[j - 1] ?? 0) + 1,
          (prevRow[j - 1] ?? 0) + cost,
        );
      }
    }
  }

  const lastRow = dp[m];
  return lastRow ? (lastRow[n] ?? 0) : 0;
}

function findClosestMatch(input: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  let best: string | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshtein(input, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return bestDist <= 3 ? best : null;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkComponentImports(codeText: string, cem: Cem): ImportCheckResult {
  // Build set of known tag names from CEM
  const knownTagNames = new Set<string>();
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName) {
        knownTagNames.add(decl.tagName);
      }
    }
  }

  const knownTagList = Array.from(knownTagNames);
  const lines = codeText.split('\n');

  // Find all custom element tags (contain a hyphen)
  const tagPattern = /<([a-z][a-z0-9]*-[a-z0-9-]*)/gi;
  const foundTags = new Map<string, number>(); // tagName → first line number

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let match: RegExpExecArray | null;
    tagPattern.lastIndex = 0;
    while ((match = tagPattern.exec(line)) !== null) {
      const tag = (match[1] ?? '').toLowerCase();
      if (!foundTags.has(tag)) {
        foundTags.set(tag, i + 1);
      }
    }
  }

  const knownTags: string[] = [];
  const unknownTags: UnknownTag[] = [];

  for (const [tag, line] of foundTags) {
    if (knownTagNames.has(tag)) {
      knownTags.push(tag);
    } else {
      const suggestion = findClosestMatch(tag, knownTagList);
      unknownTags.push({ tagName: tag, line, suggestion });
    }
  }

  return {
    knownTags,
    unknownTags,
    totalCustomElements: foundTags.size,
    clean: unknownTags.length === 0,
  };
}
