/**
 * MCP tool: list_helixir_tools (M6)
 *
 * Returns the machine-readable tool catalog so agents can auto-discover
 * which helixir tool to call for which task. Closes the field-report
 * gap: install ≠ adoption.
 */

import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import { buildToolCatalog } from '../handlers/tool-catalog.js';
import type { ToolCatalogEntryInput } from '../handlers/tool-catalog.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

const ListHelixirToolsArgsSchema = z.object({
  /**
   * Optional tag filter — restrict the result to tools matching ALL
   * supplied tags. Common tags: audit, verify, scaffold, validation,
   * tokens, extension, scoring, discovery, read, analyze.
   */
  tags: z.array(z.string()).optional(),
  /** Optional substring match on tool name. */
  search: z.string().optional(),
});

export const TOOL_CATALOG_TOOL_DEFINITIONS = [
  {
    name: 'list_helixir_tools',
    description:
      'Discover the helixir MCP tool catalog: every registered tool with its summary, when-to-call triggers, input shape, and tags. Filter by tag or substring. Use this FIRST when you are unsure which helixir tool fits a task — install ≠ adoption.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Restrict to tools matching ALL supplied tags (audit, verify, scaffold, validation, tokens, extension, scoring, discovery, read, analyze).',
        },
        search: {
          type: 'string',
          description: 'Substring match on tool name.',
        },
      },
      additionalProperties: false,
    },
  },
];

/**
 * The list of tool definitions to catalog. The dispatcher injects this
 * via `setCatalogedTools` at server startup so the catalog reflects
 * actual registered tools (not stale hand-maintained lists).
 */
let catalogedTools: ToolCatalogEntryInput[] = [];

export function setCatalogedTools(tools: ToolCatalogEntryInput[]): void {
  catalogedTools = tools;
}

export async function handleToolCatalogCall(
  name: string,
  args: unknown,
  config: McpWcConfig,
): Promise<MCPToolResult> {
  try {
    if (name === 'list_helixir_tools') {
      const parsed = ListHelixirToolsArgsSchema.parse(args);
      const catalog = buildToolCatalog(catalogedTools);
      let filtered = catalog.tools;
      if (parsed.tags && parsed.tags.length > 0) {
        const required = new Set(parsed.tags);
        filtered = filtered.filter((t) => [...required].every((tag) => t.tags.includes(tag)));
      }
      if (parsed.search !== undefined && parsed.search !== '') {
        const q = parsed.search.toLowerCase();
        filtered = filtered.filter(
          (t) => t.name.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q),
        );
      }
      return createSuccessResponse(
        JSON.stringify(
          {
            schemaVersion: 1,
            generatedAt: catalog.generatedAt,
            toolCount: filtered.length,
            tools: filtered,
          },
          null,
          2,
        ),
      );
    }
    return createErrorResponse(`Unknown tool-catalog tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err, config.projectRoot);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

export function isToolCatalogTool(name: string): boolean {
  return TOOL_CATALOG_TOOL_DEFINITIONS.some((t) => t.name === name);
}
