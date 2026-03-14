import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { z } from 'zod';
import { GitOperations } from '../shared/git.js';
import type { McpWcConfig } from '../config.js';
import { CemSchema } from './cem.js';
import type { Cem, CemDeclaration } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';
import { analyzeAccessibility } from './accessibility.js';
import { analyzeTypeCoverage } from './analyzers/type-coverage.js';
import { analyzeApiSurface } from './analyzers/api-surface.js';
import { analyzeCssArchitecture } from './analyzers/css-architecture.js';
import { analyzeEventArchitecture } from './analyzers/event-architecture.js';
import { analyzeSourceAccessibility } from './analyzers/source-accessibility.js';
import {
  DIMENSION_REGISTRY,
  calculateGrade,
  computeWeightedScore,
  type ConfidenceLevel,
  type DimensionResult,
  type SubMetric,
} from './dimensions.js';

// ─── Return types ────────────────────────────────────────────────────────────

export interface ComponentHealth {
  tagName: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: Record<string, number>;
  dimensionWeights?: Record<string, number>;
  dimensionConfidence?: Record<string, 'verified' | 'heuristic' | 'untested'>;
  confidenceSummary?: { verified: number; heuristic: number; untested: number };
  issues: string[];
  timestamp: string;
}

export interface HealthTrend {
  tagName: string;
  days: number;
  dataPoints: Array<{ date: string; score: number; grade: string }>;
  trend: 'improving' | 'declining' | 'stable';
  changePercent: number;
  dimensionTrends?: Record<
    string,
    { trend: 'improving' | 'declining' | 'stable'; changePercent: number }
  >;
}

export interface HealthSummary {
  totalComponents: number;
  averageScore: number;
  gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
  libraryTrend: 'improving' | 'declining' | 'stable';
  componentsNeedingAttention: string[];
  timestamp: string;
}

export interface HealthDiff {
  tagName: string;
  base: ComponentHealth;
  current: ComponentHealth;
  improved: boolean;
  regressed: boolean;
  scoreDelta: number;
  changedDimensions: Array<{
    dimension: string;
    before: number;
    after: number;
    delta: number;
  }>;
}

// ─── Zod schema for per-component history JSON files ─────────────────────────

const HistoryFileSchema = z.object({
  component: z.string(),
  date: z.string(),
  score: z.number(),
  breakdown: z
    .record(
      z.object({
        score: z.number(),
        weight: z.number().optional(),
        confidence: z.enum(['verified', 'heuristic', 'untested']).optional(),
        details: z.record(z.unknown()).optional(),
      }),
    )
    .default({}),
  issues: z.array(z.object({ message: z.string() })).default([]),
  overallConfidence: z
    .object({
      verified: z.number(),
      heuristic: z.number(),
      untested: z.number(),
    })
    .optional(),
});

