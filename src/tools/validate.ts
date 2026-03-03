import { z } from 'zod';
import type { Cem } from '../handlers/cem.js';
import { validateUsage } from '../handlers/validate.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

const ValidateUsageArgsSchema = z.object({
  tagName: z.string(),
  html: z.string(),
});

export const VALIDATE_TOOL_DEFINITIONS = [
  {
    name: 'validate_usage',
    description:
      'Validates proposed HTML usage of a web component against its CEM spec. Checks for unknown attributes, deprecated properties, invalid slot names, and enum type mismatches. Returns a pass/fail result with specific issues and "did you mean?" suggestions for typos.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
        tagName: {
          type: 'string',
          description: 'The custom element tag name (e.g. "my-button").',
        },
        html: {
          type: 'string',
          description:
            'The HTML snippet to validate (e.g. "<my-button variant=\\"primary\\">Click</my-button>").',
        },
      },
      required: ['tagName', 'html'],
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a validate tool call by name and returns an MCPToolResult.
 */
export function handleValidateCall(
  name: string,
  args: Record<string, unknown>,
  cem: Cem,
): MCPToolResult {
  try {
    if (name === 'validate_usage') {
      const { tagName, html } = ValidateUsageArgsSchema.parse(args);
      const result = validateUsage(tagName, html, cem);
      return createSuccessResponse(result.formatted);
    }
    return createErrorResponse(`Unknown validate tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the validate tool group.
 */
export function isValidateTool(name: string): boolean {
  return VALIDATE_TOOL_DEFINITIONS.some((t) => t.name === name);
}
