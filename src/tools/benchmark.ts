import type { McpWcConfig } from '../config.js';
import { BenchmarkLibrariesArgsSchema, benchmarkLibraries } from '../handlers/benchmark.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

// --- Tool definitions ---

export const BENCHMARK_TOOL_DEFINITIONS = [
  {
    name: 'benchmark_libraries',
    description:
      'Compare multiple web component libraries side-by-side on property coverage, events, slots, CSS custom properties, and documentation quality. ' +
      'Provide 2–10 libraries with their CEM file paths (relative to project root). Returns a markdown table with scores and category winners.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: 'Display label for this library (e.g. "Shoelace", "Spectrum").',
              },
              cemPath: {
                type: 'string',
                description:
                  'Relative path to the custom-elements.json file (e.g. "node_modules/@shoelace-style/shoelace/dist/custom-elements.json").',
              },
            },
            required: ['label', 'cemPath'],
          },
          minItems: 2,
          maxItems: 10,
          description: 'List of libraries to benchmark (2–10 entries).',
        },
      },
      required: ['libraries'],
      additionalProperties: false,
    },
  },
];

// --- Handler ---

export async function handleBenchmarkCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
): Promise<MCPToolResult> {
  try {
    if (name === 'benchmark_libraries') {
      const { libraries } = BenchmarkLibrariesArgsSchema.parse(args);
      const { formatted } = await benchmarkLibraries(libraries, config);
      return createSuccessResponse(formatted);
    }

    return createErrorResponse(`Unknown benchmark tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

export function isBenchmarkTool(name: string): boolean {
  return BENCHMARK_TOOL_DEFINITIONS.some((t) => t.name === name);
}
