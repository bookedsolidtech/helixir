import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import { getFileDiagnostics, getProjectDiagnostics } from '../handlers/typescript.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { FilePathSchema } from '../shared/validation.js';
import { handleToolError } from '../shared/error-handling.js';

const GetFileDiagnosticsArgsSchema = z.object({
  filePath: FilePathSchema,
});

export const TYPESCRIPT_TOOL_DEFINITIONS = [
  {
    name: 'get_file_diagnostics',
    description:
      'Run TypeScript diagnostics on a single file and return any type errors or warnings.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: {
          type: 'string',
          description:
            'Relative path to the TypeScript file (no path traversal or absolute paths allowed).',
        },
      },
      required: ['filePath'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_project_diagnostics',
    description:
      'Run a full TypeScript diagnostic pass on the entire project and return error and warning counts.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a TypeScript tool call by name and returns an MCPToolResult.
 * Called by the server's consolidated CallToolRequestSchema handler.
 */
export function handleTypeScriptCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
): MCPToolResult {
  try {
    if (name === 'get_file_diagnostics') {
      const { filePath } = GetFileDiagnosticsArgsSchema.parse(args);
      const diagnostics = getFileDiagnostics(config, filePath);
      return createSuccessResponse(JSON.stringify(diagnostics, null, 2));
    }

    if (name === 'get_project_diagnostics') {
      const result = getProjectDiagnostics(config);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    return createErrorResponse(`Unknown TypeScript tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the TypeScript tool group.
 * Used by the consolidated CallToolRequestSchema handler to dispatch correctly.
 */
export function isTypeScriptTool(name: string): boolean {
  return TYPESCRIPT_TOOL_DEFINITIONS.some((t) => t.name === name);
}
