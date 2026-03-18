import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import type { Cem } from '../handlers/cem.js';
import { validateTypeDefinitions } from '../handlers/type-definitions.js';
import { handleToolError } from '../shared/error-handling.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { FilePathSchema } from '../shared/validation.js';

const ValidateTypeDefinitionsArgsSchema = z.object({
  dtsPath: FilePathSchema,
  tagNames: z.array(z.string()).optional(),
});

export const TYPE_DEFINITIONS_TOOL_DEFINITIONS = [
  {
    name: 'validate_type_definitions',
    description:
      'Compare a TypeScript .d.ts type definitions file against the Custom Elements Manifest (CEM) to detect drift. Reports missing attributes, properties, events, and type mismatches. Returns a structured diff that can be used to auto-fix stale type definitions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        dtsPath: {
          type: 'string',
          description:
            'Relative path to the TypeScript type definitions file (e.g. "helix.d.ts"). No path traversal or absolute paths allowed.',
        },
        tagNames: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of component tag names to check (e.g. ["hx-tabs", "hx-button"]). Checks all components if omitted.',
        },
      },
      required: ['dtsPath'],
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a type definitions tool call by name and returns an MCPToolResult.
 * Called by the server's consolidated CallToolRequestSchema handler.
 */
export function handleTypeDefinitionsCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
  cem: Cem,
): MCPToolResult {
  try {
    if (name === 'validate_type_definitions') {
      const { dtsPath, tagNames } = ValidateTypeDefinitionsArgsSchema.parse(args);
      const result = validateTypeDefinitions(config, cem, dtsPath, tagNames);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }
    return createErrorResponse(`Unknown type definitions tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the type definitions tool group.
 */
export function isTypeDefinitionsTool(name: string): boolean {
  return TYPE_DEFINITIONS_TOOL_DEFINITIONS.some((t) => t.name === name);
}
