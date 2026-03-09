import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { McpWcConfig } from '../config.js';
import { CemSchema } from './cem.js';
import { SafeFileOperations } from '../shared/file-ops.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';
import { FilePathSchema } from '../shared/validation.js';

// --- Input schema ---

const LibraryEntrySchema = z.object({
  label: z.string(),
  cemPath: FilePathSchema,
});

export const BenchmarkLibrariesArgsSchema = z.object({
  libraries: z.array(LibraryEntrySchema).min(2).max(10),
});

export type BenchmarkLibrariesArgs = z.infer<typeof BenchmarkLibrariesArgsSchema>;

// --- Output types ---

export interface LibraryScore {
  label: string;
  componentCount: number;
  avgProperties: number;
  avgEvents: number;
  avgSlots: number;
  avgCssProps: number;
  docQualityPct: number;
  score: number;
}

// --- Scoring weights ---

const WEIGHTS = {
  properties: 0.25,
  events: 0.2,
  slots: 0.15,
  cssProps: 0.2,
  docQuality: 0.2,
};

// --- Private helpers ---

interface RawMetrics {
  label: string;
  componentCount: number;
  avgProperties: number;
  avgEvents: number;
  avgSlots: number;
  avgCssProps: number;
  docQualityPct: number;
}

function computeRawMetrics(label: string, cem: z.infer<typeof CemSchema>): RawMetrics {
  const components: z.infer<typeof CemSchema>['modules'][number]['declarations'] = [];
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName) {
        components.push(decl);
      }
    }
  }

  const n = components.length;
  if (n === 0) {
    return {
      label,
      componentCount: 0,
      avgProperties: 0,
      avgEvents: 0,
      avgSlots: 0,
      avgCssProps: 0,
      docQualityPct: 0,
    };
  }

  let totalProperties = 0;
  let totalEvents = 0;
  let totalSlots = 0;
  let totalCssProps = 0;
  let totalMembersWithDesc = 0;
  let totalMembers = 0;

  for (const decl of components) {
    const members = decl.members ?? [];
    const fields = members.filter((m) => m.kind === 'field');
    totalProperties += fields.length;
    totalEvents += (decl.events ?? []).length;
    totalSlots += (decl.slots ?? []).length;
    totalCssProps += (decl.cssProperties ?? []).length;
    totalMembers += members.length;
    totalMembersWithDesc += members.filter(
      (m) => m.description && m.description.trim() !== '',
    ).length;
  }

  const docQualityPct = totalMembers > 0 ? (totalMembersWithDesc / totalMembers) * 100 : 0;

  return {
    label,
    componentCount: n,
    avgProperties: Math.round((totalProperties / n) * 10) / 10,
    avgEvents: Math.round((totalEvents / n) * 10) / 10,
    avgSlots: Math.round((totalSlots / n) * 10) / 10,
    avgCssProps: Math.round((totalCssProps / n) * 10) / 10,
    docQualityPct: Math.round(docQualityPct * 10) / 10,
  };
}

function normalizeAndScore(rawList: RawMetrics[]): LibraryScore[] {
  const maxProps = Math.max(...rawList.map((r) => r.avgProperties), 0.001);
  const maxEvents = Math.max(...rawList.map((r) => r.avgEvents), 0.001);
  const maxSlots = Math.max(...rawList.map((r) => r.avgSlots), 0.001);
  const maxCssProps = Math.max(...rawList.map((r) => r.avgCssProps), 0.001);
  const maxDocQuality = Math.max(...rawList.map((r) => r.docQualityPct), 0.001);

  return rawList.map((r) => {
    const normProps = (r.avgProperties / maxProps) * 100;
    const normEvents = (r.avgEvents / maxEvents) * 100;
    const normSlots = (r.avgSlots / maxSlots) * 100;
    const normCssProps = (r.avgCssProps / maxCssProps) * 100;
    const normDocQuality = (r.docQualityPct / maxDocQuality) * 100;

    const score =
      normProps * WEIGHTS.properties +
      normEvents * WEIGHTS.events +
      normSlots * WEIGHTS.slots +
      normCssProps * WEIGHTS.cssProps +
      normDocQuality * WEIGHTS.docQuality;

    return {
      label: r.label,
      componentCount: r.componentCount,
      avgProperties: r.avgProperties,
      avgEvents: r.avgEvents,
      avgSlots: r.avgSlots,
      avgCssProps: r.avgCssProps,
      docQualityPct: r.docQualityPct,
      score: Math.round(score * 10) / 10,
    };
  });
}

