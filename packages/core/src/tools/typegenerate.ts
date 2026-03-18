import { z } from 'zod';

import type { Cem } from '../handlers/cem.js';
import { generateTypes } from '../handlers/typegenerate.js';
import { handleToolError } from '../shared/error-handling.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';

const GenerateTypesArgsSchema = z.object({
  libraryId: z.string().optional(),
});

export const TYPEGENERATE_TOOL_DEFINITIONS = [
  {
    name: 'generate_types',
    description:
      'Generates TypeScript type definitions (.d.ts content) for all custom elements in the CEM. ' +
      'Attribute interface property names are sourced from the CEM `attribute` field (the HTML attribute name), ' +
      'not the JavaScript property name, ensuring the output accurately reflects the component API. ' +
      'Returns a string ready to save as helix.d.ts or similar.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
      },
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a typegenerate tool call by name and returns an MCPToolResult.
 */
export function handleTypegenerateCall(
  name: string,
  _args: Record<string, unknown>,
  cem: Cem,
): MCPToolResult {
  try {
    if (name === 'generate_types') {
      const result = generateTypes(cem);
      return createSuccessResponse(
        `// ${result.componentCount} component(s) generated\n\n${result.content}`,
      );
    }

    return createErrorResponse(`Unknown typegenerate tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the typegenerate tool group.
 */
export function isTypegenerateTool(name: string): boolean {
  return TYPEGENERATE_TOOL_DEFINITIONS.some((t) => t.name === name);
}
