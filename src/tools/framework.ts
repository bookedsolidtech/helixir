import type { McpWcConfig } from '../config.js';
import { detectFramework } from '../handlers/framework.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

export const FRAMEWORK_TOOL_DEFINITIONS = [
  {
    name: 'detect_framework',
    description:
      'Identifies which web component framework the project uses by inspecting package.json dependencies, CEM metadata, and config files. Returns the framework name, version, CEM generator, and regeneration notes.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a framework tool call by name and returns an MCPToolResult.
 */
export function handleFrameworkCall(
  name: string,
  _args: Record<string, unknown>,
  config: McpWcConfig,
): MCPToolResult {
  try {
    if (name === 'detect_framework') {
      const result = detectFramework(config);
      return createSuccessResponse(result.formatted);
    }
    return createErrorResponse(`Unknown framework tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the framework tool group.
 */
export function isFrameworkTool(name: string): boolean {
  return FRAMEWORK_TOOL_DEFINITIONS.some((t) => t.name === name);
}
