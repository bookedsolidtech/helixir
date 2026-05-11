/**
 * Lazy loader for the APG-pattern catalogue at
 * `packages/core/src/handlers/evidence/apg-patterns.json`.
 *
 * Several scorers (apg-keyboard, accessible-label) need the same JSON.
 * Loading once via a module-scoped cache keeps the dim scorers cheap
 * and matches the pattern used by the Phase-1 detector for its own
 * caches.
 *
 * The JSON shape (per pattern) is:
 *   { activate?: string[]; navigate?: string[]; dismiss?: string[]; url: string }
 *
 * We deliberately do NOT bind to the strict {@link KeyboardContract}
 * shape — `apg-patterns.json` carries no `disabledSuppresses`, and
 * adding a synthetic value would invite drift.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ApgPattern {
  activate?: string[];
  navigate?: string[];
  dismiss?: string[];
  url?: string;
}

export type ApgPatterns = Record<string, ApgPattern>;

let cached: ApgPatterns | null = null;

function patternsPath(): string {
  // NodeNext + ESM: derive the on-disk location of this module to
  // resolve a sibling JSON in `../evidence/`. tsc preserves the
  // emitted .js, so this path is stable in both ts-node tests and the
  // built output.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', 'evidence', 'apg-patterns.json');
}

export function loadApgPatterns(): ApgPatterns {
  if (cached !== null) return cached;
  try {
    const raw = readFileSync(patternsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      cached = parsed as ApgPatterns;
    } else {
      cached = {};
    }
  } catch {
    cached = {};
  }
  return cached;
}

/** Test hook — drop the loader cache. */
export function _resetApgPatternsCache(): void {
  cached = null;
}
