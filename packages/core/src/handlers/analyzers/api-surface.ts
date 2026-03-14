/**
 * API Surface Quality Analyzer — measures method docs, param descriptions,
 * attribute reflection declarations, and default value documentation.
 */

import type { CemDeclaration } from '../cem.js';
import type { ConfidenceLevel, SubMetric } from '../dimensions.js';

export interface ApiSurfaceResult {
  score: number;
  confidence: ConfidenceLevel;
  subMetrics: SubMetric[];
}

export function analyzeApiSurface(decl: CemDeclaration): ApiSurfaceResult | null {
  const members = decl.members ?? [];

  const methods = members.filter((m) => m.kind === 'method');
  const fields = members.filter((m) => m.kind === 'field');

  // If there's nothing to score, this dimension is not applicable — don't inflate with 100/100
  if (methods.length === 0 && fields.length === 0) {
    return null;
  }

  const subMetrics: SubMetric[] = [];

  // 1. Method documentation completeness (30 points)
  const methodsWithDesc = methods.filter(
    (m) => typeof m.description === 'string' && m.description.trim().length > 0,
  );
  const methodDocScore =
    methods.length === 0 ? 0 : Math.round((methodsWithDesc.length / methods.length) * 30);
  subMetrics.push({
    name: 'Method documentation',
    score: methodDocScore,
    maxScore: 30,
    note: `${methodsWithDesc.length}/${methods.length} methods have descriptions`,
  });

  // 2. Attribute reflection declared (25 points)
  const fieldsWithAttribute = fields.filter(
    (m) => typeof m.attribute === 'string' && m.attribute.length > 0,
  );
  const fieldsReflecting = fields.filter((m) => m.reflects === true);
  const reflectedCount = Math.max(fieldsWithAttribute.length, fieldsReflecting.length);
  const attrScore = fields.length === 0 ? 0 : Math.round((reflectedCount / fields.length) * 25);
  subMetrics.push({
    name: 'Attribute reflection',
    score: attrScore,
    maxScore: 25,
    note: `${reflectedCount}/${fields.length} fields have attribute bindings or reflect`,
  });

  // 3. Default values documented (25 points)
  const fieldsWithDefault = fields.filter(
    (m) => m.default !== undefined && m.default !== null && String(m.default).trim().length > 0,
  );
  const defaultScore =
    fields.length === 0 ? 0 : Math.round((fieldsWithDefault.length / fields.length) * 25);
  subMetrics.push({
    name: 'Default values documented',
    score: defaultScore,
    maxScore: 25,
    note: `${fieldsWithDefault.length}/${fields.length} fields have documented defaults`,
  });

  // 4. Property descriptions (20 points)
  const fieldsWithDesc = fields.filter(
    (m) => typeof m.description === 'string' && m.description.trim().length > 0,
  );
  const propDescScore =
    fields.length === 0 ? 0 : Math.round((fieldsWithDesc.length / fields.length) * 20);
  subMetrics.push({
    name: 'Property descriptions',
    score: propDescScore,
    maxScore: 20,
    note: `${fieldsWithDesc.length}/${fields.length} fields have descriptions`,
  });

  // Scale score proportionally to only the sub-metrics that had data
  const applicableMax = (methods.length > 0 ? 30 : 0) + (fields.length > 0 ? 70 : 0);
  const rawScore = methodDocScore + attrScore + defaultScore + propDescScore;
  const totalScore = applicableMax > 0 ? Math.round((rawScore / applicableMax) * 100) : 0;

  return {
    score: totalScore,
    confidence: 'heuristic',
    subMetrics,
  };
}