// Manually typed to avoid Zod's optional/default inference quirks
interface HistoryFileRaw {
  component: string;
  date: string;
  score: number;
  breakdown: Record<
    string,
    {
      score: number;
      weight?: number;
      confidence?: 'verified' | 'heuristic' | 'untested';
      details?: Record<string, unknown>;
    }
  >;
  issues: Array<{ message: string }>;
  overallConfidence?: { verified: number; heuristic: number; untested: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Returns proportional points out of maxPoints.
 * If total is zero, the dimension is trivially satisfied and full points are awarded.
 */
function proportional(count: number, total: number, maxPoints: number): number {
  if (total === 0) return maxPoints;
  return Math.round((count / total) * maxPoints);
}

function historyToHealth(file: HistoryFileRaw): ComponentHealth {
  const dimensions: Record<string, number> = {};
  const dimensionWeights: Record<string, number> = {};
  const dimensionConfidence: Record<string, 'verified' | 'heuristic' | 'untested'> = {};

  for (const [key, val] of Object.entries(file.breakdown ?? {})) {
    dimensions[key] = val.score;
    if (val.weight !== undefined) {
      dimensionWeights[key] = val.weight;
    }
    if (val.confidence !== undefined) {
      dimensionConfidence[key] = val.confidence;
    }
  }

  const hasWeights = Object.keys(dimensionWeights).length > 0;
  const hasConfidence = Object.keys(dimensionConfidence).length > 0;

  const result: ComponentHealth = {
    tagName: file.component,
    score: file.score,
    grade: computeGrade(file.score),
    dimensions,
    issues: (file.issues ?? []).map((i) => i.message),
    timestamp: file.date,
  };

  if (hasWeights) result.dimensionWeights = dimensionWeights;
  if (hasConfidence) result.dimensionConfidence = dimensionConfidence;
  if (file.overallConfidence) result.confidenceSummary = file.overallConfidence;

  return result;
}

/**
 * Positive allowlist for tag names used in health history directory lookups.
 * Custom element tag names per HTML spec are [a-z0-9-], with optional "pkg:tag" notation.
 * Only lowercase alphanumeric, hyphens, colons, and underscores are allowed.
 */
const TAG_NAME_ALLOWLIST_REGEX = /^[a-z0-9:_-]+$/i;

function componentHistoryDir(config: McpWcConfig, tagName: string, libraryId = 'default'): string {
  // Use a positive allowlist to reject any tag name that doesn't match safe characters.
  // This is more robust than a negative blocklist (which could miss null bytes, unicode tricks, etc.).
  if (!TAG_NAME_ALLOWLIST_REGEX.test(tagName)) {
    throw new MCPError(
      `Invalid tag name for health history lookup: "${tagName}". Only alphanumeric characters, hyphens, colons, and underscores are allowed.`,
      ErrorCategory.VALIDATION,
    );
  }
  // libraryId uses the same allowlist — prevents path traversal via libraryId segment.
  if (!TAG_NAME_ALLOWLIST_REGEX.test(libraryId)) {
    throw new MCPError(
      `Invalid libraryId for health history lookup: "${libraryId}". Only alphanumeric characters, hyphens, colons, and underscores are allowed.`,
      ErrorCategory.VALIDATION,
    );
  }
  // Namespace by libraryId: {healthHistoryDir}/{libraryId}/{tagName}
  // Use "default" as libraryId for the primary (non-multi-CEM) library.
  return resolve(config.projectRoot, config.healthHistoryDir, libraryId, tagName);
}

async function parseHistoryFile(filePath: string, config: McpWcConfig): Promise<HistoryFileRaw> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  const result = HistoryFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new MCPError(
      `Invalid health history file "${relative(config.projectRoot, filePath)}": ${result.error.message}`,
      ErrorCategory.VALIDATION,
    );
  }
  return {
    component: result.data.component,
    date: result.data.date,
    score: result.data.score,
    breakdown: result.data.breakdown ?? {},
    issues: result.data.issues ?? [],
    overallConfidence: result.data.overallConfidence,
  };
}

