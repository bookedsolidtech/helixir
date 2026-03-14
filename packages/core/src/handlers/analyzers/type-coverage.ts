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

export function analyzeTypeCoverage(decl: CemDeclaration): TypeCoverageResult | null {
  const members = decl.members ?? [];
  const events = decl.events ?? [];

  // 1. Collect data counts
  const fields = members.filter((m) => m.kind === 'field');
  const methods = members.filter((m) => m.kind === 'method');

  // If there's nothing to score, this dimension is not applicable — don't inflate with 100/100
  if (fields.length === 0 && events.length === 0 && methods.length === 0) {
    return null;
  }

  const subMetrics: SubMetric[] = [];

  // 2. Properties with type annotations (40 points)
  const fieldsWithType = fields.filter(
    (m) => m.type && m.type.text && m.type.text.trim().length > 0,
  );
  const propScore =
    fields.length === 0 ? 0 : Math.round((fieldsWithType.length / fields.length) * 40);
  subMetrics.push({
    name: 'Property type annotations',
    score: propScore,
    maxScore: 40,
    note: `${fieldsWithType.length}/${fields.length} properties have type annotations`,
  });

  // 3. Events with typed payloads (35 points)
  const eventsWithType = events.filter(
    (e) => e.type && e.type.text && e.type.text.trim().length > 0 && e.type.text !== 'Event',
  );
  const eventScore =
    events.length === 0 ? 0 : Math.round((eventsWithType.length / events.length) * 35);
  subMetrics.push({
    name: 'Event typed payloads',
    score: eventScore,
    maxScore: 35,
    note: `${eventsWithType.length}/${events.length} events have typed payloads (not bare Event)`,
  });

  // 4. Methods with return types (25 points)
  const methodsWithReturn = methods.filter(
    (m) => m.return && m.return.type && m.return.type.text && m.return.type.text.trim().length > 0,
  );
  const methodScore =
    methods.length === 0 ? 0 : Math.round((methodsWithReturn.length / methods.length) * 25);
  subMetrics.push({
    name: 'Method return types',
    score: methodScore,
    maxScore: 25,
    note: `${methodsWithReturn.length}/${methods.length} methods have return type annotations`,
  });

  // Scale score proportionally to only the sub-metrics that had data
  const applicableMax =
    (fields.length > 0 ? 40 : 0) + (events.length > 0 ? 35 : 0) + (methods.length > 0 ? 25 : 0);
  const rawScore = propScore + eventScore + methodScore;
  const totalScore = applicableMax > 0 ? Math.round((rawScore / applicableMax) * 100) : 0;

  return {
    score: totalScore,
    confidence: 'verified',
    subMetrics,
  };
}
