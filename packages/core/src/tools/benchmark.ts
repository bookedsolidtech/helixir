import { z } from 'zod';
import type { McpWcConfig } from '../config.js';
import { benchmarkLibraries } from '../handlers/benchmark.js';
import { createSuccessResponse, createErrorResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

const BenchmarkLibrariesArgsSchema = z.object({
  libraries: z
    .array(
      z.object({
        label: z.string(),
        cemPath: z
          .string()
          .refine((p) => !p.includes('..'), { message: 'Path traversal (..) is not allowed' })
          .refine((p) => !p.startsWith('/'), { message: 'Absolute paths are not allowed' }),
      }),
    )
    .min(2)
    .max(10),
});

export const BENCHMARK_TOOL_DEFINITIONS = [
  {
    name: 'benchmark_libraries',
    description:
      'Compares 2-10 web component libraries by normalizing metrics (properties, events, CSS properties, documentation quality, slots) and producing a weighted score and markdown comparison table.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraries: {
          type: 'array',
          description: 'Array of 2-10 libraries to compare.',
          minItems: 2,
          maxItems: 10,
          items: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: 'Human-readable name for the library (e.g. "Shoelace").',
              },
              cemPath: {
                type: 'string',
                description:
                  'Relative path (from projectRoot) to the Custom Elements Manifest JSON file. No absolute paths or ".." segments.',
              },
            },
            required: ['label', 'cemPath'],
            additionalProperties: false,
          },
        },
      },
      required: ['libraries'],
      additionalProperties: false,
    },
  },
];

export function isBenchmarkTool(name: string): boolean {
  return BENCHMARK_TOOL_DEFINITIONS.some((t) => t.name === name);
}

export async function handleBenchmarkCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
): Promise<MCPToolResult> {
  try {
    if (name === 'benchmark_libraries') {
      const { libraries } = BenchmarkLibrariesArgsSchema.parse(args);
      const result = await benchmarkLibraries(libraries, config);
      return createSuccessResponse(
        JSON.stringify({ scores: result.scores, formatted: result.formatted }, null, 2),
      );
    }

    return createErrorResponse(`Unknown benchmark tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}
