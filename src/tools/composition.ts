import { z } from 'zod';

import { getCompositionExample } from '../handlers/composition.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';
import type { Cem } from '../handlers/cem.js';

const GetCompositionExampleArgsSchema = z.object({
  tag_names: z.array(z.string()).min(1).max(4),
});

export const COMPOSITION_TOOL_DEFINITIONS = [
  {
    name: 'get_composition_example',
    description:
      'Generates a realistic HTML snippet showing how to compose two or more web components together. Slot assignments are drawn from CEM slot definitions. Provide 1–4 component tag names; a single tag name returns a standalone usage example.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tag_names: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 4,
          description:
            'Array of 1–4 custom element tag names to compose (e.g. ["my-card", "my-button"]).',
        },
      },
      required: ['tag_names'],
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a composition tool call by name and returns an MCPToolResult.
 */
export function handleCompositionCall(
  name: string,
  args: Record<string, unknown>,
  cem: Cem,
): MCPToolResult {
  try {
    if (name === 'get_composition_example') {
      const { tag_names } = GetCompositionExampleArgsSchema.parse(args);
      const result = getCompositionExample(cem, tag_names);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    return createErrorResponse(`Unknown composition tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the composition tool group.
 */
export function isCompositionTool(name: string): boolean {
  return COMPOSITION_TOOL_DEFINITIONS.some((t) => t.name === name);
}
