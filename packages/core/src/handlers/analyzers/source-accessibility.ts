/**
 * Source-Level Accessibility Scanner — regex-based analysis of component
 * source files to detect real accessibility implementations (ARIA bindings,
 * keyboard handlers, focus management, form internals, live regions).
 *
 * Zero new dependencies. Works with ANY web component framework (Lit, FAST,
 * Stencil, vanilla) by scanning for framework-agnostic patterns.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { McpWcConfig } from '../../config.js';
import type { Cem, CemDeclaration } from '../cem.js';
import { getDeclarationSourcePath } from '../cem.js';
import type { SubMetric } from '../dimensions.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SourceA11yMarkers {
  ariaBindings: boolean;
  roleAssignments: boolean;
  keyboardHandling: boolean;
  focusManagement: boolean;
  formInternals: boolean;
  liveRegions: boolean;
  screenReaderSupport: boolean;
}

export interface SourceAccessibilityResult {
  score: number;
  confidence: 'heuristic';
  subMetrics: SubMetric[];
}

// ─── Pattern Registry ────────────────────────────────────────────────────────

export const PATTERNS: Record<keyof SourceA11yMarkers, RegExp[]> = {
  ariaBindings: [
    /aria-[a-z][\w-]*\s*[=:]/,
    /\.aria[A-Z]\w*/,
    /setAttribute\s*\(\s*['"]aria-/,
    /\$\{.*aria/i,
  ],
  roleAssignments: [/role\s*=\s*["'`$]/, /setAttribute\s*\(\s*['"]role['"]/],
  keyboardHandling: [
    /@keydown\s*=|@keyup\s*=|@keypress\s*=/,
    /addEventListener\s*\(\s*['"]key/,
    /['"](?:Enter|Escape|Space|Tab|Arrow(?:Up|Down|Left|Right))['"]/,
    /@Listen\s*\(\s*['"]key/,
  ],
  focusManagement: [
    /\.focus\s*\(/,
    /tabindex\s*[=:]/i,
    /aria-activedescendant/,
    /(?:trap|wrap|manage).*focus/i,
    /focusin|focusout/,
  ],
  formInternals: [
    /attachInternals\s*\(/,
    /static\s+formAssociated\s*=/,
    /setFormValue\s*\(/,
    /setValidity\s*\(/,
    /formResetCallback|formStateRestoreCallback/,
  ],
  liveRegions: [
    /aria-live\s*[=:]/,
    /setAttribute\s*\(\s*['"]aria-live['"]/,
    /role\s*=\s*["'](?:alert|status)["']/,
    /aria-atomic\s*[=:]/,
    /setAttribute\s*\(\s*['"]aria-atomic['"]/,
  ],
  screenReaderSupport: [
    /aria-hidden\s*[=:]/,
    /setAttribute\s*\(\s*['"]aria-hidden['"]/,
    /\.sr-only|\.visually-hidden|\.screen-reader/i,
    /aria-labelledby\s*[=:]/,
    /setAttribute\s*\(\s*['"]aria-labelledby['"]/,
    /aria-describedby\s*[=:]/,
    /setAttribute\s*\(\s*['"]aria-describedby['"]/,
  ],
};

// ─── Scoring Weights ─────────────────────────────────────────────────────────

const WEIGHTS: Record<keyof SourceA11yMarkers, { points: number; label: string }> = {
  ariaBindings: { points: 25, label: 'ARIA Template Bindings' },
  roleAssignments: { points: 15, label: 'Role Assignments' },
  keyboardHandling: { points: 20, label: 'Keyboard Handling' },
  focusManagement: { points: 15, label: 'Focus Management' },
  formInternals: { points: 10, label: 'Form Internals' },
  liveRegions: { points: 10, label: 'Live Regions' },
  screenReaderSupport: { points: 5, label: 'Screen Reader Support' },
};

// ─── Pure Scanner ────────────────────────────────────────────────────────────

/**
 * Scans source code for accessibility patterns.
 * Pure function — no I/O, fully testable.
 */
export function scanSourceForA11yPatterns(sourceCode: string): SourceA11yMarkers {
  const markers: SourceA11yMarkers = {
    ariaBindings: false,
    roleAssignments: false,
    keyboardHandling: false,
    focusManagement: false,
    formInternals: false,
    liveRegions: false,
    screenReaderSupport: false,
  };

  for (const key of Object.keys(PATTERNS) as (keyof SourceA11yMarkers)[]) {
    markers[key] = PATTERNS[key].some((regex) => regex.test(sourceCode));
  }

  return markers;
}

/**
 * Converts source scan markers into a scored result with sub-metrics.
 */
export function scoreSourceMarkers(markers: SourceA11yMarkers): SourceAccessibilityResult {
  const subMetrics: SubMetric[] = [];
  let total = 0;

  for (const key of Object.keys(WEIGHTS) as (keyof SourceA11yMarkers)[]) {
    const { points, label } = WEIGHTS[key];
    const earned = markers[key] ? points : 0;
    total += earned;
    subMetrics.push({
      name: `[Source] ${label}`,
      score: earned,
      maxScore: points,
      note: markers[key] ? 'Detected in source' : 'Not found in source',
    });
  }

  return { score: total, confidence: 'heuristic', subMetrics };
}

// ─── Source File Resolution ──────────────────────────────────────────────────

/**
 * Tries to read a file at the given path. Returns content or null.
 */
async function tryReadFile(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Resolves and reads the source file for a component.
 * Tries multiple resolution strategies to find real source:
 *   1. Direct path with .ts extension
 *   2. Direct path as-is (.js)
 *   3. src/ prefix (for repos where CEM points to dist/ paths)
 *   4. src/ prefix with .component.ts suffix (Shoelace pattern)
 */
async function readComponentSource(
  config: McpWcConfig,
  cem: Cem,
  decl: CemDeclaration,
): Promise<string | null> {
  const tagName = decl.tagName;
  if (!tagName) return null;

  const modulePath = getDeclarationSourcePath(cem, tagName);
  if (!modulePath) return null;

  const root = config.projectRoot;
  const baseName = modulePath.replace(/\.js$/, '');

  // Strategy 1: Direct .ts
  const result1 = await tryReadFile(resolve(root, baseName + '.ts'));
  if (result1) return result1;

  // Strategy 2: Direct .js
  const result2 = await tryReadFile(resolve(root, modulePath));
  if (result2) return result2;

  // Strategy 3: src/ prefix + .component.ts (Shoelace convention — check before bare .ts
  //   because src/X.ts is often a barrel re-export, while src/X.component.ts is the real source)
  const result3 = await tryReadFile(resolve(root, 'src', baseName + '.component.ts'));
  if (result3) return result3;

  // Strategy 4: src/ prefix with .ts
  const result4 = await tryReadFile(resolve(root, 'src', baseName + '.ts'));
  if (result4) return result4;

  // Strategy 5: src/ prefix with .js
  const result5 = await tryReadFile(resolve(root, 'src', modulePath));
  if (result5) return result5;

  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Determines whether a component is interactive and therefore needs accessibility scoring.
 * Presentational/layout components (containers, grids, text wrappers) should NOT be
 * penalized for lacking ARIA/keyboard/focus patterns they don't need.
 *
 * A component is considered interactive if ANY of:
 * - Source has keyboard handling, focus management, or form internals patterns
 * - CEM declares a `disabled` property (implies user interaction)
 * - CEM declares click/interaction events
 * - Source has click event handlers
 */
export function isInteractiveComponent(
  markers: SourceA11yMarkers,
  decl: CemDeclaration,
  source: string,
): boolean {
  // Source-level interactive signals
  if (markers.keyboardHandling || markers.focusManagement || markers.formInternals) return true;

  // CEM-level interactive signals
  const members = decl.members ?? [];
  const events = decl.events ?? [];

  if (members.some((m) => m.kind === 'field' && m.name === 'disabled')) return true;
  if (events.some((e) => /click|press|select|change|input|submit/i.test(e.name))) return true;

  // Source-level click handlers
  if (/@click|addEventListener\s*\(\s*['"]click/i.test(source)) return true;

  return false;
}

/**
 * Analyzes source-level accessibility for a component.
 * Returns null if:
 * - Source file is not available (graceful degradation)
 * - Component is presentational/non-interactive (honest scoring — don't penalize
 *   layout components for lacking a11y patterns they don't need)
 */
export async function analyzeSourceAccessibility(
  config: McpWcConfig,
  cem: Cem,
  decl: CemDeclaration,
): Promise<SourceAccessibilityResult | null> {
  const source = await readComponentSource(config, cem, decl);
  if (!source) return null;

  const markers = scanSourceForA11yPatterns(source);

  // Don't score presentational components — they don't need a11y patterns
  if (!isInteractiveComponent(markers, decl, source)) return null;

  return scoreSourceMarkers(markers);
}
