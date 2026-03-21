import { parseCem } from './cem.js';
import type { ComponentMetadata, Cem } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

/**
 * Synthesizes a human-readable narrative prose description from a CEM declaration.
 * Returns 3-5 paragraph markdown suitable for LLM consumption.
 */
export function buildNarrative(meta: ComponentMetadata): string {
  const sections: string[] = [];

  // --- Heading ---
  sections.push(`## ${meta.tagName}`);

  // --- What it is ---
  const description = meta.description || `A \`${meta.tagName}\` custom element.`;
  const fields = meta.members.filter((m) => m.kind === 'field');
  let whatItIs = `**What it is:** ${description}`;

  if (fields.length > 0) {
    // Pull out enum/variant fields for the summary
    const enumFields = fields.filter((f) => f.type.includes("'") || f.type.includes('|'));
    if (enumFields.length > 0) {
      const variantSummaries = enumFields
        .slice(0, 3)
        .map((f) => {
          const options = f.type
            .split('|')
            .map((s) => s.trim().replace(/'/g, ''))
            .filter(Boolean)
            .join(', ');
          return `\`${f.name}\` (${options})`;
        })
        .join('; ');
      whatItIs += ` It supports configurable ${variantSummaries}.`;
    }
  }

  sections.push(whatItIs);

  // --- When to use it ---
  const whenLines: string[] = [
    `**When to use it:** Use \`${meta.tagName}\` when you need ${description.toLowerCase().replace(/\.$/, '')}.`,
  ];

  const booleanFields = fields.filter((f) => f.type === 'boolean' || f.type.includes('boolean'));
  if (booleanFields.length > 0) {
    const boolSummary = booleanFields
      .slice(0, 3)
      .map(
        (f) =>
          `\`${f.name}\`${f.description ? ` (${f.description.toLowerCase().replace(/\.$/, '')})` : ''}`,
      )
      .join(', ');
    whenLines.push(`Toggle boolean properties as needed: ${boolSummary}.`);
  }

  sections.push(whenLines.join(' '));

  // --- How to customize it (CSS) ---
  if (meta.cssProperties.length > 0 || meta.cssParts.length > 0) {
    const customizeLines: string[] = ['**How to customize it:**'];

    if (meta.cssProperties.length > 0) {
      customizeLines.push(`\`${meta.tagName}\` exposes CSS custom properties for theming:`);
      const topProps = meta.cssProperties.slice(0, 5);
      topProps.forEach((p) => {
        const desc = p.description ? ` — ${p.description}` : '';
        const exampleVal = p.default ?? 'initial';
        customizeLines.push(`- \`${p.name}\`: \`var(${p.name}, ${exampleVal})\`${desc}`);
      });
      if (meta.cssProperties.length > 5) {
        customizeLines.push(`- *(and ${meta.cssProperties.length - 5} more)*`);
      }
      const propLines = topProps
        .map((p) => `  ${p.name}: ${p.default ?? 'initial'};`)
        .join('\n');
      customizeLines.push(`\nExample:\n\`\`\`css\n${meta.tagName} {\n${propLines}\n}\n\`\`\``);
    }

    if (meta.cssParts.length > 0) {
      customizeLines.push(`\nCSS parts for structural styling:`);
      const topParts = meta.cssParts.slice(0, 4);
      topParts.forEach((p) => {
        const desc = p.description ? ` — ${p.description}` : '';
        customizeLines.push(`- \`${meta.tagName}::part(${p.name})\`${desc}`);
      });
      const partExamples = topParts
        .slice(0, 2)
        .map((p) => `${meta.tagName}::part(${p.name}) {\n  /* custom styles */\n}`)
        .join('\n\n');
      customizeLines.push(`\nExample:\n\`\`\`css\n${partExamples}\n\`\`\``);
    }

    customizeLines.push(
      `\n**Do NOT:** Use descendant selectors like \`${meta.tagName} .inner\` — Shadow DOM prevents these from reaching internal elements. Only CSS custom properties and \`::part()\` selectors work across the shadow boundary.`,
    );

    sections.push(customizeLines.join('\n'));
  }

  // --- Slots ---
  if (meta.slots.length > 0) {
    const slotLines: string[] = ['**Slots:**'];
    const defaultSlot = meta.slots.find((s) => s.name === '');
    if (defaultSlot) {
      const desc = defaultSlot.description || 'Default content.';
      slotLines.push(`The default slot accepts ${desc.toLowerCase().replace(/\.$/, '')}.`);
    }
    const namedSlots = meta.slots.filter((s) => s.name !== '');
    if (namedSlots.length > 0) {
      slotLines.push(`Named slots:`);
      namedSlots.slice(0, 5).forEach((s) => {
        const desc = s.description ? ` — ${s.description}` : '';
        slotLines.push(`- \`${s.name}\`${desc}`);
      });
    }
    // Example usage with slots
    if (meta.slots.length > 0) {
      const slotExample = namedSlots
        .slice(0, 2)
        .map((s) => ` slot="${s.name}"`)
        .join('');
      slotLines.push(
        `\nExample:\n\`\`\`html\n<${meta.tagName}${slotExample ? `><span${slotExample}>...</span>` : ''}></${meta.tagName}>\n\`\`\``,
      );
    }
    sections.push(slotLines.join('\n'));
  }

  // --- Common patterns (events) ---
  if (meta.events.length > 0) {
    const eventLines: string[] = ['**Events:**'];
    meta.events.slice(0, 5).forEach((e) => {
      const typeStr = e.type ? ` (\`${e.type}\`)` : '';
      const desc = e.description ? ` — ${e.description}` : '';
      eventLines.push(`- \`${e.name}\`${typeStr}${desc}`);
    });
    sections.push(eventLines.join('\n'));
  }

  return sections.join('\n\n');
}

/**
 * Fetches a component's CEM metadata and returns a narrative prose description.
 */
export function getComponentNarrative(tagName: string, cem: Cem): string {
  let meta: ComponentMetadata;
  try {
    meta = parseCem(tagName, cem);
  } catch (err) {
    if (err instanceof MCPError) {
      throw err;
    }
    throw new MCPError(
      `Failed to load component "${tagName}": ${err instanceof Error ? err.message : String(err)}`,
      ErrorCategory.VALIDATION,
    );
  }
  return buildNarrative(meta);
}
