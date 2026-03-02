import { join } from 'node:path';
import { z } from 'zod';
import type { McpWcConfig } from '../config.js';
import { CemSchema, listAllComponents } from './cem.js';
import type { Cem } from './cem.js';
import { SafeFileOperations } from '../shared/file-ops.js';

// --- Input schema ---

export const CompareLibrariesArgsSchema = z.object({
  cemPathA: z
    .string()
    .refine((p) => !p.includes('..'), { message: 'Path traversal (..) is not allowed' })
    .refine((p) => !p.startsWith('/'), { message: 'Absolute paths are not allowed' }),
  cemPathB: z
    .string()
    .refine((p) => !p.includes('..'), { message: 'Path traversal (..) is not allowed' })
    .refine((p) => !p.startsWith('/'), { message: 'Absolute paths are not allowed' }),
  labelA: z.string().optional(),
  labelB: z.string().optional(),
});

export type CompareLibrariesArgs = z.infer<typeof CompareLibrariesArgsSchema>;

// --- Output types ---

export interface DocQualityStats {
  avgCssProperties: number;
  avgEvents: number;
  avgSlots: number;
  avgCssParts: number;
}

export interface LibraryComparisonResult {
  labelA: string;
  labelB: string;
  countA: number;
  countB: number;
  onlyInA: string[];
  onlyInB: string[];
  inBoth: Array<{ tagNameA: string; tagNameB: string; baseName: string }>;
  featureMatrix: Array<{ component: string; inA: boolean; inB: boolean }>;
  docQualityA: DocQualityStats;
  docQualityB: DocQualityStats;
  verdict: string;
}

// --- Private helpers ---

/**
 * Extracts the "base name" from a tag name by stripping the first prefix segment.
 * e.g. "sl-button" → "button", "my-dropdown-menu" → "dropdown-menu"
 */
function baseName(tagName: string): string {
  const idx = tagName.indexOf('-');
  return idx === -1 ? tagName : tagName.slice(idx + 1);
}

function computeDocQuality(cem: Cem, tagNames: string[]): DocQualityStats {
  if (tagNames.length === 0) {
    return { avgCssProperties: 0, avgEvents: 0, avgSlots: 0, avgCssParts: 0 };
  }

  let totalCssProperties = 0;
  let totalEvents = 0;
  let totalSlots = 0;
  let totalCssParts = 0;

  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName || !tagNames.includes(decl.tagName)) continue;
      totalCssProperties += (decl.cssProperties ?? []).length;
      totalEvents += (decl.events ?? []).length;
      totalSlots += (decl.slots ?? []).length;
      totalCssParts += (decl.cssParts ?? []).length;
    }
  }

  const n = tagNames.length;
  return {
    avgCssProperties: Math.round((totalCssProperties / n) * 10) / 10,
    avgEvents: Math.round((totalEvents / n) * 10) / 10,
    avgSlots: Math.round((totalSlots / n) * 10) / 10,
    avgCssParts: Math.round((totalCssParts / n) * 10) / 10,
  };
}

function buildVerdict(
  labelA: string,
  labelB: string,
  countA: number,
  countB: number,
  qualityA: DocQualityStats,
  qualityB: DocQualityStats,
): string {
  const parts: string[] = [];

  if (countA > countB) {
    parts.push(`${labelA} has more components (${countA} vs ${countB}).`);
  } else if (countB > countA) {
    parts.push(`${labelB} has more components (${countB} vs ${countA}).`);
  } else {
    parts.push(`Both libraries have the same number of components (${countA}).`);
  }

  const docScoreA =
    qualityA.avgCssProperties + qualityA.avgEvents + qualityA.avgSlots + qualityA.avgCssParts;
  const docScoreB =
    qualityB.avgCssProperties + qualityB.avgEvents + qualityB.avgSlots + qualityB.avgCssParts;

  if (docScoreA > docScoreB) {
    parts.push(
      `${labelA} has richer documentation surface (CSS properties, events, slots, parts).`,
    );
  } else if (docScoreB > docScoreA) {
    parts.push(
      `${labelB} has richer documentation surface (CSS properties, events, slots, parts).`,
    );
  } else {
    parts.push('Both libraries have equivalent documentation depth.');
  }

  return parts.join(' ');
}

// --- Public API ---

export async function compareLibraries(
  args: CompareLibrariesArgs,
  config: McpWcConfig,
): Promise<LibraryComparisonResult> {
  const fileOps = new SafeFileOperations();
  const { cemPathA, cemPathB } = args;
  const labelA = args.labelA ?? cemPathA;
  const labelB = args.labelB ?? cemPathB;

  const absPathA = join(config.projectRoot, cemPathA);
  const absPathB = join(config.projectRoot, cemPathB);

  const cemA = await fileOps.readJSON(absPathA, CemSchema);
  const cemB = await fileOps.readJSON(absPathB, CemSchema);

  const tagsA = listAllComponents(cemA);
  const tagsB = listAllComponents(cemB);

  // Build base-name maps for matching
  const baseMapA = new Map<string, string>(); // baseName → tagName
  for (const tag of tagsA) {
    baseMapA.set(baseName(tag), tag);
  }

  const baseMapB = new Map<string, string>(); // baseName → tagName
  for (const tag of tagsB) {
    baseMapB.set(baseName(tag), tag);
  }

  const allBaseNames = new Set([...baseMapA.keys(), ...baseMapB.keys()]);

  const onlyInA: string[] = [];
  const onlyInB: string[] = [];
  const inBoth: Array<{ tagNameA: string; tagNameB: string; baseName: string }> = [];
  const featureMatrix: Array<{ component: string; inA: boolean; inB: boolean }> = [];

  for (const base of [...allBaseNames].sort()) {
    const inA = baseMapA.has(base);
    const inB = baseMapB.has(base);

    featureMatrix.push({ component: base, inA, inB });

    if (inA && inB) {
      inBoth.push({
        tagNameA: baseMapA.get(base) ?? base,
        tagNameB: baseMapB.get(base) ?? base,
        baseName: base,
      });
    } else if (inA) {
      onlyInA.push(baseMapA.get(base) ?? base);
    } else {
      onlyInB.push(baseMapB.get(base) ?? base);
    }
  }

  const docQualityA = computeDocQuality(cemA, tagsA);
  const docQualityB = computeDocQuality(cemB, tagsB);

  const verdict = buildVerdict(
    labelA,
    labelB,
    tagsA.length,
    tagsB.length,
    docQualityA,
    docQualityB,
  );

  return {
    labelA,
    labelB,
    countA: tagsA.length,
    countB: tagsB.length,
    onlyInA,
    onlyInB,
    inBoth,
    featureMatrix,
    docQualityA,
    docQualityB,
    verdict,
  };
}