async function readLatestHistoryFile(
  config: McpWcConfig,
  tagName: string,
  libraryId = 'default',
): Promise<HistoryFileRaw | null> {
  // Try namespaced path first: {healthHistoryDir}/{libraryId}/{tagName}
  const namespacedDir = componentHistoryDir(config, tagName, libraryId);

  let dir = namespacedDir;
  let files: string[];
  try {
    files = (await readdir(namespacedDir))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
  } catch (err) {
    // Only fall back for ENOENT (directory doesn't exist); surface all other errors (e.g. EACCES)
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    // Migration: fall back to old-style (non-namespaced) path if namespaced dir doesn't exist
    const legacyDir = resolve(config.projectRoot, config.healthHistoryDir, tagName);
    try {
      files = (await readdir(legacyDir))
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();
      dir = legacyDir;
    } catch {
      return null;
    }
  }

  if (files.length === 0) return null;

  return parseHistoryFile(join(dir, files[0] as string), config);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes a CEM-derived documentation health score from 6 dimensions.
 * Used as a fallback when no pre-computed history files are available.
 *
 * Max score: 100
 *   - description present:              +15
 *   - all properties have descriptions: +25
 *   - all events have type annotations: +20
 *   - all events have descriptions:     +15
 *   - CSS parts documented:             +15
 *   - slots documented:                 +10
 */
export function scoreCemFallback(decl: CemDeclaration): ComponentHealth {
  let score = 0;
  const issues: string[] = [];
  const dimensions: Record<string, number> = {};

  // 1. description present (+15)
  const hasDesc = typeof decl.description === 'string' && decl.description.trim().length > 0;
  dimensions.descriptionPresent = hasDesc ? 15 : 0;
  score += dimensions.descriptionPresent;
  if (!hasDesc) {
    issues.push('Component description is missing');
  }

  // 2. all properties (fields) have descriptions (+25)
  const fields = (decl.members ?? []).filter((m) => m.kind === 'field');
  const fieldsWithDesc = fields.filter(
    (m) => typeof m.description === 'string' && m.description.trim().length > 0,
  );
  dimensions.propertyDescriptions = proportional(fieldsWithDesc.length, fields.length, 25);
  score += dimensions.propertyDescriptions;
  for (const m of fields.filter((m) => !m.description || !m.description.trim())) {
    issues.push(`Property '${m.name}' is missing a description`);
  }

  // 3. all events have type annotations (+20)
  const events = decl.events ?? [];
  const eventsWithType = events.filter(
    (e) => e.type && e.type.text && e.type.text.trim().length > 0,
  );
  dimensions.eventTypes = proportional(eventsWithType.length, events.length, 20);
  score += dimensions.eventTypes;
  for (const e of events.filter((e) => !e.type || !e.type.text || !e.type.text.trim())) {
    issues.push(`Event '${e.name}' is missing a type annotation`);
  }

  // 4. all events have descriptions (+15)
  const eventsWithDesc = events.filter(
    (e) => typeof e.description === 'string' && e.description.trim().length > 0,
  );
  dimensions.eventDescriptions = proportional(eventsWithDesc.length, events.length, 15);
  score += dimensions.eventDescriptions;
  for (const e of events.filter((e) => !e.description || !e.description.trim())) {
    issues.push(`Event '${e.name}' is missing a description`);
  }

  // 5. CSS parts documented (+15)
  const cssParts = decl.cssParts ?? [];
  const cssPartsWithDesc = cssParts.filter(
    (p) => typeof p.description === 'string' && p.description.trim().length > 0,
  );
  dimensions.cssPartsDocumented = proportional(cssPartsWithDesc.length, cssParts.length, 15);
  score += dimensions.cssPartsDocumented;

  // 6. Slots documented (+10)
  const slots = decl.slots ?? [];
  const slotsWithDesc = slots.filter(
    (s) => typeof s.description === 'string' && s.description.trim().length > 0,
  );
  dimensions.slotsDocumented = proportional(slotsWithDesc.length, slots.length, 10);
  score += dimensions.slotsDocumented;

  return {
    tagName: decl.tagName ?? '',
    score,
    grade: computeGrade(score),
    dimensions,
    issues,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Returns the latest health score for a component.
 * Reads from pre-computed history files in healthHistoryDir/{tagName}/.
 * Falls back to CEM-derived scoring when no history exists.
 */
export async function scoreComponent(
  config: McpWcConfig,
  tagName: string,
  cemDecl?: CemDeclaration,
  libraryId = 'default',
): Promise<ComponentHealth> {
  const history = await readLatestHistoryFile(config, tagName, libraryId);
  if (history) {
    return historyToHealth(history);
  }

  if (cemDecl) {
    return scoreCemFallback(cemDecl);
  }

  throw new MCPError(
    `No health history for '${tagName}' and no CEM data provided for fallback`,
    ErrorCategory.NOT_FOUND,
  );
}

/**
 * Scores every component in the provided CEM declarations.
 * Uses history files when available; falls back to CEM-derived scoring.
 */
export async function scoreAllComponents(
  config: McpWcConfig,
  cemDeclarations: CemDeclaration[],
  libraryId = 'default',
): Promise<ComponentHealth[]> {
  const withTag = cemDeclarations.filter((decl) => decl.tagName !== undefined);
  return Promise.all(
    withTag.map((decl) => scoreComponent(config, decl.tagName as string, decl, libraryId)),
  );
}

/**
 * Returns the health trend for a component over the last N days.
 * Reads per-component history files sorted by date.
 * Single data point always reports as 'stable'.
 */
export async function getHealthTrend(
  config: McpWcConfig,
  tagName: string,
  days: number = 7,
  libraryId = 'default',
): Promise<HealthTrend> {
  // Try namespaced path first: {healthHistoryDir}/{libraryId}/{tagName}
  const namespacedDir = componentHistoryDir(config, tagName, libraryId);

  let allFiles: string[];
  let dir = namespacedDir;
  try {
    allFiles = (await readdir(namespacedDir)).filter((f) => f.endsWith('.json')).sort(); // ASC by date
  } catch (err) {
    // Only fall back for ENOENT (directory doesn't exist); surface all other errors (e.g. EACCES)
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    // Migration: fall back to old-style (non-namespaced) path if namespaced dir doesn't exist
    const legacyDir = resolve(config.projectRoot, config.healthHistoryDir, tagName);
    try {
      allFiles = (await readdir(legacyDir)).filter((f) => f.endsWith('.json')).sort();
      dir = legacyDir;
    } catch {
      throw new MCPError(`No health history found for '${tagName}'`, ErrorCategory.NOT_FOUND);
    }
  }

  // Take the most recent `days` files, preserve chronological order
  const selectedFiles = allFiles.slice(-days);

  if (selectedFiles.length === 0) {
    throw new MCPError(`No health history files found for '${tagName}'`, ErrorCategory.NOT_FOUND);
  }

  const dataPoints: Array<{ date: string; score: number; grade: string }> = [];
  const parsedFiles: HistoryFileRaw[] = [];

  for (const file of selectedFiles) {
    const data = await parseHistoryFile(join(dir, file), config);
    parsedFiles.push(data);
    dataPoints.push({
      date: data.date,
      score: data.score,
      grade: computeGrade(data.score),
    });
  }

  // Single data point = stable
  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  let changePercent = 0;

  if (dataPoints.length > 1) {
    const firstScore = (dataPoints[0] as (typeof dataPoints)[0]).score;
    const lastScore = (dataPoints[dataPoints.length - 1] as (typeof dataPoints)[0]).score;
    changePercent =
      firstScore === 0 ? (lastScore > 0 ? 100 : 0) : ((lastScore - firstScore) / firstScore) * 100;
    changePercent = Math.round(changePercent * 10) / 10;

    if (changePercent > 5) trend = 'improving';
    else if (changePercent < -5) trend = 'declining';
  }

  // Compute per-dimension trends when breakdown data is available across multiple points
  let dimensionTrends:
    | Record<string, { trend: 'improving' | 'declining' | 'stable'; changePercent: number }>
    | undefined;

  if (parsedFiles.length > 1) {
    const firstFile = parsedFiles[0] as HistoryFileRaw;
    const lastFile = parsedFiles[parsedFiles.length - 1] as HistoryFileRaw;
    const allDimensions = new Set([
      ...Object.keys(firstFile.breakdown ?? {}),
      ...Object.keys(lastFile.breakdown ?? {}),
    ]);

    if (allDimensions.size > 0) {
      dimensionTrends = {};
      for (const dim of allDimensions) {
        const firstDimScore = firstFile.breakdown[dim]?.score ?? 0;
        const lastDimScore = lastFile.breakdown[dim]?.score ?? 0;
        const dimChangePercent =
          firstDimScore === 0
            ? lastDimScore > 0
              ? 100
              : 0
            : ((lastDimScore - firstDimScore) / firstDimScore) * 100;
        const roundedDimChange = Math.round(dimChangePercent * 10) / 10;
        let dimTrend: 'improving' | 'declining' | 'stable' = 'stable';
        if (roundedDimChange > 5) dimTrend = 'improving';
        else if (roundedDimChange < -5) dimTrend = 'declining';
        dimensionTrends[dim] = { trend: dimTrend, changePercent: roundedDimChange };
      }
    }
  }

  return {
    tagName,
    days: dataPoints.length,
    dataPoints,
    trend,
    changePercent,
    ...(dimensionTrends !== undefined ? { dimensionTrends } : {}),
  };
}

// Use the shared Cem type from cem.ts for parsing raw CEM files.

/**
 * Compares component health between the current branch and a base branch.
 * Reads the base branch CEM via `git show` — no stash, no checkout, no working-tree mutation.
 * Base health is derived by running scoreCemFallback against the base branch's CEM declaration.
 */
export async function getHealthDiff(
  config: McpWcConfig,
  tagName: string,
  baseBranch: string = 'main',
  cemDecl?: CemDeclaration,
  gitOps?: GitOperations,
  libraryId = 'default',
): Promise<HealthDiff> {
  const current = await scoreComponent(config, tagName, cemDecl, libraryId);

  const git = gitOps ?? new GitOperations();

  let base: ComponentHealth;
  try {
    const cemContent = await git.gitShow(baseBranch, config.cemPath);
    const cem = CemSchema.parse(JSON.parse(cemContent));
    const baseDecl = cem.modules
      .flatMap((m) => m.declarations ?? [])
      .find((d) => d.tagName === tagName);
    if (baseDecl) {
      base = scoreCemFallback(baseDecl);
    } else {
      base = {
        tagName,
        score: 0,
        grade: 'F',
        dimensions: {},
        issues: ['Component not found in base branch'],
        timestamp: new Date().toISOString(),
      };
    }
  } catch {
    base = {
      tagName,
      score: 0,
      grade: 'F',
      dimensions: {},
      issues: ['Component not found in base branch'],
      timestamp: new Date().toISOString(),
    };
  }

  const scoreDelta = current.score - base.score;
  const improved = scoreDelta > 0;
  const regressed = scoreDelta < 0;

  const allDimensions = new Set([
    ...Object.keys(base.dimensions),
    ...Object.keys(current.dimensions),
  ]);

  const changedDimensions: Array<{
    dimension: string;
    before: number;
    after: number;
    delta: number;
  }> = [];

  for (const dim of allDimensions) {
    const before = base.dimensions[dim] ?? 0;
    const after = current.dimensions[dim] ?? 0;
    const delta = after - before;
    if (delta !== 0) {
      changedDimensions.push({
        dimension: dim,
        before,
        after,
        delta: Math.round(delta * 10) / 10,
      });
    }
  }

  return {
    tagName,
    base,
    current,
    improved,
    regressed,
    scoreDelta: Math.round(scoreDelta * 10) / 10,
    changedDimensions,
  };
}

/**
 * Returns aggregate health statistics for all components.
 * Uses history files when available; falls back to CEM-derived scoring.
 */
export async function getHealthSummary(
  config: McpWcConfig,
  cemDeclarations: CemDeclaration[],
): Promise<HealthSummary> {
  const withTag = cemDeclarations.filter((decl) => decl.tagName !== undefined);

  const results = await Promise.all(
    withTag.map(async (decl) => {
      try {
        return await scoreComponent(config, decl.tagName as string, decl);
      } catch {
        return null;
      }
    }),
  );

  const scored = results.filter((r): r is ComponentHealth => r !== null);

  const totalComponents = scored.length;
  const averageScore =
    totalComponents === 0
      ? 0
      : Math.round((scored.reduce((sum, r) => sum + r.score, 0) / totalComponents) * 10) / 10;

  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const r of scored) {
    gradeDistribution[r.grade]++;
  }

  const componentsNeedingAttention = scored.filter((r) => r.score < 70).map((r) => r.tagName);

  // Determine library-wide trend using per-component history files.
  const trendCounts: Record<'improving' | 'declining' | 'stable', number> = {
    improving: 0,
    declining: 0,
    stable: 0,
  };

  await Promise.all(
    withTag.map(async (decl) => {
      try {
        const t = await getHealthTrend(config, decl.tagName as string, 7);
        trendCounts[t.trend]++;
      } catch {
        // no history — skip
      }
    }),
  );

  let libraryTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (trendCounts.improving > trendCounts.declining && trendCounts.improving > trendCounts.stable) {
    libraryTrend = 'improving';
  } else if (
    trendCounts.declining > trendCounts.improving &&
    trendCounts.declining > trendCounts.stable
  ) {
    libraryTrend = 'declining';
  }

  return {
    totalComponents,
    averageScore,
    gradeDistribution,
    libraryTrend,
    componentsNeedingAttention,
    timestamp: new Date().toISOString(),
  };
}

// ─── Multi-Dimensional Health Scoring ─────────────────────────────────────────

export interface MultiDimensionalHealth {
  tagName: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: DimensionResult[];
  confidenceSummary: { verified: number; heuristic: number; untested: number };
  gradingNotes: string[];
  issues: string[];
  timestamp: string;
}

/**
 * Converts the existing CEM completeness scoring (scoreCemFallback sub-metrics)
 * into a normalized 0-100 score with sub-metrics.
 */
function scoreCemCompleteness(decl: CemDeclaration): { score: number; subMetrics: SubMetric[] } {
  const subMetrics: SubMetric[] = [];

  const hasDesc = typeof decl.description === 'string' && decl.description.trim().length > 0;
  subMetrics.push({ name: 'Description present', score: hasDesc ? 15 : 0, maxScore: 15 });

  const fields = (decl.members ?? []).filter((m) => m.kind === 'field');
  const fieldsWithDesc = fields.filter(
    (m) => typeof m.description === 'string' && m.description.trim().length > 0,
  );
  subMetrics.push({
    name: 'Property descriptions',
    score: proportional(fieldsWithDesc.length, fields.length, 25),
    maxScore: 25,
    note: `${fieldsWithDesc.length}/${fields.length}`,
  });

  const events = decl.events ?? [];
  const eventsWithType = events.filter(
    (e) => e.type && e.type.text && e.type.text.trim().length > 0,
  );
  subMetrics.push({
    name: 'Event types',
    score: proportional(eventsWithType.length, events.length, 20),
    maxScore: 20,
    note: `${eventsWithType.length}/${events.length}`,
  });

  const eventsWithDesc = events.filter(
    (e) => typeof e.description === 'string' && e.description.trim().length > 0,
  );
  subMetrics.push({
    name: 'Event descriptions',
    score: proportional(eventsWithDesc.length, events.length, 15),
    maxScore: 15,
    note: `${eventsWithDesc.length}/${events.length}`,
  });

  const cssParts = decl.cssParts ?? [];
  const cssPartsWithDesc = cssParts.filter(
    (p) => typeof p.description === 'string' && p.description.trim().length > 0,
  );
  subMetrics.push({
    name: 'CSS parts documented',
    score: proportional(cssPartsWithDesc.length, cssParts.length, 15),
    maxScore: 15,
    note: `${cssPartsWithDesc.length}/${cssParts.length}`,
  });

  const slots = decl.slots ?? [];
  const slotsWithDesc = slots.filter(
    (s) => typeof s.description === 'string' && s.description.trim().length > 0,
  );
  subMetrics.push({
    name: 'Slots documented',
    score: proportional(slotsWithDesc.length, slots.length, 10),
    maxScore: 10,
    note: `${slotsWithDesc.length}/${slots.length}`,
  });

  const score = subMetrics.reduce((sum, m) => sum + m.score, 0);
  return { score, subMetrics };
}

/**
 * Scores a component across all 11 dimensions using the enterprise grade algorithm.
 * CEM-native dimensions are computed from the declaration.
 * External dimensions are checked via history files (reported as untested if unavailable).
 */
export async function scoreComponentMultiDimensional(
  config: McpWcConfig,
  decl: CemDeclaration,
  cem?: Cem,
  libraryId = 'default',
): Promise<MultiDimensionalHealth> {
  const tagName = decl.tagName ?? '';
  const issues: string[] = [];
  const dimensions: DimensionResult[] = [];

  // Read history file to check for external dimension scores
  let historyBreakdown: Record<string, { score: number; weight?: number; confidence?: string }> =
    {};
  try {
    const history = await readLatestHistoryFile(config, tagName, libraryId);
    if (history) {
      historyBreakdown = history.breakdown;
    }
  } catch {
    // No history available — external dimensions will be untested
  }

  for (const def of DIMENSION_REGISTRY) {
    if (def.source === 'cem-native') {
      const result = await scoreCemNativeDimension(def.name, decl, issues, config, cem);
      const notApplicable = 'notApplicable' in result && result.notApplicable === true;
      dimensions.push({
        name: def.name,
        score: result.score,
        weight: def.weight,
        tier: def.tier,
        confidence: result.confidence,
        measured: !notApplicable,
        subMetrics: result.subMetrics,
      });
    } else {
      // External dimension — check history files
      const historyEntry = historyBreakdown[def.name];
      if (historyEntry) {
        dimensions.push({
          name: def.name,
          score: historyEntry.score,
          weight: def.weight,
          tier: def.tier,
          confidence: (historyEntry.confidence as 'verified' | 'heuristic') ?? 'verified',
          measured: true,
        });
      } else {
        dimensions.push({
          name: def.name,
          score: 0,
          weight: def.weight,
          tier: def.tier,
          confidence: 'untested',
          measured: false,
        });
      }
    }
  }

  // Compute weighted score and enterprise grade
  const weightedScore = computeWeightedScore(dimensions);
  const { grade, gradingNotes } = calculateGrade(weightedScore, dimensions);

  // Confidence summary
  const confidenceSummary = { verified: 0, heuristic: 0, untested: 0 };
  for (const d of dimensions) {
    confidenceSummary[d.confidence]++;
  }

  return {
    tagName,
    score: weightedScore,
    grade,
    dimensions,
    confidenceSummary,
    gradingNotes,
    issues,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Dispatches CEM-native dimension scoring to the appropriate analyzer.
 */
async function scoreCemNativeDimension(
  name: string,
  decl: CemDeclaration,
  issues: string[],
  config?: McpWcConfig,
  cem?: Cem,
): Promise<{
  score: number;
  confidence: ConfidenceLevel;
  subMetrics?: SubMetric[];
  notApplicable?: boolean;
}> {
  switch (name) {
    case 'CEM Completeness': {
      const { score, subMetrics } = scoreCemCompleteness(decl);
      if (score < 70) {
        issues.push(`CEM documentation completeness is low (${score}%)`);
      }
      return { score, confidence: 'verified', subMetrics };
    }

    case 'Accessibility': {
      const a11y = analyzeAccessibility(decl);
      const cemSubMetrics: SubMetric[] = Object.entries(a11y.dimensions).map(([key, dim]) => ({
        name: key,
        score: dim.points,
        maxScore: dim.maxPoints,
        note: dim.note,
      }));

      // Source-based scoring — if source file is available, blend 30% CEM + 70% source
      if (config && cem) {
        const sourceA11y = await analyzeSourceAccessibility(config, cem, decl);
        if (sourceA11y) {
          const blendedScore = Math.round(a11y.score * 0.3 + sourceA11y.score * 0.7);
          const subMetrics = [...cemSubMetrics, ...sourceA11y.subMetrics];
          if (blendedScore < 50) {
            issues.push(`Accessibility score is low (${blendedScore}%)`);
          }
          return { score: blendedScore, confidence: 'heuristic', subMetrics };
        }
      }

      // Fallback: CEM-only
      if (a11y.score < 50) {
        issues.push(`Accessibility score is low (${a11y.score}%)`);
      }
      return { score: a11y.score, confidence: 'heuristic', subMetrics: cemSubMetrics };
    }

    case 'Type Coverage': {
      const tc = analyzeTypeCoverage(decl);
      if (!tc) return { score: 0, confidence: 'untested' as ConfidenceLevel, notApplicable: true };
      if (tc.score < 50) {
        issues.push(`Type coverage is low (${tc.score}%)`);
      }
      return tc;
    }

    case 'API Surface Quality': {
      const api = analyzeApiSurface(decl);
      if (!api) return { score: 0, confidence: 'untested' as ConfidenceLevel, notApplicable: true };
      return api;
    }

    case 'CSS Architecture': {
      const css = analyzeCssArchitecture(decl);
      if (!css) return { score: 0, confidence: 'untested' as ConfidenceLevel, notApplicable: true };
      return css;
    }

    case 'Event Architecture': {
      const evt = analyzeEventArchitecture(decl);
      if (!evt) return { score: 0, confidence: 'untested' as ConfidenceLevel, notApplicable: true };
      return evt;
    }

    default:
      return { score: 0, confidence: 'heuristic' };
  }
}

/**
 * Scores all components using multi-dimensional scoring.
 */
export async function scoreAllComponentsMultiDimensional(
  config: McpWcConfig,
  cemDeclarations: CemDeclaration[],
  cem?: Cem,
  libraryId = 'default',
): Promise<MultiDimensionalHealth[]> {
  const withTag = cemDeclarations.filter((decl) => decl.tagName !== undefined);
  return Promise.all(
    withTag.map((decl) => scoreComponentMultiDimensional(config, decl, cem, libraryId)),
  );
}
