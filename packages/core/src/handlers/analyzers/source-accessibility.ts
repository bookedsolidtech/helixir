/**
 * Source-Level Accessibility Scanner — regex-based analysis of component
 * source files to detect real accessibility implementations (ARIA bindings,
 * keyboard handlers, focus management, form internals, live regions).
 *
 * Two scanning modes:
 *   1. Single-file scan (Phase 2) — fast, reads only the component's own file
 *   2. Deep chain scan (Phase 3) — follows CEM superclass/mixin declarations
 *      and source imports to scan the full inheritance chain
 *
 * Zero new dependencies. Works with ANY web component framework (Lit, FAST,
 * Stencil, vanilla) by scanning for framework-agnostic patterns.
 */

import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';
import type { McpWcConfig } from '../../config.js';
import type { Cem, CemDeclaration } from '../cem.js';
import { getDeclarationSourcePath } from '../cem.js';
import type { SubMetric } from '../dimensions.js';
import { resolveInheritanceChain } from './mixin-resolver.js';

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

export interface DeepSourceAccessibilityResult extends SourceAccessibilityResult {
  /** Number of source files scanned in the inheritance chain */
  chainDepth: number;
  /** Architecture style detected */
  architecture: 'inline' | 'mixin-heavy' | 'controller-based' | 'hybrid';
  /** Names of mixins/superclasses that contributed to the score */
  contributors: string[];
  /** Names of mixins/superclasses that could not be resolved */
  unresolved: string[];
  /** Per-source breakdown showing which file contributed which patterns */
  sourceBreakdown: Array<{
    name: string;
    type: 'component' | 'superclass' | 'mixin' | 'import';
    categories: string[];
  }>;
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
 * Resolves the source file path for a component using multiple strategies.
 * Returns the absolute path to the source file, or null if not found.
 */
export function resolveComponentSourceFilePath(
  projectRoot: string,
  modulePath: string,
): string | null {
  const baseName = modulePath.replace(/\.js$/, '');

  const candidates = [
    resolve(projectRoot, baseName + '.ts'),
    resolve(projectRoot, modulePath),
    resolve(projectRoot, 'src', baseName + '.component.ts'),
    resolve(projectRoot, 'src', baseName + '.ts'),
    resolve(projectRoot, 'src', modulePath),
  ];

  const resolvedRoot = resolve(projectRoot);
  for (const candidate of candidates) {
    if (!candidate.startsWith(resolvedRoot + sep)) continue;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolves and reads the source file for a component.
 * Tries multiple resolution strategies to find real source:
 *   1. Direct path with .ts extension
 *   2. Direct path as-is (.js)
 *   3. src/ prefix + .component.ts (Shoelace convention)
 *   4. src/ prefix with .ts
 *   5. src/ prefix with .js
 */
async function readComponentSource(
  config: McpWcConfig,
  cem: Cem,
  decl: CemDeclaration,
): Promise<{ content: string; filePath: string } | null> {
  const tagName = decl.tagName;
  if (!tagName) return null;

  const modulePath = getDeclarationSourcePath(cem, tagName);
  if (!modulePath) return null;

  const filePath = resolveComponentSourceFilePath(config.projectRoot, modulePath);
  if (!filePath) return null;

  const content = await tryReadFile(filePath);
  if (!content) return null;

  return { content, filePath };
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
 * Analyzes source-level accessibility for a component (single-file mode).
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
  const result = await readComponentSource(config, cem, decl);
  if (!result) return null;

  const markers = scanSourceForA11yPatterns(result.content);

  // Don't score presentational components — they don't need a11y patterns
  if (!isInteractiveComponent(markers, decl, result.content)) return null;

  return scoreSourceMarkers(markers);
}

/**
 * Deep source-level accessibility analysis — follows the full inheritance chain
 * (superclass, mixins, a11y-relevant imports) to score accessibility patterns
 * across ALL source files that contribute to a component's behavior.
 *
 * This mode solves the blind spot where libraries like Lion and Vaadin implement
 * accessibility in shared mixins/base classes rather than in each component file.
 *
 * Returns null if:
 * - Source file is not available
 * - Component is presentational/non-interactive
 */
export async function analyzeSourceAccessibilityDeep(
  config: McpWcConfig,
  cem: Cem,
  decl: CemDeclaration,
): Promise<DeepSourceAccessibilityResult | null> {
  const result = await readComponentSource(config, cem, decl);
  if (!result) return null;

  // Resolve the full inheritance chain
  const chain = await resolveInheritanceChain(
    result.content,
    result.filePath,
    decl,
    config.projectRoot,
  );

  // Use aggregated markers for interactivity check (chain-aware)
  if (!isInteractiveComponent(chain.aggregatedMarkers, decl, result.content)) return null;

  // Score using aggregated markers from the full chain
  const scored = scoreSourceMarkers(chain.aggregatedMarkers);

  // Build per-source breakdown
  const sourceBreakdown = chain.sources.map((s) => ({
    name: s.name,
    type: s.type,
    categories: Object.entries(s.markers)
      .filter(([, v]) => v)
      .map(([k]) => WEIGHTS[k as keyof SourceA11yMarkers]?.label ?? k),
  }));

  // Contributors = sources that actually had at least one a11y pattern
  const contributors = chain.sources
    .filter((s) => s.type !== 'component' && Object.values(s.markers).some(Boolean))
    .map((s) => s.name);

  // Enhance sub-metric notes with chain info
  const enhancedSubMetrics = scored.subMetrics.map((m) => {
    const markerKey = Object.keys(WEIGHTS).find(
      (k) => WEIGHTS[k as keyof SourceA11yMarkers].label === m.name.replace('[Source] ', ''),
    ) as keyof SourceA11yMarkers | undefined;

    if (!markerKey || m.score === 0) return m;

    // Find which sources contributed this pattern
    const contributingSources = chain.sources
      .filter((s) => s.markers[markerKey])
      .map((s) => `${s.name} (${s.type})`);

    return {
      ...m,
      note: `Found in: ${contributingSources.join(', ')}`,
    };
  });

  return {
    score: scored.score,
    confidence: 'heuristic',
    subMetrics: enhancedSubMetrics,
    chainDepth: chain.resolvedCount,
    architecture: chain.architecture,
    contributors,
    unresolved: chain.unresolved,
    sourceBreakdown,
  };
}
