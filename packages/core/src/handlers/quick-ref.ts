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
  antiPatterns: string[];
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
      .map((p) => {
        const value = p.default ?? guessDefaultValue(p.name);
        return `  ${p.name}: ${value};`;
      })
      .join('\n');
    parts.push(`/* Token customization */\n${tagName} {\n${propLines}\n}`);
  }

  if (meta.cssParts.length > 0) {
    const partBlocks = meta.cssParts
      .slice(0, 3)
      .map((p) => `${tagName}::part(${p.name}) {\n  /* ${p.description || p.name} */\n}`)
      .join('\n\n');
    parts.push(`/* Part-based customization */\n${partBlocks}`);
  }

  if (meta.slots.length > 0) {
    const slotLines: string[] = [];
    const hasDefaultSlot = meta.slots.some((s) => s.name === '');
    const namedSlots = meta.slots.filter((s) => s.name !== '');

    if (hasDefaultSlot) {
      slotLines.push(`${tagName} > * { /* default slot content */ }`);
    }
    for (const slot of namedSlots.slice(0, 3)) {
      slotLines.push(`${tagName} [slot="${slot.name}"] { /* ${slot.description || slot.name} */ }`);
    }

    parts.push(`/* Slot styling — target in light DOM CSS */\n${slotLines.join('\n')}`);
  }

  return parts.join('\n\n');
}

function guessDefaultValue(propName: string): string {
  const lower = propName.toLowerCase();
  if (/color|bg|background/.test(lower)) return '#value';
  if (/size|font/.test(lower)) return '1rem';
  if (/radius/.test(lower)) return '4px';
  if (/spacing|padding|margin|gap/.test(lower)) return '1rem';
  if (/shadow/.test(lower)) return '0 1px 2px rgba(0,0,0,.1)';
  return '#value';
}

// ─── Anti-Pattern Builder ──────────────────────────────────────────────────

function buildAntiPatterns(meta: ComponentMetadata): string[] {
  const tag = meta.tagName;
  const patterns: string[] = [];

  // Universal: Shadow DOM piercing
  patterns.push(
    `Shadow DOM: \`${tag} .inner { ... }\` — descendant selectors cannot pierce shadow boundaries. ` +
      `Use \`${tag}::part(name)\` or CSS custom properties instead.`,
  );

  // Components with CSS parts
  if (meta.cssParts.length > 0) {
    const firstPart = meta.cssParts[0]?.name ?? 'base';
    patterns.push(
      `Never chain ::part() with classes or attributes: \`${tag}::part(${firstPart}).active\` — ` +
        `this is invalid CSS. Use separate ::part() selectors or state attributes on the host.`,
    );
  }

  // Components with CSS custom properties
  if (meta.cssProperties.length > 0) {
    const firstToken = meta.cssProperties[0]?.name ?? `--${tag}-bg`;
    patterns.push(
      `:root scope: \`:root { ${firstToken}: blue; }\` — component tokens set on :root have no ` +
        `effect through Shadow DOM. Set them on the host: \`${tag} { ${firstToken}: blue; }\``,
    );
    patterns.push(
      `Hardcoded colors: \`${tag} { ${firstToken}: #hex; }\` — use \`var()\` with a theme ` +
        `token and fallback: \`${tag} { ${firstToken}: var(--theme-primary, blue); }\``,
    );
  }

  // Components with named slots
  const namedSlots = meta.slots.filter((s) => s.name !== '');
  if (namedSlots.length > 0) {
    const validNames = namedSlots.map((s) => `"${s.name}"`).join(', ');
    patterns.push(
      `Invalid slot names: only these slot names exist: ${validNames}. ` +
        `Using \`slot="nonexistent"\` silently hides the content.`,
    );
  }

  // Components with NO CSS API
  if (meta.cssParts.length === 0 && meta.cssProperties.length === 0 && meta.slots.length === 0) {
    patterns.push(
      `<${tag}> has no CSS style API (no parts, no custom properties, no slots). ` +
        `Attempting \`${tag}::part(...)\` or setting \`--${tag}-*\` tokens will have no effect.`,
    );
  }

  return patterns;
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
    example: `${p.name}: ${p.default ?? guessDefaultValue(p.name)};`,
  }));

  const cssParts: QuickRefCssPart[] = meta.cssParts.map((p) => ({
    name: p.name,
    description: p.description,
    selector: `${meta.tagName}::part(${p.name})`,
  }));

  const cssSnippet = buildCssSnippet(meta.tagName, meta);

  const shadowDomWarnings = getShadowDomWarnings(meta.tagName);

  // Add validation nudge when component has a CSS API
  if (cssParts.length > 0 || cssProperties.length > 0) {
    shadowDomWarnings.push(
      `After writing CSS for ${meta.tagName}, call \`styling_preflight\` to validate ` +
        `your ::part() and custom property names against the actual component API.`,
    );
  }

  const antiPatterns = buildAntiPatterns(meta);

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
    antiPatterns,
  };
}
