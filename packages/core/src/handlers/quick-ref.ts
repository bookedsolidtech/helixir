/**
 * Component Quick Reference — aggregates everything an AI agent needs
 * to correctly use a web component in a single call.
 *
 * Returns: attributes (with types, enums, booleans), methods, events,
 * slots, CSS properties, CSS parts, a ready-to-use CSS snippet, and
 * Shadow DOM warnings.
 */

import type { ComponentMetadata } from './cem.js';
import { getShadowDomWarnings } from '../shared/mcp-helpers.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QuickRefAttribute {
  name: string;
  type: string;
  description: string;
  isBoolean: boolean;
  validValues?: string[];
}

export interface QuickRefMethod {
  name: string;
  description: string;
  returnType: string;
}

export interface QuickRefEvent {
  name: string;
  type: string;
  description: string;
}

export interface QuickRefSlot {
  name: string;
  description: string;
}

export interface QuickRefCssProperty {
  name: string;
  description: string;
  example: string;
}

export interface QuickRefCssPart {
  name: string;
  description: string;
  selector: string;
}

export interface ComponentQuickRef {
  tagName: string;
  description: string;
  attributes: QuickRefAttribute[];
  methods: QuickRefMethod[];
  events: QuickRefEvent[];
  slots: QuickRefSlot[];
  cssProperties: QuickRefCssProperty[];
  cssParts: QuickRefCssPart[];
  cssSnippet: string;
  shadowDomWarnings: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractEnumValues(typeText: string): string[] | null {
  const matches = typeText.match(/'([^']+)'/g);
  if (!matches || matches.length < 2) return null;
  return matches.map((m) => m.replace(/'/g, ''));
}

function buildCssSnippet(tagName: string, meta: ComponentMetadata): string {
  const parts: string[] = [];

  if (meta.cssProperties.length > 0) {
    const propLines = meta.cssProperties
      .slice(0, 5)
      .map((p) => `  ${p.name}: initial;`)
      .join('\n');
    parts.push(`${tagName} {\n${propLines}\n}`);
  }

  if (meta.cssParts.length > 0) {
    const partBlocks = meta.cssParts
      .slice(0, 3)
      .map((p) => `${tagName}::part(${p.name}) {\n  /* ${p.description || p.name} */\n}`)
      .join('\n\n');
    parts.push(partBlocks);
  }

  return parts.join('\n\n');
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function getComponentQuickRef(meta: ComponentMetadata): ComponentQuickRef {
  const attributes: QuickRefAttribute[] = meta.members
    .filter((m) => m.kind === 'field')
    .map((m) => {
      const isBoolean = m.type === 'boolean';
      const validValues = extractEnumValues(m.type) ?? undefined;
      return {
        name: m.name,
        type: m.type,
        description: m.description,
        isBoolean,
        ...(validValues ? { validValues } : {}),
      };
    });

  const methods: QuickRefMethod[] = meta.members
    .filter((m) => m.kind === 'method')
    .map((m) => ({
      name: m.name,
      description: m.description,
      returnType: m.type,
    }));

  const events: QuickRefEvent[] = meta.events.map((e) => ({
    name: e.name,
    type: e.type,
    description: e.description,
  }));

  const slots: QuickRefSlot[] = meta.slots.map((s) => ({
    name: s.name,
    description: s.description,
  }));

  const cssProperties: QuickRefCssProperty[] = meta.cssProperties.map((p) => ({
    name: p.name,
    description: p.description,
    example: `${p.name}: initial;`,
  }));

  const cssParts: QuickRefCssPart[] = meta.cssParts.map((p) => ({
    name: p.name,
    description: p.description,
    selector: `${meta.tagName}::part(${p.name})`,
  }));

  const cssSnippet = buildCssSnippet(meta.tagName, meta);

  const shadowDomWarnings = getShadowDomWarnings(meta.tagName);

  return {
    tagName: meta.tagName,
    description: meta.description,
    attributes,
    methods,
    events,
    slots,
    cssProperties,
    cssParts,
    cssSnippet,
    shadowDomWarnings,
  };
}
