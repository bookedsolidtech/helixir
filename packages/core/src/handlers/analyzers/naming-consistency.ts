/**
 * Naming Consistency Analyzer — measures library-wide naming convention adherence.
 *
 * Operates at library level: conventions are detected from the full set of declarations,
 * then each component is scored against those conventions.
 *
 * Scoring model (100 points):
 *   1. Event prefix coherence       (30 points)
 *   2. Property naming consistency   (25 points)
 *   3. CSS custom property prefixing (25 points)
 *   4. Attribute-property coherence  (20 points)
 */

import type { CemDeclaration } from '../cem.js';
import type { ConfidenceLevel, SubMetric } from '../dimensions.js';

export interface NamingConsistencyResult {
  score: number;
  confidence: ConfidenceLevel;
  subMetrics: SubMetric[];
}

export interface LibraryNamingConventions {
  eventPrefix: string | null;
  eventPrefixConfidence: number;
  cssPrefix: string | null;
  cssPrefixConfidence: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isCamelCase(name: string): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(name);
}

function isSnakeCase(name: string): boolean {
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name);
}

/**
 * Converts a camelCase property name to its expected kebab-case attribute.
 * e.g. "maxLength" → "max-length", "disabled" → "disabled"
 */
function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/**
 * Detects the most common prefix from a list of strings.
 * Returns the prefix and a confidence score (0-1) indicating how dominant it is.
 */
function detectPrefix(
  names: string[],
  separator: string,
): { prefix: string | null; confidence: number } {
  if (names.length === 0) return { prefix: null, confidence: 0 };

  // Extract potential prefixes (everything before the first separator occurrence after initial segment)
  const prefixCounts = new Map<string, number>();
  for (const name of names) {
    const sepIndex = name.indexOf(separator, 1);
    if (sepIndex > 0) {
      const prefix = name.substring(0, sepIndex + separator.length);
      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }
  }

  if (prefixCounts.size === 0) return { prefix: null, confidence: 0 };

  // Find the dominant prefix
  let bestPrefix = '';
  let bestCount = 0;
  for (const [prefix, count] of prefixCounts) {
    if (count > bestCount) {
      bestPrefix = prefix;
      bestCount = count;
    }
  }

  const confidence = bestCount / names.length;

  // Only consider it a real pattern if at least 50% of names follow it
  if (confidence < 0.5) return { prefix: null, confidence };

  return { prefix: bestPrefix, confidence };
}

// ─── Library-Level Detection ────────────────────────────────────────────────

/**
 * Detects the library-wide event prefix pattern by analyzing all declarations.
 * e.g., "hx-" for helix, "sl-" for Shoelace, "md-" for Material Web.
 */
export function detectLibraryEventPrefix(declarations: CemDeclaration[]): {
  prefix: string | null;
  confidence: number;
} {
  const allEventNames: string[] = [];
  for (const decl of declarations) {
    for (const event of decl.events ?? []) {
      if (event.name) allEventNames.push(event.name);
    }
  }
  return detectPrefix(allEventNames, '-');
}

/**
 * Detects the library-wide CSS custom property prefix pattern.
 * e.g., "--hx-" for helix, "--sl-" for Shoelace.
 */
export function detectLibraryCssPrefix(declarations: CemDeclaration[]): {
  prefix: string | null;
  confidence: number;
} {
  const allCssNames: string[] = [];
  for (const decl of declarations) {
    for (const prop of decl.cssProperties ?? []) {
      if (prop.name) allCssNames.push(prop.name);
    }
  }

  // CSS custom properties start with --, so detect the prefix after --
  if (allCssNames.length === 0) return { prefix: null, confidence: 0 };

  // Strip leading -- and detect prefix with - separator, then re-add --
  const stripped = allCssNames.map((n) => (n.startsWith('--') ? n.substring(2) : n));
  const result = detectPrefix(stripped, '-');
  if (result.prefix) {
    result.prefix = `--${result.prefix}`;
  }
  return result;
}

