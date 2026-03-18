/**
 * Slot Architecture Analyzer — measures slot documentation quality,
 * default slot presence, type constraints, and slot-property coherence.
 *
 * Scoring model (100 points):
 *   - Default slot documentation: 25 points (15 presence + 10 description)
 *   - Named slot documentation:   30 points (proportional to documented/total)
 *   - Slot type constraints:      20 points (slots with type info / total slots)
 *   - Slot-property coherence:    25 points (coherent pairs / total pairs)
 *
 * Returns null for components with no slots (presentational/leaf components).
 */

import type { CemDeclaration } from '../cem.js';
import type { ConfidenceLevel, SubMetric } from '../dimensions.js';

export interface SlotAnalysis {
  name: string;
  isDefault: boolean;
  hasDescription: boolean;
  hasTypeConstraint: boolean;
  matchingProperty: string | null;
}

export interface CoherencePair {
  slotName: string;
  propertyName: string;
  slotDocumented: boolean;
  propertyDocumented: boolean;
  coherent: boolean;
}

export interface SlotArchitectureResult {
  score: number;
  confidence: ConfidenceLevel;
  subMetrics: SubMetric[];
  slots: SlotAnalysis[];
  coherencePairs: CoherencePair[];
}

/**
 * Common slot names that often have matching properties.
 * Used for coherence pair detection.
 */
const COHERENCE_SLOT_PATTERNS = [
  'label',
  'icon',
  'header',
  'footer',
  'prefix',
  'suffix',
  'action',
  'actions',
  'trigger',
  'content',
  'description',
  'title',
  'subtitle',
  'headline',
  'leading',
  'trailing',
  'start',
  'end',
  'media',
  'avatar',
  'badge',
  'caption',
  'helper-text',
  'error-text',
  'supporting-text',
];

/**
 * Reserved/lifecycle property names to skip for coherence pairing.
 * These don't represent content composition patterns.
 */
const RESERVED_NAMES = new Set(['class', 'ref', 'style', 'id', 'slot', 'is']);

/**
 * Detects whether a slot has type constraint information.
 * Checks slot description and component-level JSDoc @slot annotations for element type mentions.
 */
function hasTypeConstraint(slotName: string, slotDescription: string, decl: CemDeclaration): boolean {
  // Check slot description for element type mentions
  if (slotDescription) {
    // Patterns like "<sp-icon>", "HTMLElement", "button element", "img elements"
    if (/<[a-z][\w-]*>/i.test(slotDescription)) return true;
    if (/\b(HTML\w*Element|Element)\b/.test(slotDescription)) return true;
    if (/\b(element|elements|tag|tags|component|components)\b/i.test(slotDescription)) return true;
  }

  // Check JSDoc @slot annotations in component description (fallback per deviation rule)
  const description = decl.description ?? '';
  const slotAnnotationRegex = new RegExp(
    `@slot\\s+${slotName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^\\n]*`,
    'i',
  );
  const match = description.match(slotAnnotationRegex);
  if (match) {
    const annotation = match[0];
    if (/<[a-z][\w-]*>/i.test(annotation)) return true;
    if (/\b(HTML\w*Element|Element)\b/.test(annotation)) return true;
    if (/\b(element|elements|tag|tags|component|components)\b/i.test(annotation)) return true;
  }

  // Check jsdocTags for @slot annotations
  const jsdocTags = decl.jsdocTags ?? [];
  for (const tag of jsdocTags) {
    if (tag.name !== 'slot') continue;
    const tagDesc = tag.description ?? '';
    // Match tag that references this slot name
    if (tagDesc.includes(slotName) || (slotName === '' && tagDesc.includes('default'))) {
      if (/<[a-z][\w-]*>/i.test(tagDesc)) return true;
      if (/\b(HTML\w*Element|Element)\b/.test(tagDesc)) return true;
      if (/\b(element|elements|tag|tags|component|components)\b/i.test(tagDesc)) return true;
    }
  }

  return false;
}

