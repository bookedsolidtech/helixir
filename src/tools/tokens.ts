import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import { getDesignTokens, findToken } from '../handlers/tokens.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';

const GetDesignTokensArgsSchema = z.object({
  category: z.string().optional(),
});

const FindTokenArgsSchema = z.object({
  query: z.string(),
});

export const TOKEN_TOOL_DEFINITIONS = [
  {
    name: 'get_design_tokens',
    description:
      'List all design tokens from the configured tokens file, optionally filtered by category (e.g. "color", "spacing", "typography").',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description:
            'Optional category to filter by (e.g. "color", "spacing", "typography"). Case-insensitive.',
        },
      },
    },
  },
  {
    name: 'find_token',
    description:
      'Find design tokens by name pattern or value using a case-insensitive substring match.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'The search string to match against token names and values (case-insensitive substring match).',
        },
      },
      required: ['query'],
    },
  },
];

/**
 * Dispatches a token tool call by name and returns an MCPToolResult.
 * Called by the server's consolidated CallToolRequestSchema handler.
 */
export function handleTokenCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
): MCPToolResult {
  try {
    if (name === 'get_design_tokens') {
      const { category } = GetDesignTokensArgsSchema.parse(args);
      const tokens = getDesignTokens(config, category);
      return createSuccessResponse(JSON.stringify(tokens, null, 2));
    }

    if (name === 'find_token') {
      const { query } = FindTokenArgsSchema.parse(args);
      const tokens = findToken(config, query);
      return createSuccessResponse(JSON.stringify(tokens, null, 2));
    }

    return createErrorResponse(`Unknown token tool: ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return createErrorResponse(message);
  }
}

/**
 * Returns true if the given tool name belongs to the tokens tool group.
 * Used by the consolidated CallToolRequestSchema handler to dispatch correctly.
 */
export function isTokenTool(name: string): boolean {
  return TOKEN_TOOL_DEFINITIONS.some((t) => t.name === name);
}