/**
 * Detects library-wide naming conventions from all declarations.
 */
export function detectLibraryConventions(declarations: CemDeclaration[]): LibraryNamingConventions {
  const eventResult = detectLibraryEventPrefix(declarations);
  const cssResult = detectLibraryCssPrefix(declarations);
  return {
    eventPrefix: eventResult.prefix,
    eventPrefixConfidence: eventResult.confidence,
    cssPrefix: cssResult.prefix,
    cssPrefixConfidence: cssResult.confidence,
  };
}

// ─── Per-Component Scoring ──────────────────────────────────────────────────

/**
 * Scores event prefix coherence for a single component (30 points).
 * Components with no events are excluded from scoring.
 */
export function scoreEventPrefixCoherence(
  decl: CemDeclaration,
  expectedPrefix: string | null,
): { score: number; subMetric: SubMetric } | null {
  const events = decl.events ?? [];
  if (events.length === 0) return null;

  if (!expectedPrefix) {
    // No library prefix detected — give full marks (can't penalize for ambiguity)
    return {
      score: 30,
      subMetric: {
        name: 'Event prefix coherence',
        score: 30,
        maxScore: 30,
        note: 'No library event prefix detected — not scored',
      },
    };
  }

  const matching = events.filter((e) => e.name.startsWith(expectedPrefix));
  const score = Math.round((matching.length / events.length) * 30);

  return {
    score,
    subMetric: {
      name: 'Event prefix coherence',
      score,
      maxScore: 30,
      note: `${matching.length}/${events.length} events use prefix "${expectedPrefix}"`,
    },
  };
}

/**
 * Scores property naming consistency (25 points).
 * All public properties should use camelCase consistently.
 */
export function scorePropertyNamingConsistency(decl: CemDeclaration): {
  score: number;
  subMetric: SubMetric;
} {
  const fields = (decl.members ?? []).filter((m) => m.kind === 'field');

  if (fields.length === 0) {
    return {
      score: 25,
      subMetric: {
        name: 'Property naming consistency',
        score: 25,
        maxScore: 25,
        note: 'No properties — trivially consistent',
      },
    };
  }

  const camelCaseFields = fields.filter((f) => isCamelCase(f.name));
  const snakeCaseFields = fields.filter((f) => isSnakeCase(f.name));

  // Detect dominant convention: if the library uses snake_case consistently, that's also fine
  const dominantIsCamel = camelCaseFields.length >= snakeCaseFields.length;
  const consistentCount = dominantIsCamel ? camelCaseFields.length : snakeCaseFields.length;
  const convention = dominantIsCamel ? 'camelCase' : 'snake_case';

  const score = Math.round((consistentCount / fields.length) * 25);

  return {
    score,
    subMetric: {
      name: 'Property naming consistency',
      score,
      maxScore: 25,
      note: `${consistentCount}/${fields.length} properties use ${convention}`,
    },
  };
}

/**
 * Scores CSS custom property prefix consistency (25 points).
 * Components with no CSS custom properties are excluded.
 */
export function scoreCSSCustomPropertyPrefixing(
  decl: CemDeclaration,
  expectedPrefix: string | null,
): { score: number; subMetric: SubMetric } | null {
  const cssProperties = decl.cssProperties ?? [];
  if (cssProperties.length === 0) return null;

  if (!expectedPrefix) {
    return {
      score: 25,
      subMetric: {
        name: 'CSS custom property prefixing',
        score: 25,
        maxScore: 25,
        note: 'No library CSS prefix detected — not scored',
      },
    };
  }

  const matching = cssProperties.filter((p) => p.name.startsWith(expectedPrefix));
  const score = Math.round((matching.length / cssProperties.length) * 25);

  return {
    score,
    subMetric: {
      name: 'CSS custom property prefixing',
      score,
      maxScore: 25,
      note: `${matching.length}/${cssProperties.length} CSS properties use prefix "${expectedPrefix}"`,
    },
  };
}

