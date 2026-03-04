import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { z } from 'zod';
import { GitOperations } from '../shared/git.js';
import type { McpWcConfig } from '../config.js';
import { CemSchema } from './cem.js';
import type { CemDeclaration } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

// ─── Return types ────────────────────────────────────────────────────────────

export interface ComponentHealth {
  tagName: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: Record<string, number>;
  issues: string[];
  timestamp: string;
}

export interface HealthTrend {
  tagName: string;
  days: number;
  dataPoints: Array<{ date: string; score: number; grade: string }>;
  trend: 'improving' | 'declining' | 'stable';
  changePercent: number;
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
        details: z.record(z.unknown()).optional(),
      }),
    )
    .default({}),
  issues: z.array(z.object({ message: z.string() })).default([]),
});

// Manually typed to avoid Zod's optional/default inference quirks
interface HistoryFileRaw {
  component: string;
  date: string;
  score: number;
  breakdown: Record<string, { score: number; weight?: number; details?: Record<string, unknown> }>;
  issues: Array<{ message: string }>;
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
  for (const [key, val] of Object.entries(file.breakdown ?? {})) {
    dimensions[key] = val.score;
  }
  return {
    tagName: file.component,
    score: file.score,
    grade: computeGrade(file.score),
    dimensions,
    issues: (file.issues ?? []).map((i) => i.message),
    timestamp: file.date,
  };
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

  for (const file of selectedFiles) {
    const data = await parseHistoryFile(join(dir, file), config);
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

  return {
    tagName,
    days: dataPoints.length,
    dataPoints,
    trend,
    changePercent,
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
