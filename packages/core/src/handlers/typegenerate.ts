import type { Cem, CemDeclaration, CemMember } from './cem.js';

// --- Helpers ---

/**
 * Converts a tag name like "my-button" to PascalCase like "MyButton".
 */
function tagNameToClassName(tagName: string): string {
  return tagName
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

/**
 * Extracts the generic detail type from a CustomEvent type string.
 * e.g. "CustomEvent<{ tabId: string; index: number }>" → "{ tabId: string; index: number }"
 * e.g. "CustomEvent<void>" → "void"
 * Falls back to "void" when the type is absent or unrecognised.
 */
function extractEventDetailType(typeText: string | undefined): string {
  if (!typeText) return 'void';
  const openIdx = typeText.indexOf('<');
  if (openIdx === -1) return 'void';
  const closeIdx = typeText.lastIndexOf('>');
  if (closeIdx === -1 || closeIdx <= openIdx) return 'void';
  return typeText.slice(openIdx + 1, closeIdx).trim() || 'void';
}

/**
 * Returns the members that expose an HTML attribute (i.e. `attribute` field is set).
 * IMPORTANT: Uses `member.attribute` — NOT `member.name` — as the attribute key name.
 * The two can differ: the JS property name may not match the HTML attribute name.
 * Using the wrong field is what caused the original helix.d.ts bug
 * (e.g. `active` instead of `activation`, `placement` instead of `orientation`).
 */
function attributeMembers(decl: CemDeclaration): Array<CemMember & { attribute: string }> {
  return (decl.members ?? []).filter(
    (m): m is CemMember & { attribute: string } =>
      m.kind === 'field' && typeof m.attribute === 'string' && m.attribute.length > 0,
  );
}

function renderAttributesInterface(decl: CemDeclaration): string | null {
  const attrs = attributeMembers(decl);
  if (attrs.length === 0) return null;

  const name = `${tagNameToClassName(decl.tagName ?? decl.name)}Attributes`;
  const lines: string[] = [`export interface ${name} {`];

  for (const m of attrs) {
    if (m.description) {
      lines.push(`  /** ${m.description} */`);
    }
    // ✅ Use m.attribute (HTML attribute name), NOT m.name (JS property name).
    lines.push(`  ${m.attribute}?: ${m.type?.text ?? 'string'};`);
  }

  lines.push('}');
  return lines.join('\n');
}

function renderEventsInterface(decl: CemDeclaration): string | null {
  const events = decl.events ?? [];
  if (events.length === 0) return null;

  const name = `${tagNameToClassName(decl.tagName ?? decl.name)}Events`;
  const lines: string[] = [`export interface ${name} {`];

  for (const ev of events) {
    if (ev.description) {
      lines.push(`  /** ${ev.description} */`);
    }
    const detail = extractEventDetailType(ev.type?.text);
    lines.push(`  '${ev.name}': CustomEvent<${detail}>;`);
  }

  lines.push('}');
  return lines.join('\n');
}

// --- Public API ---

export interface GenerateTypesResult {
  /** Full content of the generated .d.ts file. */
  content: string;
  /** Number of components included in the output. */
  componentCount: number;
}

/**
 * Generates TypeScript type definitions (.d.ts content) for all custom elements
 * declared in a CEM.
 *
 * Attribute interface property names are sourced from the CEM `attribute` field
 * (the HTML attribute name), not the `name` field (the JS property name).
 * This is the root cause fix for the hx-tabs attribute name drift bug.
 */
export function generateTypes(cem: Cem): GenerateTypesResult {
  const declarations = cem.modules.flatMap((m) => m.declarations ?? []).filter((d) => d.tagName);

  const blocks: string[] = [
    '// Generated from custom-elements.json',
    '// DO NOT EDIT MANUALLY — regenerate with the generate_types tool',
    '',
  ];

  const tagMapLines: string[] = [];

  for (const decl of declarations) {
    const tagName = decl.tagName as string;
    const className = tagNameToClassName(tagName);

    const attrsBlock = renderAttributesInterface(decl);
    const eventsBlock = renderEventsInterface(decl);

    if (attrsBlock) {
      blocks.push(attrsBlock);
      blocks.push('');
    }
    if (eventsBlock) {
      blocks.push(eventsBlock);
      blocks.push('');
    }

    tagMapLines.push(
      `    '${tagName}': HTMLElement${attrsBlock ? ` & ${className}Attributes` : ''};`,
    );
  }

  if (tagMapLines.length > 0) {
    blocks.push('declare global {');
    blocks.push('  interface HTMLElementTagNameMap {');
    for (const line of tagMapLines) blocks.push(line);
    blocks.push('  }');
    blocks.push('}');
    blocks.push('');
  }

  return {
    content: blocks.join('\n'),
    componentCount: declarations.length,
  };
}
