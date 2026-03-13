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

export function analyzeCssArchitecture(decl: CemDeclaration): CssArchitectureResult {
  const cssProperties = decl.cssProperties ?? [];
  const cssParts = decl.cssParts ?? [];
  const subMetrics: SubMetric[] = [];

  // 1. Custom properties with descriptions (35 points)
  const propsWithDesc = cssProperties.filter(
    (p) => typeof p.description === 'string' && p.description.trim().length > 0,
  );
  const propDescScore =
    cssProperties.length === 0
      ? 35
      : Math.round((propsWithDesc.length / cssProperties.length) * 35);
  subMetrics.push({
    name: 'CSS property descriptions',
    score: propDescScore,
    maxScore: 35,
    note: `${propsWithDesc.length}/${cssProperties.length} CSS properties have descriptions`,
  });

  // 2. Design token naming patterns (30 points)
  // Check for consistent --prefix-* naming (e.g., --hx-button-*)
  const tokenPattern = /^--[a-z]+-[a-z]/;
  const wellNamedProps = cssProperties.filter((p) => tokenPattern.test(p.name));
  const tokenScore =
    cssProperties.length === 0
      ? 30
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
    cssParts.length === 0 ? 35 : Math.round((partsWithDesc.length / cssParts.length) * 35);
  subMetrics.push({
    name: 'CSS parts documentation',
    score: partsScore,
    maxScore: 35,
    note: `${partsWithDesc.length}/${cssParts.length} CSS parts have descriptions`,
  });

  const totalScore = propDescScore + tokenScore + partsScore;

  return {
    score: totalScore,
    confidence: 'heuristic',
    subMetrics,
  };
}
