/**
 * CEM-Source Fidelity Analyzer — detects discrepancies between CEM declarations
 * and actual source code implementations.
 *
 * Catches bugs like the hx-carousel case where CEM declared `hx-slide-change`
 * but the component actually dispatches `hx-slide`.
 *
 * Three fidelity dimensions:
 *   1. Event fidelity (40 pts): CEM events vs source dispatchEvent calls
 *   2. Property fidelity (35 pts): CEM members vs source property declarations
 *   3. Attribute reflection fidelity (25 pts): CEM reflects vs source observedAttributes
 *
 * Returns null if source code is unavailable (honest scoring — can't verify).
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { McpWcConfig } from '../../config.js';
import type { Cem, CemDeclaration } from '../cem.js';
import { getDeclarationSourcePath } from '../cem.js';
import type { SubMetric, ConfidenceLevel } from '../dimensions.js';
import { resolveComponentSourceFilePath } from './source-accessibility.js';
import { resolveInheritanceChain } from './mixin-resolver.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CemSourceFidelityResult {
  score: number;
  confidence: ConfidenceLevel;
  subMetrics: SubMetric[];
  eventFidelity: EventFidelityDetail;
  propertyFidelity: PropertyFidelityDetail;
  attributeFidelity: AttributeFidelityDetail;
}

export interface EventFidelityDetail {
  score: number;
  maxScore: number;
  cemEvents: string[];
  sourceEvents: string[];
  phantomEvents: string[];
  missingEvents: string[];
}

export interface PropertyFidelityDetail {
  score: number;
  maxScore: number;
  cemProperties: string[];
  sourceProperties: string[];
  missingProperties: string[];
  defaultMismatches: Array<{ name: string; cemDefault: string; sourceDefault: string }>;
}

export interface AttributeFidelityDetail {
  score: number;
  maxScore: number;
  cemReflectedAttributes: string[];
  sourceObservedAttributes: string[];
  missingReflections: string[];
  extraReflections: string[];
}

// ─── Event Extraction ────────────────────────────────────────────────────────

/**
 * Extracts dispatched event names from source code.
 * Handles:
 *   - dispatchEvent(new CustomEvent('name'))
 *   - dispatchEvent(new Event('name'))
 *   - this.dispatchEvent(new CustomEvent('name'))
 *   - this.emit('name') / this.$emit('name')
 *   - @event decorators (Lit/Stencil)
 *   - FAST $emit('name')
 */
