import { z } from 'zod';
import type { McpWcConfig } from '../config.js';
import { parseCem, validateCompleteness } from '../handlers/cem.js';
import type { Cem } from '../handlers/cem.js';
import { suggestUsage, generateImport } from '../handlers/suggest.js';
import { getComponentNarrative } from '../handlers/narrative.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

const GetComponentArgsSchema = z.object({
  tagName: z.string(),
});

const ValidateCemArgsSchema = z.object({
  tagName: z.string(),
});

const SuggestUsageArgsSchema = z.object({
  tagName: z.string(),
});

const GenerateImportArgsSchema = z.object({
  tagName: z.string(),
});

const GetComponentNarrativeArgsSchema = z.object({
  tagName: z.string(),
});

export const COMPONENT_TOOL_DEFINITIONS = [
  {
    name: 'get_component',
    description:
      'Get full metadata for a web component by tag name, including members, events, slots, CSS parts, and CSS properties.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name (e.g. "my-button").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'validate_cem',
    description:
      'Validates the documentation completeness of a component in the Custom Elements Manifest. Returns a pass/fail result with a score and list of issues.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name to validate.',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_usage',
    description:
      'Generates an HTML usage snippet for a component, showing key attributes with their default values. Lists required vs optional attributes and variant options from union types.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name (e.g. "my-button").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_import',
    description:
      'Generates import statements for a component based on the CEM exports and package.json. Returns both a side-effect import and a named import.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name (e.g. "my-button").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_component_narrative',
    description:
      'Returns a 3-5 paragraph markdown prose description of a component — what it is, when to use it, how to customize it, its slots, and its events. Optimized for LLM comprehension.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name (e.g. "my-button").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a component tool call by name and returns an MCPToolResult.
 * Called by the server's consolidated CallToolRequestSchema handler.
 */
export async function handleComponentCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
  cem: Cem,
): Promise<MCPToolResult> {
  try {
    if (name === 'get_component') {
      const { tagName } = GetComponentArgsSchema.parse(args);
      const meta = parseCem(tagName, cem);
      return createSuccessResponse(JSON.stringify(meta, null, 2));
    }

    if (name === 'validate_cem') {
      const { tagName } = ValidateCemArgsSchema.parse(args);
      const result = validateCompleteness(tagName, cem);
      const status = result.score === 100 ? 'PASS' : 'FAIL';
      const issueLines =
        result.issues.length > 0
          ? result.issues.map((i) => `  - ${i}`).join('\n')
          : '  (no issues)';
      const output = `Status: ${status}\nScore: ${result.score}/100\n\nIssues:\n${issueLines}`;
      return createSuccessResponse(output);
    }

    if (name === 'suggest_usage') {
      const { tagName } = SuggestUsageArgsSchema.parse(args);
      const result = await suggestUsage(tagName, config, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'generate_import') {
      const { tagName } = GenerateImportArgsSchema.parse(args);
      const result = await generateImport(tagName, config, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'get_component_narrative') {
      const { tagName } = GetComponentNarrativeArgsSchema.parse(args);
      const narrative = await getComponentNarrative(tagName, cem);
      return createSuccessResponse(narrative);
    }

    return createErrorResponse(`Unknown component tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the component tool group.
 * Used by the consolidated CallToolRequestSchema handler to dispatch correctly.
 */
export function isComponentTool(name: string): boolean {
  return COMPONENT_TOOL_DEFINITIONS.some((t) => t.name === name);
}
