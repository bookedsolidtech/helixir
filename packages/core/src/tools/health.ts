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
  getHealthSummary,
  scoreComponentMultiDimensional,
  scoreAllComponentsMultiDimensional,
} from '../handlers/health.js';
import { analyzeAccessibility, analyzeAllAccessibility } from '../handlers/accessibility.js';
import { generateAuditReport } from '../handlers/audit-report.js';
import { DIMENSION_REGISTRY } from '../handlers/dimensions.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';
import { FilePathSchema } from '../shared/validation.js';

// ─── Arg schemas ──────────────────────────────────────────────────────────────

const ScoreComponentArgsSchema = z.object({
  tagName: z.string(),
  libraryId: z.string().optional(),
  multiDimensional: z.boolean().optional(),
});

const ScoreAllComponentsArgsSchema = z.object({
  multiDimensional: z.boolean().optional(),
});

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

const GetHealthSummaryArgsSchema = z.object({
  libraryId: z.string().optional(),
});

const AnalyzeAccessibilityArgsSchema = z.object({
  tagName: z.string().optional(),
});

const AuditLibraryArgsSchema = z.object({
  outputPath: FilePathSchema.optional(),
  libraryId: z.string().optional(),
});

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const HEALTH_TOOL_DEFINITIONS = [
  {
    name: 'score_component',
    description:
      'Returns the latest health score for a single web component, including grade, dimension scores, and issues. Set multiDimensional=true for the full 11-dimension enterprise scoring with tier gates.',
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
        multiDimensional: {
          type: 'boolean',
          description:
            'When true, returns the full multi-dimensional health score with 11 dimensions, enterprise grade algorithm, and confidence levels. Default: false for backward compatibility.',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'score_all_components',
    description:
      'Returns health scores for all components in the library. Set multiDimensional=true for full 11-dimension enterprise scoring.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        multiDimensional: {
          type: 'boolean',
          description:
            'When true, returns multi-dimensional scores with 11 dimensions per component. Default: false.',
        },
      },
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
    name: 'get_health_summary',
    description:
      'Returns aggregate health statistics for all components: average score, grade distribution, total count, library-wide trend, per-dimension averages, and components needing attention (score below 70).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
      },
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
  {
    name: 'audit_library',
    description:
      'Generates a JSONL audit report scoring every component across 11 dimensions. Returns file path (if outputPath given) and summary stats. Each line is valid JSON for one component.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        outputPath: {
          type: 'string',
          description:
            'Optional file path (relative to project root) to write the JSONL report to. e.g. "audit/health.jsonl"',
        },
        libraryId: {
          type: 'string',
          description: 'The library ID to audit (default: "default").',
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

async function loadCemData(config: McpWcConfig, cem?: Cem): Promise<Cem> {
  return (
    cem ??
    CemSchema.parse(
      JSON.parse(String(await readFile(resolve(config.projectRoot, config.cemPath), 'utf-8'))),
    )
  );
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
      const { tagName, libraryId, multiDimensional } = ScoreComponentArgsSchema.parse(args);
      const cemDecl = cem ? getAllDeclarations(cem).find((d) => d.tagName === tagName) : undefined;

      if (multiDimensional && cemDecl) {
        const result = await scoreComponentMultiDimensional(config, cemDecl, cem, libraryId);
        return createSuccessResponse(JSON.stringify(result, null, 2));
      }

      const result = await scoreComponent(config, tagName, cemDecl, libraryId);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'score_all_components') {
      const { multiDimensional } = ScoreAllComponentsArgsSchema.parse(args);
      const cemData = await loadCemData(config, cem);
      const declarations = getAllDeclarations(cemData);

      if (multiDimensional) {
        const results = await scoreAllComponentsMultiDimensional(config, declarations);
        return createSuccessResponse(JSON.stringify(results, null, 2));
      }

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

    if (name === 'get_health_summary') {
      const { libraryId } = GetHealthSummaryArgsSchema.parse(args);
      const cemData = await loadCemData(config, cem);
      const declarations = getAllDeclarations(cemData);

      // Use multi-dimensional scoring for enriched summary
      const allScores = await scoreAllComponentsMultiDimensional(
        config,
        declarations,
        cem,
        libraryId,
      );

      const totalComponents = allScores.length;
      const averageScore =
        totalComponents === 0
          ? 0
          : Math.round((allScores.reduce((sum, r) => sum + r.score, 0) / totalComponents) * 10) /
            10;

      const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
      for (const r of allScores) {
        gradeDistribution[r.grade]++;
      }

      // Per-dimension averages
      const dimensionAverages: Record<string, number> = {};
      for (const def of DIMENSION_REGISTRY) {
        const scores = allScores
          .map((h) => h.dimensions.find((d) => d.name === def.name))
          .filter((d) => d?.measured);
        if (scores.length > 0) {
          const avg = scores.reduce((sum, d) => sum + (d?.score ?? 0), 0) / scores.length;
          dimensionAverages[def.name] = Math.round(avg * 10) / 10;
        }
      }

      const componentsNeedingAttention = allScores
        .filter((r) => r.score < 70)
        .map((r) => r.tagName);

      // Use the original getHealthSummary for trend calculation
      const baseSummary = await getHealthSummary(config, declarations);

      const enrichedSummary = {
        totalComponents,
        averageScore,
        gradeDistribution,
        dimensionAverages,
        libraryTrend: baseSummary.libraryTrend,
        componentsNeedingAttention,
        timestamp: new Date().toISOString(),
      };

      return createSuccessResponse(JSON.stringify(enrichedSummary, null, 2));
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

    if (name === 'audit_library') {
      const { outputPath, libraryId } = AuditLibraryArgsSchema.parse(args);
      const cemData = await loadCemData(config, cem);
      const declarations = getAllDeclarations(cemData);
      const { lines, summary } = await generateAuditReport(config, declarations, {
        outputPath,
        libraryId,
        cem: cemData,
      });
      const response: Record<string, unknown> = { summary };
      if (outputPath) {
        response.outputPath = resolve(config.projectRoot, outputPath);
      }
      response.lineCount = lines.length;
      return createSuccessResponse(JSON.stringify(response, null, 2));
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
