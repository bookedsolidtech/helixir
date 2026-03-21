import { parseCem } from './cem.js';
import type { ComponentMetadata, Cem } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';
import { getShadowDomWarnings } from '../shared/mcp-helpers.js';

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
      const propLines = topProps.map((p) => `  ${p.name}: ${p.default ?? 'initial'};`).join('\n');
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

    // Build component-tailored Shadow DOM constraints
    const constraints: string[] = [];
    const allWarnings = getShadowDomWarnings(meta.tagName);

    // Always include core encapsulation warning (first 2 warnings)
    constraints.push(...allWarnings.slice(0, 2));

    // Include ::part() warnings only if the component has parts
    if (meta.cssParts.length > 0) {
      constraints.push(...allWarnings.filter((w) => w.includes('::part()')));
    }

    // Include ::slotted() warning only if the component has slots
    if (meta.slots.length > 0) {
      constraints.push(...allWarnings.filter((w) => w.includes('::slotted()')));
    }

    // Always include :host, display:contents, and var() fallback warnings
    constraints.push(
      ...allWarnings.filter(
        (w) =>
          w.includes(':host') || w.includes('display: contents') || w.includes('fallback values'),
      ),
    );

    // Deduplicate (some may overlap)
    const uniqueConstraints = [...new Set(constraints)];

    customizeLines.push(`\n**Shadow DOM constraints:**`);
    for (const c of uniqueConstraints) {
      customizeLines.push(`- ${c}`);
    }

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

  // --- Common mistakes (component-specific) ---
  const mistakes: string[] = [];

  if (meta.cssParts.length > 0) {
    const partNames = meta.cssParts.map((p) => `\`${p.name}\``).join(', ');
    mistakes.push(
      `Only these CSS parts exist: ${partNames}. ` +
        `Any other part name in \`::part()\` will silently fail.`,
    );
  }

  if (meta.cssProperties.length > 0 && meta.cssParts.length === 0) {
    mistakes.push(
      `This component has NO CSS parts — use CSS custom properties only. ` +
        `\`::part()\` selectors will not match anything.`,
    );
  }

  if (meta.cssProperties.length === 0 && meta.cssParts.length === 0) {
    mistakes.push(
      `This component exposes NO CSS API (no parts, no custom properties). ` +
        `You cannot style its internals. Only the host element box can be styled.`,
    );
  }

  if (meta.events.some((e) => e.name.includes('-'))) {
    mistakes.push(
      `Custom events (with hyphens) cannot use React \`onXxx\` props. ` +
        `Use \`ref.current.addEventListener()\` instead.`,
    );
  }

  if (meta.slots.length > 0 && meta.cssParts.length > 0) {
    mistakes.push(
      `Style slotted content in light DOM CSS (before it enters the slot), ` +
        `not with \`::slotted()\` in your consumer stylesheet.`,
    );
  }

  if (mistakes.length > 0) {
    const mistakeLines = ['**Common mistakes:**', ...mistakes.map((m) => `- ${m}`)];
    mistakeLines.push('', `*Run \`styling_preflight\` with your CSS to validate all references.*`);
    sections.push(mistakeLines.join('\n'));
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
