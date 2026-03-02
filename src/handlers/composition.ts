import { MCPError, ErrorCategory } from '../shared/error-handling.js';
import type { Cem, CemDeclaration } from './cem.js';

// --- Public types ---

export interface CompositionExample {
  html: string;
  description: string;
  slots_used: Record<string, string>;
}

// --- Private helpers ---

function findDeclaration(cem: Cem, tagName: string): CemDeclaration | undefined {
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tagName) return decl;
    }
  }
  return undefined;
}

function getAllTagNames(cem: Cem): string[] {
  const tags: string[] = [];
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName) tags.push(decl.tagName);
    }
  }
  return tags;
}

/** Returns a sensible example attribute value based on attribute name and type text. */
function exampleAttributeValue(attrName: string, typeText: string): string | null {
  // Booleans: use attribute presence (caller decides whether to include)
  if (typeText === 'boolean') return null;

  // Union string type: pick first quoted option
  const unionMatch = typeText.match(/^'([^']+)'/);
  if (unionMatch) {
    const first = unionMatch[1];
    return first !== undefined ? first : null;
  }

  // Named attribute heuristics
  const lower = attrName.toLowerCase();
  if (lower === 'label' || lower === 'heading') return 'Example Heading';
  if (lower === 'name') return 'field-name';
  if (lower === 'type') return 'text';
  if (lower === 'placeholder') return 'Enter value...';
  if (lower === 'value') return 'example-value';
  if (lower === 'href') return '#';

  return 'example';
}

/** Builds an opening tag string from a declaration's attribute-bearing fields. */
function buildOpeningTag(decl: CemDeclaration): string {
  const tagName = decl.tagName ?? '';
  const attrs: string[] = [];

  for (const field of decl.members ?? []) {
    if (field.kind !== 'field') continue;
    const attrName = field.attribute;
    if (!attrName) continue;
    const typeText = field.type?.text ?? 'string';
    // Skip booleans (false by default; not useful to show)
    if (typeText === 'boolean') continue;
    const val = exampleAttributeValue(attrName, typeText);
    if (val !== null) {
      attrs.push(`${attrName}="${val}"`);
    }
  }

  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  return `<${tagName}${attrStr}>`;
}

/** Count named (non-default) slots on a declaration. */
function namedSlotCount(decl: CemDeclaration): number {
  return (decl.slots ?? []).filter((s) => s.name !== '').length;
}

/** Generates a standalone usage example for a single component. */
function buildSingleComponentExample(decl: CemDeclaration): CompositionExample {
  const tagName = decl.tagName ?? '';
  const slots = decl.slots ?? [];
  const slotsUsed: Record<string, string> = {};

  if (slots.length === 0) {
    return {
      html: `${buildOpeningTag(decl)}</${tagName}>`,
      description: `Basic usage of <${tagName}>.`,
      slots_used: {},
    };
  }

  const lines: string[] = [buildOpeningTag(decl)];

  for (const slot of slots) {
    if (slot.name === '') {
      lines.push(`  Default content here`);
      slotsUsed['(default)'] = tagName;
    } else {
      const example = slot.description ? slot.description.split('.')[0] : slot.name;
      lines.push(`  <span slot="${slot.name}">${example}</span>`);
      slotsUsed[slot.name] = 'span';
    }
  }

  lines.push(`</${tagName}>`);

  return {
    html: lines.join('\n'),
    description: `Usage example for <${tagName}> showing its ${slots.length} available slot(s).`,
    slots_used: slotsUsed,
  };
}

// --- Public API ---

/**
 * Generates a realistic HTML composition snippet combining two or more components.
 * Slot assignments are drawn from CEM slot definitions.
 *
 * - Single component: returns a standalone usage example with slot demonstrations.
 * - Multiple components: identifies the container (most named slots), places other
 *   components into its named slots in order.
 * - No nesting relationship: generates a side-by-side layout example instead.
 */