function formatMarkdown(scores: LibraryScore[]): string {
  const header =
    '| Library | Components | Avg Props | Avg Events | Avg Slots | Avg CSS Props | Doc Quality | Score |';
  const separator =
    '|---------|------------|-----------|------------|-----------|---------------|-------------|-------|';

  const rows = scores.map(
    (s) =>
      `| ${s.label} | ${s.componentCount} | ${s.avgProperties} | ${s.avgEvents} | ${s.avgSlots} | ${s.avgCssProps} | ${s.docQualityPct.toFixed(1)}% | ${s.score} |`,
  );

  // Category winners
  const winners: string[] = [];

  const topProps = scores.reduce((a, b) => (a.avgProperties >= b.avgProperties ? a : b));
  winners.push(
    `- **Best Property Coverage**: ${topProps.label} (avg ${topProps.avgProperties} props)`,
  );

  const topEvents = scores.reduce((a, b) => (a.avgEvents >= b.avgEvents ? a : b));
  winners.push(`- **Best Event Coverage**: ${topEvents.label} (avg ${topEvents.avgEvents} events)`);

  const topSlots = scores.reduce((a, b) => (a.avgSlots >= b.avgSlots ? a : b));
  winners.push(`- **Best Slot Coverage**: ${topSlots.label} (avg ${topSlots.avgSlots} slots)`);

  const topCss = scores.reduce((a, b) => (a.avgCssProps >= b.avgCssProps ? a : b));
  winners.push(
    `- **Best CSS Theming Surface**: ${topCss.label} (avg ${topCss.avgCssProps} CSS props)`,
  );

  const topDoc = scores.reduce((a, b) => (a.docQualityPct >= b.docQualityPct ? a : b));
  winners.push(
    `- **Best Documentation Quality**: ${topDoc.label} (${topDoc.docQualityPct.toFixed(1)}%)`,
  );

  const overall = scores[0] as LibraryScore | undefined;
  if (overall) {
    winners.push(`- **Overall Winner**: ${overall.label} (score ${overall.score})`);
  }

  return [
    '## Library Benchmark Results',
    '',
    header,
    separator,
    ...rows,
    '',
    '## Category Winners',
    '',
    ...winners,
  ].join('\n');
}

// --- Public API ---

export async function benchmarkLibraries(
  libraries: Array<{ label: string; cemPath: string }>,
  config: McpWcConfig,
): Promise<{ scores: LibraryScore[]; formatted: string }> {
  const fileOps = new SafeFileOperations(config.projectRoot);
  const rawList: RawMetrics[] = [];

  for (const lib of libraries) {
    const pathResult = FilePathSchema.safeParse(lib.cemPath);
    if (!pathResult.success) {
      throw new MCPError(
        pathResult.error.errors[0]?.message ?? 'Invalid path',
        ErrorCategory.VALIDATION,
      );
    }
    const absPath = resolve(join(config.projectRoot, lib.cemPath));
    const cem = await fileOps.readJSON(absPath, CemSchema);
    rawList.push(computeRawMetrics(lib.label, cem));
  }

  const scored = normalizeAndScore(rawList);
  scored.sort((a, b) => b.score - a.score);

  const formatted = formatMarkdown(scored);

  return { scores: scored, formatted };
}
