import type { McpWcConfig } from '../config.js';
import { detectThemeSupport } from '../handlers/theme-detection.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

export const STYLING_TOOL_DEFINITIONS = [
  {
    name: 'detect_theme_support',
    description:
      'Analyzes the component library for theming capabilities. Scans source files to detect CSS custom property usage, theme files, dark mode support, and color-scheme configuration. Returns the theming approach, detected token categories, and actionable recommendations.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a styling tool call by name and returns an MCPToolResult.
 * Called by the server's consolidated CallToolRequestSchema handler.
 */
export async function handleStylingCall(
  name: string,
  _args: Record<string, unknown>,
  config: McpWcConfig,
): Promise<MCPToolResult> {
  try {
    if (name === 'detect_theme_support') {
      const result = await detectThemeSupport(config);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    return createErrorResponse(`Unknown styling tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the styling tool group.
 * Used by the consolidated CallToolRequestSchema handler to dispatch correctly.
 */
export function isStylingTool(name: string): boolean {
  return STYLING_TOOL_DEFINITIONS.some((t) => t.name === name);
}
