/**
 * Type Coverage Analyzer — measures type annotation completeness from CEM data.
 *
 * Checks:
 * - Properties with type annotations
 * - Events with typed payloads
 * - Methods with return types
 */

import type { CemDeclaration } from '../cem.js';
import type { ConfidenceLevel, SubMetric } from '../dimensions.js';

export interface TypeCoverageResult {
  score: number;
  confidence: ConfidenceLevel;
  subMetrics: SubMetric[];
}

export function analyzeTypeCoverage(decl: CemDeclaration): TypeCoverageResult {
  const members = decl.members ?? [];
  const events = decl.events ?? [];
  const subMetrics: SubMetric[] = [];

  // 1. Properties with type annotations (40 points)
  const fields = members.filter((m) => m.kind === 'field');
  const fieldsWithType = fields.filter(
    (m) => m.type && m.type.text && m.type.text.trim().length > 0,
  );
  const propScore =
    fields.length === 0 ? 40 : Math.round((fieldsWithType.length / fields.length) * 40);
  subMetrics.push({
    name: 'Property type annotations',
    score: propScore,
    maxScore: 40,
    note: `${fieldsWithType.length}/${fields.length} properties have type annotations`,
  });

  // 2. Events with typed payloads (35 points)
  const eventsWithType = events.filter(
    (e) => e.type && e.type.text && e.type.text.trim().length > 0 && e.type.text !== 'Event',
  );
  const eventScore =
    events.length === 0 ? 35 : Math.round((eventsWithType.length / events.length) * 35);
  subMetrics.push({
    name: 'Event typed payloads',
    score: eventScore,
    maxScore: 35,
    note: `${eventsWithType.length}/${events.length} events have typed payloads (not bare Event)`,
  });

  // 3. Methods with return types (25 points)
  const methods = members.filter((m) => m.kind === 'method');
  const methodsWithReturn = methods.filter(
    (m) => m.return && m.return.type && m.return.type.text && m.return.type.text.trim().length > 0,
  );
  const methodScore =
    methods.length === 0 ? 25 : Math.round((methodsWithReturn.length / methods.length) * 25);
  subMetrics.push({
    name: 'Method return types',
    score: methodScore,
    maxScore: 25,
    note: `${methodsWithReturn.length}/${methods.length} methods have return type annotations`,
  });

  const totalScore = propScore + eventScore + methodScore;

  return {
    score: totalScore,
    confidence: 'verified',
    subMetrics,
  };
}
