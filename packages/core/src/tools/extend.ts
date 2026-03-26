import { z } from 'zod';

import type { Cem } from '../handlers/cem.js';
import { extendComponent } from '../handlers/extend.js';
import { handleToolError } from '../shared/error-handling.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';

const ExtendComponentArgsSchema = z.object({
  parentTagName: z.string(),
  newTagName: z.string(),
  newClassName: z.string().optional(),
});

export const EXTEND_TOOL_DEFINITIONS = [
  {
    name: 'extend_component',
    description:
      'Generates a properly subclassed TypeScript component extending an existing web component. ' +
      'Produces the correct inheritance chain (class NewClass extends ParentClass), ' +
      'CEM @customElement annotation, CSS part forwarding guidance (exportparts), ' +
      'inherited slot documentation, TypeScript HTMLElementTagNameMap declaration, ' +
      'and Shadow DOM style encapsulation warnings. ' +
      'Prevents common extension anti-patterns such as broken inheritance chains, ' +
      'missing exportparts declarations, and style isolation surprises.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
        parentTagName: {
          type: 'string',
          description: 'Tag name of the existing parent component to extend (e.g. "hx-button").',
        },
        newTagName: {
          type: 'string',
          description:
            'Tag name for the new subclass component (e.g. "my-custom-button"). Must contain a hyphen.',
        },
        newClassName: {
          type: 'string',
          description:
            'Optional explicit class name for the new subclass. ' +
            'Defaults to PascalCase derived from newTagName (e.g. "MyCustomButton").',
        },
      },
      required: ['parentTagName', 'newTagName'],
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches an extend tool call by name and returns an MCPToolResult.
 * Called by the server's consolidated CallToolRequestSchema handler.
 */
export function handleExtendCall(
  name: string,
  args: Record<string, unknown>,
  cem: Cem,
): MCPToolResult {
  try {
    if (name === 'extend_component') {
      const { parentTagName, newTagName, newClassName } = ExtendComponentArgsSchema.parse(args);
      const result = extendComponent(parentTagName, newTagName, cem, newClassName);

      const warningBlock = result.warnings.map((w, i) => `${i + 1}. ⚠️  ${w}`).join('\n');

      const output = [
        `// Generated subclass: ${result.newClassName} extends ${result.parentClassName}`,
        `// Parent: ${result.parentTagName} → New: ${result.newTagName}`,
        `// Inherited CSS parts: ${result.inheritedCssParts.length > 0 ? result.inheritedCssParts.join(', ') : '(none)'}`,
        `// Inherited slots: ${result.inheritedSlots.length > 0 ? result.inheritedSlots.join(', ') : '(none)'}`,
        ``,
        result.source,
        ``,
        `---`,
        `Shadow DOM Style Encapsulation Warnings:`,
        warningBlock,
      ].join('\n');

      return createSuccessResponse(output);
    }

    return createErrorResponse(`Unknown extend tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the extend tool group.
 * Used by the consolidated CallToolRequestSchema handler to dispatch correctly.
 */
export function isExtendTool(name: string): boolean {
  return EXTEND_TOOL_DEFINITIONS.some((t) => t.name === name);
}