export function getCompositionExample(cem: Cem, tagNames: string[]): CompositionExample {
  const allTags = getAllTagNames(cem);

  const unknowns = tagNames.filter((t) => !allTags.includes(t));
  if (unknowns.length > 0) {
    throw new MCPError(
      `Unknown component(s): ${unknowns.join(', ')}. Valid tags: ${allTags.join(', ')}`,
      ErrorCategory.NOT_FOUND,
    );
  }

  // All tag names are validated above, so every findDeclaration call will succeed.
  const decls: CemDeclaration[] = [];
  for (const t of tagNames) {
    const decl = findDeclaration(cem, t);
    if (!decl) {
      // Should not happen after the unknowns check, but satisfies the type system
      throw new MCPError(`Component "${t}" not found in CEM.`, ErrorCategory.NOT_FOUND);
    }
    decls.push(decl);
  }

  // Single component
  if (decls.length === 1) {
    const single = decls[0];
    if (!single) throw new MCPError('Internal error: empty decls', ErrorCategory.UNKNOWN);
    return buildSingleComponentExample(single);
  }

  // Find container: component with the most named slots
  let containerIdx = 0;
  let maxSlots = namedSlotCount(decls[0] as CemDeclaration);
  for (let i = 1; i < decls.length; i++) {
    const d = decls[i];
    if (!d) continue;
    const count = namedSlotCount(d);
    if (count > maxSlots) {
      maxSlots = count;
      containerIdx = i;
    }
  }

  const containerDecl = decls[containerIdx];
  if (!containerDecl) {
    throw new MCPError('Internal error: no container found', ErrorCategory.UNKNOWN);
  }

  const otherDecls = decls.filter((_, i) => i !== containerIdx);
  const containerTag = containerDecl.tagName ?? '';

  // Fallback: no named slots → side-by-side layout
  if (maxSlots === 0) {
    return {
      html: decls.map((d) => `${buildOpeningTag(d)}</${d.tagName ?? ''}>`).join('\n'),
      description: `Side-by-side usage of ${tagNames.map((t) => `<${t}>`).join(', ')}. No named slots found for nesting.`,
      slots_used: {},
    };
  }

  // Build nested composition
  const containerSlots = containerDecl.slots ?? [];
  const namedSlots = containerSlots.filter((s) => s.name !== '');
  const hasDefaultSlot = containerSlots.some((s) => s.name === '');
  const slotsUsed: Record<string, string> = {};
  const lines: string[] = [buildOpeningTag(containerDecl)];

  let othersIdx = 0;

  for (const slot of namedSlots) {
    if (othersIdx >= otherDecls.length) break;
    const childDecl = otherDecls[othersIdx];
    if (!childDecl) break;
    const childTag = childDecl.tagName ?? '';
    // Insert slot attribute into the child's opening tag
    const childOpen = buildOpeningTag(childDecl);
    const childOpenWithSlot = childOpen.slice(0, -1) + ` slot="${slot.name}">`;
    lines.push(`  ${childOpenWithSlot}Content</${childTag}>`);
    slotsUsed[slot.name] = childTag;
    othersIdx++;
  }

  // Remaining children go in the default slot (if available) or appended
  const unslotted = otherDecls.slice(othersIdx);
  for (const d of unslotted) {
    const tag = d.tagName ?? '';
    if (hasDefaultSlot) {
      lines.push(`  ${buildOpeningTag(d)}Content</${tag}>`);
      slotsUsed['(default)'] = tag;
    } else {
      // No default slot: append with a comment
      lines.push(`  <!-- ${tag} has no matching slot -->`);
      lines.push(`  ${buildOpeningTag(d)}Content</${tag}>`);
    }
  }

  lines.push(`</${containerTag}>`);

  const composedNames = tagNames.map((t) => `<${t}>`).join(', ');
  return {
    html: lines.join('\n'),
    description: `Composition of ${composedNames} with <${containerTag}> as the container.`,
    slots_used: slotsUsed,
  };
}