/**
 * Scores attribute-property naming coherence (20 points).
 * Attributes should be kebab-case versions of their camelCase property names.
 */
export function scoreAttributePropertyCoherence(decl: CemDeclaration): {
  score: number;
  subMetric: SubMetric;
} {
  const fieldsWithAttributes = (decl.members ?? []).filter(
    (m) => m.kind === 'field' && typeof m.attribute === 'string' && m.attribute.length > 0,
  );

  if (fieldsWithAttributes.length === 0) {
    return {
      score: 20,
      subMetric: {
        name: 'Attribute-property coherence',
        score: 20,
        maxScore: 20,
        note: 'No attribute-mapped properties — trivially coherent',
      },
    };
  }

  let coherentCount = 0;
  for (const field of fieldsWithAttributes) {
    const expectedAttribute = camelToKebab(field.name);
    const actualAttribute = field.attribute as string;

    // Match if attribute is the kebab-case form of the property name,
    // or if both are already the same (single-word properties like "disabled")
    if (actualAttribute === expectedAttribute || actualAttribute === field.name) {
      coherentCount++;
    }
  }

  const score = Math.round((coherentCount / fieldsWithAttributes.length) * 20);

  return {
    score,
    subMetric: {
      name: 'Attribute-property coherence',
      score,
      maxScore: 20,
      note: `${coherentCount}/${fieldsWithAttributes.length} attribute mappings follow naming conventions`,
    },
  };
}

// ─── Main Analyzer ──────────────────────────────────────────────────────────

/**
 * Analyzes naming consistency for a single component against library-wide conventions.
 *
 * @param decl - The component declaration to score.
 * @param conventions - Pre-detected library-wide naming conventions.
 */
export function analyzeNamingConsistency(
  decl: CemDeclaration,
  conventions: LibraryNamingConventions,
): NamingConsistencyResult | null {
  const subMetrics: SubMetric[] = [];
  let totalScore = 0;
  let maxPossible = 0;

  // 1. Event prefix coherence (30 points)
  const eventResult = scoreEventPrefixCoherence(decl, conventions.eventPrefix);
  if (eventResult) {
    subMetrics.push(eventResult.subMetric);
    totalScore += eventResult.score;
    maxPossible += 30;
  }

  // 2. Property naming consistency (25 points)
  const propResult = scorePropertyNamingConsistency(decl);
  subMetrics.push(propResult.subMetric);
  totalScore += propResult.score;
  maxPossible += 25;

  // 3. CSS custom property prefixing (25 points)
  const cssResult = scoreCSSCustomPropertyPrefixing(decl, conventions.cssPrefix);
  if (cssResult) {
    subMetrics.push(cssResult.subMetric);
    totalScore += cssResult.score;
    maxPossible += 25;
  }

  // 4. Attribute-property coherence (20 points)
  const attrResult = scoreAttributePropertyCoherence(decl);
  subMetrics.push(attrResult.subMetric);
  totalScore += attrResult.score;
  maxPossible += 20;

  // If only property + attribute scored (no events, no CSS), we still have
  // meaningful data (45 points max). Normalize to 0-100.
  if (maxPossible === 0) return null;

  const normalizedScore = Math.round((totalScore / maxPossible) * 100);

  // Determine confidence based on how much prefix data we have
  const confidence: ConfidenceLevel =
    conventions.eventPrefixConfidence > 0.7 || conventions.cssPrefixConfidence > 0.7
      ? 'verified'
      : conventions.eventPrefixConfidence > 0 || conventions.cssPrefixConfidence > 0
        ? 'heuristic'
        : 'verified'; // If no prefix to detect, pure naming analysis is still verified

  return {
    score: normalizedScore,
    confidence,
    subMetrics,
  };
}
