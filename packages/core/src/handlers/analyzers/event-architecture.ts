/**
 * Event Architecture Analyzer — measures event naming conventions,
 * typed payloads, and event description quality.
 */

import type { CemDeclaration } from '../cem.js';
import type { ConfidenceLevel, SubMetric } from '../dimensions.js';

export interface EventArchitectureResult {
  score: number;
  confidence: ConfidenceLevel;
  subMetrics: SubMetric[];
}

/**
 * Tests whether a string follows kebab-case convention.
 * Examples: "value-change", "menu-open", "item-selected"
 */
function isKebabCase(name: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
}

export function analyzeEventArchitecture(decl: CemDeclaration): EventArchitectureResult {
  const events = decl.events ?? [];
  const subMetrics: SubMetric[] = [];

  // 1. Event naming conventions — kebab-case (35 points)
  const kebabEvents = events.filter((e) => isKebabCase(e.name));
  const namingScore =
    events.length === 0 ? 35 : Math.round((kebabEvents.length / events.length) * 35);
  subMetrics.push({
    name: 'Kebab-case naming',
    score: namingScore,
    maxScore: 35,
    note: `${kebabEvents.length}/${events.length} events use kebab-case naming`,
  });

  // 2. Typed payloads (35 points)
  const eventsWithType = events.filter(
    (e) => e.type && e.type.text && e.type.text.trim().length > 0 && e.type.text !== 'Event',
  );
  const typeScore =
    events.length === 0 ? 35 : Math.round((eventsWithType.length / events.length) * 35);
  subMetrics.push({
    name: 'Typed event payloads',
    score: typeScore,
    maxScore: 35,
    note: `${eventsWithType.length}/${events.length} events have typed payloads`,
  });

  // 3. Event descriptions (30 points)
  const eventsWithDesc = events.filter(
    (e) => typeof e.description === 'string' && e.description.trim().length > 0,
  );
  const descScore =
    events.length === 0 ? 30 : Math.round((eventsWithDesc.length / events.length) * 30);
  subMetrics.push({
    name: 'Event descriptions',
    score: descScore,
    maxScore: 30,
    note: `${eventsWithDesc.length}/${events.length} events have descriptions`,
  });

  const totalScore = namingScore + typeScore + descScore;

  return {
    score: totalScore,
    confidence: 'heuristic',
    subMetrics,
  };
}