export function extractSourceEvents(source: string): string[] {
  const events = new Set<string>();

  // dispatchEvent(new CustomEvent('name')) or dispatchEvent(new Event('name'))
  const dispatchRegex = /dispatchEvent\s*\(\s*new\s+(?:Custom)?Event\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = dispatchRegex.exec(source)) !== null) {
    if (match[1]) events.add(match[1]);
  }

  // this.emit('name') or this.$emit('name') — require `this.` to avoid matching unrelated emit() calls
  const emitRegex = /this\.(?:\$)?emit\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((match = emitRegex.exec(source)) !== null) {
    if (match[1]) events.add(match[1]);
  }

  // @event decorator: @event({ name: 'foo' }) or @event('foo')
  const eventDecoratorRegex = /@event\s*\(\s*(?:\{\s*name:\s*)?['"`]([^'"`]+)['"`]/g;
  while ((match = eventDecoratorRegex.exec(source)) !== null) {
    if (match[1]) events.add(match[1]);
  }

  return [...events];
}

// ─── Property Extraction ─────────────────────────────────────────────────────

export interface SourceProperty {
  name: string;
  defaultValue?: string;
  hasReflect?: boolean;
}

/**
 * Extracts property declarations from source code.
 * Handles:
 *   - @property() decorators (Lit)
 *   - static properties = { ... }
 *   - static get properties() { return { ... } }
 *   - Class field declarations with initializers
 */
export function extractSourceProperties(source: string): SourceProperty[] {
  const properties: Map<string, SourceProperty> = new Map();

  // @property({ type: String, reflect: true }) propName = 'default';
  const litPropRegex =
    /@property\s*\(\s*(\{[^}]*\})?\s*\)\s*(?:[\w<>|]+\s+)?(\w+)\s*(?:=\s*([^;]+))?/g;
  let match;
  while ((match = litPropRegex.exec(source)) !== null) {
    const options = match[1] ?? '';
    const name = match[2] ?? '';
    const defaultValue = match[3]?.trim();
    if (name) {
      properties.set(name, {
        name,
        defaultValue,
        hasReflect: /reflect\s*:\s*true/.test(options),
      });
    }
  }

  // static properties = { propName: { type: String, reflect: true } }
  // static get properties() { return { propName: { type: String } } }
  // Use a regex that allows one level of nested braces
  const staticPropsRegex =
    /static\s+(?:get\s+)?properties\s*(?:=|\(\s*\)\s*\{[\s\S]*?return)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
  while ((match = staticPropsRegex.exec(source)) !== null) {
    const block = match[1] ?? '';
    // Parse individual property entries: propName: { type: String }
    const entryRegex = /(\w+)\s*:\s*\{([^}]*)\}/g;
    let entryMatch;
    while ((entryMatch = entryRegex.exec(block)) !== null) {
      const name = entryMatch[1] ?? '';
      const options = entryMatch[2] ?? '';
      if (name && !properties.has(name)) {
        properties.set(name, {
          name,
          hasReflect: /reflect\s*:\s*true/.test(options),
        });
      }
    }
  }

  // Class field initializers (simple patterns): propName = 'value';
  // Only capture fields not already found via decorators
  const fieldRegex = /^\s+(\w+)\s*(?::\s*[\w<>|[\]]+)?\s*=\s*([^;]+);/gm;
  while ((match = fieldRegex.exec(source)) !== null) {
    const name = match[1] ?? '';
    const value = match[2]?.trim();
    if (name && !properties.has(name) && !name.startsWith('_') && name !== 'static') {
      properties.set(name, { name, defaultValue: value });
    }
  }

  return [...properties.values()];
}

// ─── Attribute Extraction ────────────────────────────────────────────────────

/**
 * Extracts observed attributes from source code.
 * Handles:
 *   - static observedAttributes = [...]
 *   - static get observedAttributes() { return [...] }
 *   - attributeChangedCallback references
 */
export function extractSourceObservedAttributes(source: string): string[] {
  const attributes = new Set<string>();

  // static observedAttributes = ['attr1', 'attr2']
  // static get observedAttributes() { return ['attr1', 'attr2'] }
  const observedRegex =
    /static\s+(?:get\s+)?observedAttributes\s*(?:=|\(\s*\)\s*\{[^[]*)\s*\[([^\]]*)\]/g;
  let match;
  while ((match = observedRegex.exec(source)) !== null) {
    const content = match[1] ?? '';
    const attrRegex = /['"`]([^'"`]+)['"`]/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(content)) !== null) {
      if (attrMatch[1]) attributes.add(attrMatch[1]);
    }
  }

  // Also extract from attributeChangedCallback — attribute names referenced
  const changedCallbackRegex =
    /attributeChangedCallback\s*\([^)]*\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
  while ((match = changedCallbackRegex.exec(source)) !== null) {
    const body = match[1] ?? '';
    const caseRegex = /case\s+['"`]([^'"`]+)['"`]/g;
    let caseMatch;
    while ((caseMatch = caseRegex.exec(body)) !== null) {
      if (caseMatch[1]) attributes.add(caseMatch[1]);
    }
    const ifRegex = /===?\s*['"`]([^'"`]+)['"`]/g;
    let ifMatch;
    while ((ifMatch = ifRegex.exec(body)) !== null) {
      if (ifMatch[1]) attributes.add(ifMatch[1]);
    }
  }

  return [...attributes];
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

const EVENT_MAX = 40;
const PROPERTY_MAX = 35;
const ATTRIBUTE_MAX = 25;

const PHANTOM_EVENT_PENALTY = 15;
const MISSING_EVENT_PENALTY = 10;

/**
 * Scores event fidelity between CEM and source.
 * Phantom events (in CEM, not in source): -15 each
 * Missing events (in source, not in CEM): -10 each
 */
function scoreEventFidelity(cemEvents: string[], sourceEvents: string[]): EventFidelityDetail {
  if (cemEvents.length === 0 && sourceEvents.length === 0) {
    return {
      score: EVENT_MAX,
      maxScore: EVENT_MAX,
      cemEvents,
      sourceEvents,
      phantomEvents: [],
      missingEvents: [],
    };
  }

  const cemSet = new Set(cemEvents.map((e) => e.toLowerCase()));
  const sourceSet = new Set(sourceEvents.map((e) => e.toLowerCase()));

  const phantomEvents = cemEvents.filter((e) => !sourceSet.has(e.toLowerCase()));
  const missingEvents = sourceEvents.filter((e) => !cemSet.has(e.toLowerCase()));

  const totalEvents = new Set([...cemSet, ...sourceSet]).size;
  const matchedEvents = totalEvents - phantomEvents.length - missingEvents.length;
  const baseScore =
    totalEvents > 0 ? Math.round((matchedEvents / totalEvents) * EVENT_MAX) : EVENT_MAX;

  const phantomPenalty = phantomEvents.length * PHANTOM_EVENT_PENALTY;
  const missingPenalty = missingEvents.length * MISSING_EVENT_PENALTY;

  const score = Math.max(0, baseScore - phantomPenalty - missingPenalty);

  return {
    score,
    maxScore: EVENT_MAX,
    cemEvents,
    sourceEvents,
    phantomEvents,
    missingEvents,
  };
}

/**
 * Scores property fidelity between CEM and source.
 */
function scorePropertyFidelity(
  cemDecl: CemDeclaration,
  sourceProperties: SourceProperty[],
): PropertyFidelityDetail {
  const cemFields = (cemDecl.members ?? []).filter((m) => m.kind === 'field');
  const cemPropertyNames = cemFields.map((m) => m.name);

  if (cemPropertyNames.length === 0 && sourceProperties.length === 0) {
    return {
      score: PROPERTY_MAX,
      maxScore: PROPERTY_MAX,
      cemProperties: cemPropertyNames,
      sourceProperties: sourceProperties.map((p) => p.name),
      missingProperties: [],
      defaultMismatches: [],
    };
  }

  const sourceNameSet = new Set(sourceProperties.map((p) => p.name.toLowerCase()));
  const missingProperties = cemPropertyNames.filter(
    (name) => !sourceNameSet.has(name.toLowerCase()),
  );

  // Check default value mismatches
  const defaultMismatches: Array<{ name: string; cemDefault: string; sourceDefault: string }> = [];
  for (const cemField of cemFields) {
    if (cemField.default === undefined) continue;
    const sourceProp = sourceProperties.find(
      (p) => p.name.toLowerCase() === cemField.name.toLowerCase(),
    );
    if (!sourceProp || sourceProp.defaultValue === undefined) continue;

    const cemDefault = normalizeDefault(cemField.default);
    const sourceDefault = normalizeDefault(sourceProp.defaultValue);
    if (cemDefault !== sourceDefault) {
      defaultMismatches.push({
        name: cemField.name,
        cemDefault: cemField.default,
        sourceDefault: sourceProp.defaultValue,
      });
    }
  }

  const totalProperties = new Set([
    ...cemPropertyNames.map((n) => n.toLowerCase()),
    ...sourceProperties.map((p) => p.name.toLowerCase()),
  ]).size;

  const matchedProperties = totalProperties - missingProperties.length;
  const baseScore =
    totalProperties > 0
      ? Math.round((matchedProperties / totalProperties) * PROPERTY_MAX)
      : PROPERTY_MAX;

  // Small penalty for default mismatches (2 pts each)
  const mismatchPenalty = defaultMismatches.length * 2;
  const score = Math.max(0, baseScore - mismatchPenalty);

  return {
    score,
    maxScore: PROPERTY_MAX,
    cemProperties: cemPropertyNames,
    sourceProperties: sourceProperties.map((p) => p.name),
    missingProperties,
    defaultMismatches,
  };
}

/**
 * Normalizes a default value string for comparison.
 */
function normalizeDefault(value: string): string {
  return value
    .replace(/^['"`]|['"`]$/g, '')
    .replace(/^"(.*)"$/, '$1')
    .trim()
    .toLowerCase();
}

/**
 * Scores attribute reflection fidelity.
 */
function scoreAttributeFidelity(
  cemDecl: CemDeclaration,
  sourceObservedAttributes: string[],
  sourceProperties: SourceProperty[],
): AttributeFidelityDetail {
  // CEM reflected attributes: members with reflects: true and an attribute name
  const cemReflectedAttributes = (cemDecl.members ?? [])
    .filter((m) => m.kind === 'field' && m.reflects === true && m.attribute)
    .map((m) => m.attribute as string);

  // Source reflected attributes: from observedAttributes + properties with reflect: true
  const sourceReflected = new Set<string>(sourceObservedAttributes.map((a) => a.toLowerCase()));
  for (const prop of sourceProperties) {
    if (prop.hasReflect && prop.name) {
      // Convert camelCase to kebab-case for attribute name
      const attrName = prop.name.replace(/([A-Z])/g, '-$1').toLowerCase();
      sourceReflected.add(attrName);
      sourceReflected.add(prop.name.toLowerCase());
    }
  }

  if (cemReflectedAttributes.length === 0 && sourceReflected.size === 0) {
    return {
      score: ATTRIBUTE_MAX,
      maxScore: ATTRIBUTE_MAX,
      cemReflectedAttributes,
      sourceObservedAttributes: [...sourceReflected],
      missingReflections: [],
      extraReflections: [],
    };
  }

  const cemSet = new Set(cemReflectedAttributes.map((a) => a.toLowerCase()));

  const missingReflections = cemReflectedAttributes.filter(
    (a) => !sourceReflected.has(a.toLowerCase()),
  );
  const extraReflections = [...sourceReflected].filter((a) => !cemSet.has(a));

  const totalAttributes = new Set([...cemSet, ...sourceReflected]).size;
  const matchedAttributes = totalAttributes - missingReflections.length - extraReflections.length;
  const score =
    totalAttributes > 0
      ? Math.round((Math.max(0, matchedAttributes) / totalAttributes) * ATTRIBUTE_MAX)
      : ATTRIBUTE_MAX;

  return {
    score,
    maxScore: ATTRIBUTE_MAX,
    cemReflectedAttributes,
    sourceObservedAttributes: [...sourceReflected],
    missingReflections,
    extraReflections,
  };
}

// ─── Source File Reading ─────────────────────────────────────────────────────

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

  if (!existsSync(filePath)) return null;
  try {
    const content = await readFile(filePath, 'utf-8');
    return { content, filePath };
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Analyzes CEM-source fidelity for a component.
 * Returns null if source code is unavailable.
 *
 * Uses mixin-resolver to follow inheritance chains in deep mode,
 * aggregating events/properties/attributes from all source files.
 */
export async function analyzeCemSourceFidelity(
  config: McpWcConfig,
  cem: Cem,
  decl: CemDeclaration,
): Promise<CemSourceFidelityResult | null> {
  const result = await readComponentSource(config, cem, decl);
  if (!result) return null;

  // Aggregate source from inheritance chain
  let aggregatedSource = result.content;

  try {
    const chain = await resolveInheritanceChain(
      result.content,
      result.filePath,
      decl,
      config.projectRoot,
    );
    // Concatenate all chain sources for extraction
    aggregatedSource = chain.sources.map((s) => s.content).join('\n');
  } catch {
    // Fall back to single-file analysis if chain resolution fails
  }

  // Extract from source
  const sourceEvents = extractSourceEvents(aggregatedSource);
  const sourceProperties = extractSourceProperties(aggregatedSource);
  const sourceObservedAttributes = extractSourceObservedAttributes(aggregatedSource);

  // Extract from CEM
  const cemEvents = (decl.events ?? []).map((e) => e.name);

  // Score each dimension
  const eventFidelity = scoreEventFidelity(cemEvents, sourceEvents);
  const propertyFidelity = scorePropertyFidelity(decl, sourceProperties);
  const attributeFidelity = scoreAttributeFidelity(
    decl,
    sourceObservedAttributes,
    sourceProperties,
  );

  const totalScore = eventFidelity.score + propertyFidelity.score + attributeFidelity.score;

  // Build sub-metrics
  const subMetrics: SubMetric[] = [
    {
      name: 'Event Fidelity',
      score: eventFidelity.score,
      maxScore: EVENT_MAX,
      note: buildEventNote(eventFidelity),
    },
    {
      name: 'Property Fidelity',
      score: propertyFidelity.score,
      maxScore: PROPERTY_MAX,
      note: buildPropertyNote(propertyFidelity),
    },
    {
      name: 'Attribute Reflection Fidelity',
      score: attributeFidelity.score,
      maxScore: ATTRIBUTE_MAX,
      note: buildAttributeNote(attributeFidelity),
    },
  ];

  return {
    score: totalScore,
    confidence: 'heuristic',
    subMetrics,
    eventFidelity,
    propertyFidelity,
    attributeFidelity,
  };
}

// ─── Note Builders ───────────────────────────────────────────────────────────

function buildEventNote(detail: EventFidelityDetail): string {
  const parts: string[] = [];
  if (detail.phantomEvents.length > 0) {
    parts.push(`Phantom: ${detail.phantomEvents.join(', ')}`);
  }
  if (detail.missingEvents.length > 0) {
    parts.push(`Missing from CEM: ${detail.missingEvents.join(', ')}`);
  }
  if (parts.length === 0) {
    return detail.cemEvents.length === 0 && detail.sourceEvents.length === 0
      ? 'No events declared or dispatched'
      : `${detail.cemEvents.length} events matched`;
  }
  return parts.join('; ');
}

function buildPropertyNote(detail: PropertyFidelityDetail): string {
  const parts: string[] = [];
  if (detail.missingProperties.length > 0) {
    parts.push(`Missing in source: ${detail.missingProperties.join(', ')}`);
  }
  if (detail.defaultMismatches.length > 0) {
    parts.push(
      `Default mismatches: ${detail.defaultMismatches.map((m) => `${m.name} (CEM: ${m.cemDefault}, source: ${m.sourceDefault})`).join(', ')}`,
    );
  }
  if (parts.length === 0) {
    return `${detail.cemProperties.length} properties matched`;
  }
  return parts.join('; ');
}

function buildAttributeNote(detail: AttributeFidelityDetail): string {
  const parts: string[] = [];
  if (detail.missingReflections.length > 0) {
    parts.push(`Missing reflections: ${detail.missingReflections.join(', ')}`);
  }
  if (detail.extraReflections.length > 0) {
    parts.push(`Extra in source: ${detail.extraReflections.join(', ')}`);
  }
  if (parts.length === 0) {
    return detail.cemReflectedAttributes.length === 0
      ? 'No reflected attributes'
      : `${detail.cemReflectedAttributes.length} reflections matched`;
  }
  return parts.join('; ');
}
