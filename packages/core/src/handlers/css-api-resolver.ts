/**
 * CSS API Resolver — resolves every ::part(), CSS custom property, and slot
 * reference in agent-generated code against the actual component CEM data.
 *
 * Returns a structured report showing:
 * - Which references are valid vs invalid
 * - Closest valid alternatives for typos/hallucinations
 * - The component's full style API surface
 *
 * This is the anti-hallucination tool: agents call it to verify that every
 * CSS reference actually exists on the target component before shipping code.
 */

import type { ComponentMetadata } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedReference {
  name: string;
  valid: boolean;
  description?: string;
  suggestion?: string;
}

export interface ResolvedSection {
  resolved: ResolvedReference[];
  available: string[];
}

export interface ComponentApiSummary {
  tagName: string;
  partCount: number;
  tokenCount: number;
  slotCount: number;
  hasStyleApi: boolean;
}

export interface CssApiResolution {
  valid: boolean;
  invalidCount: number;
  parts: ResolvedSection;
  tokens: ResolvedSection;
  slots: ResolvedSection;
  componentApi: ComponentApiSummary;
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

function findClosest(name: string, candidates: string[], maxDistance = 3): string | undefined {
  let best: string | undefined;
  let bestDist = maxDistance + 1;
  for (const c of candidates) {
    const d = levenshtein(name, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

// ─── Extractors ──────────────────────────────────────────────────────────────

function extractPartNames(css: string): string[] {
  const seen = new Set<string>();
  const re = /::part\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    const name = match[1];
    if (name) seen.add(name.trim());
  }
  return [...seen];
}

function extractComponentTokenDeclarations(css: string): string[] {
  // Match CSS custom property declarations (--name: value) that are
  // set ON the component host selector, not var() references to global tokens
  const seen = new Set<string>();
  const re = /\s(--[\w-]+)\s*:/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    const name = match[1];
    if (name) seen.add(name);
  }
  return [...seen];
}

function extractSlotNames(html: string): string[] {
  const seen = new Set<string>();
  const re = /\bslot\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const name = match[1];
    if (name) seen.add(name);
  }
  return [...seen];
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function resolveCssApi(
  css: string,
  meta: ComponentMetadata,
  html?: string,
): CssApiResolution {
  const availableParts = meta.cssParts.map((p) => p.name);
  const availableTokens = meta.cssProperties.map((p) => p.name);
  const availableSlots = meta.slots.map((s) => s.name);

  // Resolve parts
  const usedParts = extractPartNames(css);
  const resolvedParts: ResolvedReference[] = usedParts.map((name) => {
    const part = meta.cssParts.find((p) => p.name === name);
    if (part) {
      return { name, valid: true, description: part.description };
    }
    const suggestion = findClosest(name, availableParts);
    return { name, valid: false, ...(suggestion ? { suggestion } : {}) };
  });

  // Resolve tokens — only validate component-scoped custom properties
  const usedTokens = extractComponentTokenDeclarations(css);
  const resolvedTokens: ResolvedReference[] = usedTokens.map((name) => {
    const token = meta.cssProperties.find((p) => p.name === name);
    if (token) {
      return { name, valid: true, description: token.description };
    }
    const suggestion = findClosest(name, availableTokens);
    return { name, valid: false, ...(suggestion ? { suggestion } : {}) };
  });

  // Resolve slots (from HTML if provided)
  const usedSlots = html ? extractSlotNames(html) : [];
  const resolvedSlots: ResolvedReference[] = usedSlots.map((name) => {
    const slot = meta.slots.find((s) => s.name === name);
    if (slot) {
      return { name, valid: true, description: slot.description };
    }
    const suggestion = findClosest(name, availableSlots);
    return { name, valid: false, ...(suggestion ? { suggestion } : {}) };
  });

  const invalidCount =
    resolvedParts.filter((r) => !r.valid).length +
    resolvedTokens.filter((r) => !r.valid).length +
    resolvedSlots.filter((r) => !r.valid).length;

  return {
    valid: invalidCount === 0,
    invalidCount,
    parts: { resolved: resolvedParts, available: availableParts },
    tokens: { resolved: resolvedTokens, available: availableTokens },
    slots: { resolved: resolvedSlots, available: availableSlots },
    componentApi: {
      tagName: meta.tagName,
      partCount: meta.cssParts.length,
      tokenCount: meta.cssProperties.length,
      slotCount: meta.slots.length,
      hasStyleApi:
        meta.cssParts.length > 0 || meta.cssProperties.length > 0 || meta.slots.length > 0,
    },
  };
}
