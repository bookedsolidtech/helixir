/**
 * CSS Architecture Analyzer — measures custom property documentation,
 * design token naming patterns, and CSS parts quality.
 */

import type { CemDeclaration } from '../cem.js';
import type { ConfidenceLevel, SubMetric } from '../dimensions.js';

export interface CssArchitectureResult {
  score: number;
  confidence: ConfidenceLevel;
  subMetrics: SubMetric[];
}

export function analyzeCssArchitecture(decl: CemDeclaration): CssArchitectureResult | null {
  const cssProperties = decl.cssProperties ?? [];
  const cssParts = decl.cssParts ?? [];

  // If there's no CSS metadata, this dimension is not applicable — don't inflate with 100/100
  if (cssProperties.length === 0 && cssParts.length === 0) {
    return null;
  }

  const subMetrics: SubMetric[] = [];

  // 1. Custom properties with descriptions (35 points)
  const propsWithDesc = cssProperties.filter(
    (p) => typeof p.description === 'string' && p.description.trim().length > 0,
  );
  const propDescScore =
    cssProperties.length === 0 ? 0 : Math.round((propsWithDesc.length / cssProperties.length) * 35);
  subMetrics.push({
    name: 'CSS property descriptions',
    score: propDescScore,
    maxScore: 35,
    note: `${propsWithDesc.length}/${cssProperties.length} CSS properties have descriptions`,
  });

  // 2. Design token naming patterns (30 points)
  const tokenPattern = /^--[a-z]+-[a-z]/;
  const wellNamedProps = cssProperties.filter((p) => tokenPattern.test(p.name));
  const tokenScore =
    cssProperties.length === 0
      ? 0
      : Math.round((wellNamedProps.length / cssProperties.length) * 30);
  subMetrics.push({
    name: 'Design token naming',
    score: tokenScore,
    maxScore: 30,
    note: `${wellNamedProps.length}/${cssProperties.length} CSS properties follow --prefix-* naming`,
  });

  // 3. CSS parts with descriptions (35 points)
  const partsWithDesc = cssParts.filter(
    (p) => typeof p.description === 'string' && p.description.trim().length > 0,
  );
  const partsScore =
    cssParts.length === 0 ? 0 : Math.round((partsWithDesc.length / cssParts.length) * 35);
  subMetrics.push({
    name: 'CSS parts documentation',
    score: partsScore,
    maxScore: 35,
    note: `${partsWithDesc.length}/${cssParts.length} CSS parts have descriptions`,
  });

  // Scale score proportionally to only the sub-metrics that had data
  const applicableMax = (cssProperties.length > 0 ? 65 : 0) + (cssParts.length > 0 ? 35 : 0);
  const rawScore = propDescScore + tokenScore + partsScore;
  const totalScore = applicableMax > 0 ? Math.round((rawScore / applicableMax) * 100) : 0;

  return {
    score: totalScore,
    confidence: 'heuristic',
    subMetrics,
  };
}
