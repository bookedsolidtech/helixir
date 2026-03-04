import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import type { Cem, CemDeclaration } from '../handlers/cem.js';
import { CemSchema } from '../handlers/cem.js';
import {
  scoreComponent,
  scoreAllComponents,
  getHealthTrend,
  getHealthDiff,
} from '../handlers/health.js';
import { analyzeAccessibility, analyzeAllAccessibility } from '../handlers/accessibility.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

// ─── Arg schemas ──────────────────────────────────────────────────────────────

const ScoreComponentArgsSchema = z.object({
  tagName: z.string(),
  libraryId: z.string().optional(),
});

const ScoreAllComponentsArgsSchema = z.object({});

const GetHealthTrendArgsSchema = z.object({
  tagName: z.string(),
  days: z.number().int().positive().optional(),
  libraryId: z.string().optional(),
});

const GetHealthDiffArgsSchema = z.object({
  tagName: z.string(),
  baseBranch: z.string().optional(),
  libraryId: z.string().optional(),
});

const AnalyzeAccessibilityArgsSchema = z.object({
  tagName: z.string().optional(),
});

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const HEALTH_TOOL_DEFINITIONS = [
  {
    name: 'score_component',
    description:
      'Returns the latest health score for a single web component, including grade, dimension scores, and issues.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The tag name of the component to score (e.g. "my-button").',
        },
        libraryId: {
          type: 'string',
          description: 'The library ID to scope the health history lookup (default: "default").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'score_all_components',
    description:
      'Returns health scores for all components in the library. Maps over all CEM declarations.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_health_trend',
    description:
      'Returns the health trend for a component over the last N days, including data points, trend direction, and change percent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The tag name of the component (e.g. "my-button").',
        },
        days: {
          type: 'number',
          description: 'Number of days to look back (default: 7).',
        },
        libraryId: {
          type: 'string',
          description: 'The library ID to scope the health history lookup (default: "default").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_health_diff',
    description:
      'Compares health between the current branch and a base branch, returning before/after scores with improvement or regression verdict.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The tag name of the component (e.g. "my-button").',
        },
        baseBranch: {
          type: 'string',
          description: 'The base branch to compare against (default: "main").',
        },
        libraryId: {
          type: 'string',
          description: 'The library ID to scope the health history lookup (default: "default").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'analyze_accessibility',
    description:
      'Analyzes the accessibility profile of one or all web components from CEM data. Checks for ARIA roles, aria-* attributes, form association, keyboard events, focus management, disabled state, label support, and accessibility documentation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description:
            'The tag name of the component to analyze (e.g. "my-button"). Omit to analyze all components.',
        },
      },
      additionalProperties: false,
    },
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function getAllDeclarations(cem: Cem): CemDeclaration[] {
  return cem.modules.flatMap((m) => m.declarations ?? []);
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Dispatches a health tool call by name and returns an MCPToolResult.
 * Called by the server's consolidated CallToolRequestSchema handler.
 */
export async function handleHealthCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
  cem?: Cem,
): Promise<MCPToolResult> {
  try {
    if (name === 'score_component') {
      const { tagName, libraryId } = ScoreComponentArgsSchema.parse(args);
      // Pass the CEM declaration so scoreComponent can fall back to CEM-derived scoring
      // when no pre-computed history files exist for this component.
      const cemDecl = cem ? getAllDeclarations(cem).find((d) => d.tagName === tagName) : undefined;
      const result = await scoreComponent(config, tagName, cemDecl, libraryId);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'score_all_components') {
      ScoreAllComponentsArgsSchema.parse(args);
      // Use the in-memory CEM cache when available to avoid unnecessary disk reads
      // and ensure consistency with the validated CEM loaded at startup.
      const cemData =
        cem ??
        CemSchema.parse(
          JSON.parse(String(await readFile(resolve(config.projectRoot, config.cemPath), 'utf-8'))),
        );
      const declarations = cemData.modules.flatMap((m) => m.declarations ?? []);
      const results = await scoreAllComponents(config, declarations);
      return createSuccessResponse(JSON.stringify(results, null, 2));
    }

    if (name === 'get_health_trend') {
      const { tagName, days, libraryId } = GetHealthTrendArgsSchema.parse(args);
      const result = await getHealthTrend(config, tagName, days, libraryId);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'get_health_diff') {
      const { tagName, baseBranch, libraryId } = GetHealthDiffArgsSchema.parse(args);
      const result = await getHealthDiff(
        config,
        tagName,
        baseBranch,
        undefined,
        undefined,
        libraryId,
      );
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'analyze_accessibility') {
      const { tagName } = AnalyzeAccessibilityArgsSchema.parse(args);
      const declarations = cem ? getAllDeclarations(cem) : [];
      if (tagName !== undefined) {
        const decl = declarations.find((d) => d.tagName === tagName);
        if (!decl) {
          return createErrorResponse(`Component '${tagName}' not found in CEM`);
        }
        return createSuccessResponse(JSON.stringify(analyzeAccessibility(decl), null, 2));
      }
      return createSuccessResponse(JSON.stringify(analyzeAllAccessibility(declarations), null, 2));
    }

    return createErrorResponse(`Unknown health tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the health tool group.
 * Used by the consolidated CallToolRequestSchema handler to dispatch correctly.
 */
export function isHealthTool(name: string): boolean {
  return HEALTH_TOOL_DEFINITIONS.some((t) => t.name === name);
}
