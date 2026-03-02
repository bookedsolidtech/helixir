import { z } from 'zod';
import type { McpWcConfig } from '../config.js';
import { resolveCdnCem } from '../handlers/cdn.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

const ResolveCdnCemArgsSchema = z.object({
  package: z.string(),
  version: z.string().optional().default('latest'),
  registry: z.enum(['jsdelivr', 'unpkg']).optional().default('jsdelivr'),
});

export const CDN_TOOL_DEFINITIONS = [
  {
    name: 'resolve_cdn_cem',
    description:
      "Fetch and cache a web component library's Custom Elements Manifest (CEM) from a CDN registry (jsDelivr or UNPKG) by npm package name. Useful when the library is loaded via CDN without a local npm install.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        package: {
          type: 'string',
          description: 'npm package name, e.g. "@shoelace-style/shoelace"',
        },
        version: {
          type: 'string',
          description: 'Package version, e.g. "2.15.0". Defaults to "latest".',
        },
        registry: {
          type: 'string',
          enum: ['jsdelivr', 'unpkg'],
          description: 'Which CDN to use. Default: "jsdelivr".',
        },
      },
      required: ['package'],
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a CDN tool call by name and returns an MCPToolResult.
 */
export async function handleCdnCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
): Promise<MCPToolResult> {
  try {
    if (name === 'resolve_cdn_cem') {
      const { package: pkg, version, registry } = ResolveCdnCemArgsSchema.parse(args);
      const result = await resolveCdnCem(pkg, version, registry, config);
      return createSuccessResponse(result.formatted);
    }
    return createErrorResponse(`Unknown CDN tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the CDN tool group.
 */
export function isCdnTool(name: string): boolean {
  return CDN_TOOL_DEFINITIONS.some((t) => t.name === name);
}
