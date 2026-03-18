import type { Cem, CemDeclaration, CemMember, CemEvent } from './cem.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GenerateTypesResult {
  /** The generated TypeScript declaration file content. */
  typescript: string;
  /** Number of components that had type definitions generated. */
  componentCount: number;
  /** Human-readable summary. */
  formatted: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a kebab-case tag name to a PascalCase interface name.
 * e.g. "hx-button" → "HxButton", "my-cool-card" → "MyCoolCard"
 */
function tagNameToInterfaceName(tagName: string): string {
  return tagName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Map a CEM type text string to a TypeScript type string.
 * Passes through most types unchanged; falls back to `string` for unknown/complex types.
 */
function cemTypeToTs(typeText: string | undefined): string {
  if (!typeText) return 'string';

  const t = typeText.trim();

  // Primitive scalars
  if (t === 'boolean' || t === 'number' || t === 'string') return t;

  // Union literals like "'primary' | 'secondary' | 'danger'" — pass through
  if (/^['"]/.test(t) || /\|/.test(t)) return t;

  // Array types
  if (t.endsWith('[]') || t.startsWith('Array<')) return t;

  // Complex object / generic types — keep as-is
  if (t.includes('{') || t.includes('<') || t.includes('(')) return t;

  // Unknown string-like type — return as-is (e.g. "Date", "MyEnum")
  return t;
}

/**
 * Extract the CustomEvent detail type from an event type string.
 * e.g. "CustomEvent<{ value: string }>" → "{ value: string }"
 *      "CustomEvent<void>" → "void"
 *      "CustomEvent" → "unknown"
 *      undefined → "unknown"
 */
function extractEventDetailType(typeText: string | undefined): string {
  if (!typeText) return 'unknown';
  const match = /CustomEvent<(.+)>$/.exec(typeText.trim());
  if (match && match[1]) return match[1];
  if (typeText.trim() === 'CustomEvent') return 'unknown';
  return 'unknown';
}

/**
 * Returns all field members that correspond to an HTML attribute (have `attribute` set).
 */
function getAttributeMembers(decl: CemDeclaration): CemMember[] {
  return (decl.members ?? []).filter((m) => m.kind === 'field' && m.attribute !== undefined);
}

/**
 * Generate the TypeScript interface for a single component's attributes and event handlers.
 */
function generateComponentInterface(decl: CemDeclaration): string {
  const name = tagNameToInterfaceName(decl.tagName ?? decl.name);
  const interfaceName = `${name}Attributes`;
  const lines: string[] = [];

  lines.push(`export interface ${interfaceName} {`);

  // Attribute properties
  const attrs = getAttributeMembers(decl);
  if (attrs.length > 0) {
    lines.push('  // Attributes');
    for (const member of attrs) {
      const attrName = member.attribute ?? member.name;
      const tsType = cemTypeToTs(member.type?.text);
      if (member.description) {
        lines.push(`  /** ${member.description} */`);
      }
      lines.push(`  '${attrName}'?: ${tsType};`);
    }
  }

  // Event handler properties
  const events: CemEvent[] = decl.events ?? [];
  if (events.length > 0) {
    if (attrs.length > 0) lines.push('');
    lines.push('  // Event handlers');
    for (const event of events) {
      const eventName = event.name;
      if (!eventName) continue;
      const detailType = extractEventDetailType(event.type?.text);
      if (event.description) {
        lines.push(`  /** ${event.description} */`);
      }
      lines.push(`  'on${eventName}'?: (event: CustomEvent<${detailType}>) => void;`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate the HTMLElementTagNameMap augmentation block.
 */
function generateTagNameMap(decls: CemDeclaration[]): string {
  const lines: string[] = ['declare global {', '  interface HTMLElementTagNameMap {'];
  for (const decl of decls) {
    if (!decl.tagName) continue;
    const interfaceName = `${tagNameToInterfaceName(decl.tagName)}Attributes`;
    lines.push(`    '${decl.tagName}': HTMLElement & ${interfaceName};`);
  }
  lines.push('  }');
  lines.push('}');
  return lines.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate TypeScript declaration file content from a Custom Elements Manifest.
 *
 * For each component with a `tagName`:
 *  - Generates an `${Name}Attributes` interface with optional attribute properties
 *    and event handler properties
 *  - Generates a `HTMLElementTagNameMap` augmentation for IDE autocomplete
 *
 * @param cem - Parsed Custom Elements Manifest
 * @returns GenerateTypesResult with the `.d.ts` content and metadata
 */
export function generateTypeDefinitions(cem: Cem): GenerateTypesResult {
  // Collect all component declarations with a tagName
  const declarations = cem.modules
    .flatMap((m) => m.declarations ?? [])
    .filter((d): d is CemDeclaration & { tagName: string } => Boolean(d.tagName));

  const header = [
    '// Auto-generated from Custom Elements Manifest.',
    '// Do not edit manually — regenerate with: helixir generate-types',
    '',
  ].join('\n');

  const interfaces = declarations.map((d) => generateComponentInterface(d));

  const tagNameMap = declarations.length > 0 ? '\n' + generateTagNameMap(declarations) : '';

  const typescript = [header, ...interfaces, tagNameMap].join('\n\n');

  const componentCount = declarations.length;

  const lines: string[] = [];
  lines.push(`Generated TypeScript definitions for ${componentCount} component(s):`);
  for (const decl of declarations) {
    const attrCount = getAttributeMembers(decl).length;
    const eventCount = (decl.events ?? []).length;
    lines.push(`  ${decl.tagName}: ${attrCount} attribute(s), ${eventCount} event(s)`);
  }

  return {
    typescript,
    componentCount,
    formatted: lines.join('\n'),
  };
}
