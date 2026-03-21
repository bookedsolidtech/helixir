/**
 * CSS Architecture Analyzer — measures custom property documentation,
 * design token naming patterns, CSS parts quality, and Shadow DOM theming quality.
 */

import type { CemDeclaration } from '../cem.js';
import type { ConfidenceLevel, SubMetric } from '../dimensions.js';

export interface CssArchitectureResult {
  score: number;
  confidence: ConfidenceLevel;
  subMetrics: SubMetric[];
}

/** Theming categories expected in a well-rounded component */
const THEMING_CATEGORIES: Array<{ name: string; patterns: RegExp[] }> = [
  { name: 'color', patterns: [/color/, /background/, /fill/, /stroke/] },
  { name: 'spacing', patterns: [/spacing/, /padding/, /margin/, /gap/] },
  { name: 'typography', patterns: [/font/, /text/, /line-height/, /letter-spacing/] },
  { name: 'border', patterns: [/border/, /radius/, /outline/] },
];

export function analyzeCssArchitecture(decl: CemDeclaration): CssArchitectureResult | null {
  const cssProperties = decl.cssProperties ?? [];
  const cssParts = decl.cssParts ?? [];

  // If there's no CSS metadata, this dimension is not applicable — don't inflate with 100/100
  if (cssProperties.length === 0 && cssParts.length === 0) {
    return null;
  }

  const subMetrics: SubMetric[] = [];

  // 1. Custom properties with descriptions (25 points, was 35)
  const propsWithDesc = cssProperties.filter(
    (p) => typeof p.description === 'string' && p.description.trim().length > 0,
  );
  const propDescScore =
    cssProperties.length === 0 ? 0 : Math.round((propsWithDesc.length / cssProperties.length) * 25);
  subMetrics.push({
    name: 'CSS property descriptions',
    score: propDescScore,
    maxScore: 25,
    note: `${propsWithDesc.length}/${cssProperties.length} CSS properties have descriptions`,
  });

  // 2. Design token naming patterns (20 points, was 30)
  const tokenPattern = /^--[a-z]+-[a-z]/;
  const wellNamedProps = cssProperties.filter((p) => tokenPattern.test(p.name));
  const tokenScore =
    cssProperties.length === 0
      ? 0
      : Math.round((wellNamedProps.length / cssProperties.length) * 20);
  subMetrics.push({
    name: 'Design token naming',
    score: tokenScore,
    maxScore: 20,
    note: `${wellNamedProps.length}/${cssProperties.length} CSS properties follow --prefix-* naming`,
  });

  // 3. CSS parts with descriptions (25 points, was 35)
  const partsWithDesc = cssParts.filter(
    (p) => typeof p.description === 'string' && p.description.trim().length > 0,
  );
  const partsScore =
    cssParts.length === 0 ? 0 : Math.round((partsWithDesc.length / cssParts.length) * 25);
  subMetrics.push({
    name: 'CSS parts documentation',
    score: partsScore,
    maxScore: 25,
    note: `${partsWithDesc.length}/${cssParts.length} CSS parts have descriptions`,
  });

  // 4. CSS parts coverage ratio (15 points, new)
  // Heuristic: estimate expected internal elements from slot count + member (field) count
  const slots = decl.slots ?? [];
  const members = decl.members ?? [];
  const fieldCount = members.filter((m) => m.kind === 'field').length;
  const estimatedInternalElements = Math.max(1, slots.length + Math.ceil(fieldCount / 3));
  const partsCoverageRatio = Math.min(1, cssParts.length / estimatedInternalElements);
  const partsCoverageScore = Math.round(partsCoverageRatio * 15);
  subMetrics.push({
    name: 'CSS parts coverage ratio',
    score: partsCoverageScore,
    maxScore: 15,
    note: `${cssParts.length} parts exposed vs ~${estimatedInternalElements} estimated internal elements`,
  });

  // 5. Token namespace consistency (15 points, new)
  // All CSS properties share a common prefix pattern (e.g., all start with --sl-)
  let namespaceScore = 0;
  if (cssProperties.length === 0) {
    namespaceScore = 0;
  } else if (cssProperties.length === 1) {
    // A single property is consistent by definition if it follows token naming
    const singleProp = cssProperties[0];
    namespaceScore = singleProp !== undefined && tokenPattern.test(singleProp.name) ? 15 : 0;
  } else {
    // Extract the prefix (everything up to the second hyphen-separated segment)
    const prefixPattern = /^(--[a-z]+-)/;
    const prefixes = cssProperties
      .map((p) => {
        const match = prefixPattern.exec(p.name);
        return match ? (match[1] ?? null) : null;
      })
      .filter((p): p is string => p !== null);

    if (prefixes.length === 0) {
      namespaceScore = 0;
    } else {
      // Find the most common prefix
      const prefixCounts = new Map<string, number>();
      for (const prefix of prefixes) {
        prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
      }
      const maxCount = Math.max(...prefixCounts.values());
      const consistencyRatio = maxCount / cssProperties.length;
      if (consistencyRatio >= 0.5) {
        namespaceScore = Math.round(consistencyRatio * 15);
      }
    }
  }
  const detectedPrefixes = detectNamespacePrefixes(cssProperties);
  subMetrics.push({
    name: 'Token namespace consistency',
    score: namespaceScore,
    maxScore: 15,
    note:
      detectedPrefixes.length > 0
        ? `Detected prefix(es): ${detectedPrefixes.join(', ')}`
        : 'No consistent namespace prefix detected',
  });

  // 6. Theming completeness (15 points, new)
  // Components with CSS properties should cover common theming categories
  let themingScore = 0;
  const propertyNames = cssProperties.map((p) => p.name.toLowerCase());
  if (cssProperties.length > 0) {
    const coveredCategories = THEMING_CATEGORIES.filter(({ patterns }) =>
      patterns.some((pattern) => propertyNames.some((name) => pattern.test(name))),
    );
    const coverageRatio = coveredCategories.length / THEMING_CATEGORIES.length;
    themingScore = Math.round(coverageRatio * 15);
  }
  const coveredCategoryNames = THEMING_CATEGORIES.filter(({ patterns }) =>
    patterns.some((pattern) => propertyNames.some((name) => pattern.test(name))),
  ).map(({ name }) => name);
  subMetrics.push({
    name: 'Theming completeness',
    score: themingScore,
    maxScore: 15,
    note:
      coveredCategoryNames.length > 0
        ? `Covers: ${coveredCategoryNames.join(', ')}`
        : 'No standard theming categories (color, spacing, typography, border) detected',
  });

  // Scale score proportionally to only the sub-metrics that had data
  // Base applicable max: metrics 1-2 require cssProperties, metric 3 requires cssParts
  // Metrics 4-6 are always applicable when either exists (since we entered this function)
  const hasProps = cssProperties.length > 0;
  const hasParts = cssParts.length > 0;

  const applicableMax =
    (hasProps ? 25 + 20 : 0) + // prop desc + token naming
    (hasParts ? 25 : 0) + // parts doc
    15 + // parts coverage ratio (always applicable)
    (hasProps ? 15 : 0) + // namespace consistency (only meaningful with props)
    (hasProps ? 15 : 0); // theming completeness (only meaningful with props)

  const rawScore =
    propDescScore + tokenScore + partsScore + partsCoverageScore + namespaceScore + themingScore;
  const totalScore = applicableMax > 0 ? Math.round((rawScore / applicableMax) * 100) : 0;

  return {
    score: totalScore,
    confidence: 'heuristic',
    subMetrics,
  };
}

function detectNamespacePrefixes(cssProperties: Array<{ name: string }>): string[] {
  const prefixPattern = /^(--[a-z]+-)/;
  const prefixCounts = new Map<string, number>();
  for (const prop of cssProperties) {
    const match = prefixPattern.exec(prop.name);
    if (match) {
      const prefix = match[1] ?? '';
      if (prefix) {
        prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
      }
    }
  }
  // Return prefixes that appear in at least half the properties
  const threshold = Math.max(1, Math.ceil(cssProperties.length / 2));
  return Array.from(prefixCounts.entries())
    .filter(([, count]) => count >= threshold)
    .map(([prefix]) => prefix);
}