export function analyzeSlotArchitecture(decl: CemDeclaration): SlotArchitectureResult | null {
  const slots = decl.slots ?? [];

  // Return null for slot-less components — honest scoring, not zero
  if (slots.length === 0) {
    return null;
  }

  const subMetrics: SubMetric[] = [];
  const slotAnalyses: SlotAnalysis[] = [];
  const coherencePairs: CoherencePair[] = [];

  // Build property map for coherence detection
  const fields = (decl.members ?? []).filter((m) => m.kind === 'field');
  const propertyNames = new Map<string, boolean>();
  for (const field of fields) {
    const hasDesc =
      typeof field.description === 'string' && field.description.trim().length > 0;
    propertyNames.set(field.name, hasDesc);
  }

  // Analyze each slot
  const defaultSlot = slots.find((s) => s.name === '' || s.name === 'default');
  const namedSlots = slots.filter((s) => s.name !== '' && s.name !== 'default');

  for (const slot of slots) {
    const isDefault = slot.name === '' || slot.name === 'default';
    const desc = slot.description ?? '';
    const hasDesc = desc.trim().length > 0;
    const hasType = hasTypeConstraint(slot.name, desc, decl);

    // Coherence: find matching property (skip reserved names)
    const slotLookupName = isDefault ? '' : slot.name;
    // Normalize kebab-case to camelCase for property lookup
    const camelName = slot.name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    let matchingProp: string | null = null;
    if (!isDefault && !RESERVED_NAMES.has(slot.name)) {
      if (propertyNames.has(slot.name)) {
        matchingProp = slot.name;
      } else if (camelName !== slot.name && propertyNames.has(camelName)) {
        matchingProp = camelName;
      }
    }

    slotAnalyses.push({
      name: slotLookupName,
      isDefault,
      hasDescription: hasDesc,
      hasTypeConstraint: hasType,
      matchingProperty: matchingProp,
    });
  }

  // ─── 1. Default slot documentation (25 points) ───────────────────────
  let defaultSlotScore = 0;
  if (defaultSlot) {
    defaultSlotScore += 15; // presence
    const defaultDesc = defaultSlot.description ?? '';
    if (defaultDesc.trim().length > 0) {
      defaultSlotScore += 10; // description
    }
  }
  subMetrics.push({
    name: 'Default slot documentation',
    score: defaultSlotScore,
    maxScore: 25,
    note: defaultSlot
      ? `declared${defaultSlot.description?.trim() ? ' with description' : ', no description'}`
      : 'no default slot',
  });

  // ─── 2. Named slot documentation (30 points) ─────────────────────────
  let namedSlotScore = 0;
  if (namedSlots.length > 0) {
    const documented = namedSlots.filter(
      (s) => typeof s.description === 'string' && s.description.trim().length > 0,
    );
    namedSlotScore = Math.round((documented.length / namedSlots.length) * 30);
  }
  // If no named slots exist, award full points (trivially satisfied)
  else {
    namedSlotScore = 30;
  }
  subMetrics.push({
    name: 'Named slot documentation',
    score: namedSlotScore,
    maxScore: 30,
    note:
      namedSlots.length > 0
        ? `${namedSlots.filter((s) => s.description?.trim()).length}/${namedSlots.length} documented`
        : 'no named slots',
  });

  // ─── 3. Slot type constraints (20 points) ─────────────────────────────
  const allSlotAnalyses = slotAnalyses;
  const slotsWithType = allSlotAnalyses.filter((s) => s.hasTypeConstraint);
  const typeScore = Math.round((slotsWithType.length / allSlotAnalyses.length) * 20);
  subMetrics.push({
    name: 'Slot type constraints',
    score: typeScore,
    maxScore: 20,
    note: `${slotsWithType.length}/${allSlotAnalyses.length} slots specify content types`,
  });

  // ─── 4. Slot-property coherence (25 points) ──────────────────────────
  // Identify pairs where both a named slot and property share a name
  for (const analysis of slotAnalyses) {
    if (analysis.matchingProperty === null) continue;

    const slotObj = slots.find(
      (s) => s.name === analysis.name || (analysis.isDefault && (s.name === '' || s.name === 'default')),
    );
    const slotDocumented = analysis.hasDescription;
    const propDocumented = propertyNames.get(analysis.matchingProperty) ?? false;

    // Per deviation rule: if only one of pair is documented, award 50% (partial coherence)
    const coherent = slotDocumented && propDocumented;

    coherencePairs.push({
      slotName: analysis.name,
      propertyName: analysis.matchingProperty,
      slotDocumented,
      propertyDocumented: propDocumented,
      coherent,
    });
  }

  let coherenceScore = 0;
  if (coherencePairs.length > 0) {
    let pairPoints = 0;
    const maxPerPair = 25 / coherencePairs.length;
    for (const pair of coherencePairs) {
      if (pair.coherent) {
        pairPoints += maxPerPair;
      } else if (pair.slotDocumented || pair.propertyDocumented) {
        // Partial coherence: 50% per deviation rule
        pairPoints += maxPerPair * 0.5;
      }
    }
    coherenceScore = Math.round(pairPoints);
  } else {
    // No coherence pairs possible — award full points (trivially satisfied)
    coherenceScore = 25;
  }
  subMetrics.push({
    name: 'Slot-property coherence',
    score: coherenceScore,
    maxScore: 25,
    note:
      coherencePairs.length > 0
        ? `${coherencePairs.filter((p) => p.coherent).length}/${coherencePairs.length} pairs fully coherent`
        : 'no coherence pairs detected',
  });

  const totalScore = Math.min(
    100,
    defaultSlotScore + namedSlotScore + typeScore + coherenceScore,
  );

  return {
    score: totalScore,
    confidence: 'verified',
    subMetrics,
    slots: slotAnalyses,
    coherencePairs,
  };
}
