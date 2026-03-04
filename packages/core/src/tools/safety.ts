import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import { diffCem, listAllComponents } from '../handlers/cem.js';
import type { DiffResult, Cem } from '../handlers/cem.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

const DiffCemArgsSchema = z.object({
  tagName: z.string(),
  baseBranch: z.string(),
});

const CheckBreakingChangesArgsSchema = z.object({
  baseBranch: z.string(),
});

export const SAFETY_TOOL_DEFINITIONS = [
  {
    name: 'diff_cem',
    description:
      "Compare a component's CEM metadata between the current branch and a base branch, reporting breaking changes (removals, type changes) and non-breaking additions.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The HTML tag name of the component to diff (e.g. "my-button").',
        },
        baseBranch: {
          type: 'string',
          description: 'The git branch or ref to compare against (e.g. "main").',
        },
      },
      required: ['tagName', 'baseBranch'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_breaking_changes',
    description:
      'Run a breaking-change scan across ALL components in the CEM, comparing the current branch against a base branch. Returns a per-component summary with emoji status indicators.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        baseBranch: {
          type: 'string',
          description: 'The git branch or ref to compare against (e.g. "main").',
        },
      },
      required: ['baseBranch'],
      additionalProperties: false,
    },
  },
];

// --- Formatting helpers ---

function formatDiffResult(tagName: string, baseBranch: string, diff: DiffResult): string {
  const lines: string[] = [];

  if (diff.isNew) {
    lines.push(`🆕 ${tagName} — NEW component (not present on ${baseBranch})`);
    return lines.join('\n');
  }

  const hasBreaking = diff.breaking.length > 0;
  const hasAdditions = diff.additions.length > 0;

  const statusEmoji = hasBreaking ? '🔴' : hasAdditions ? '⚠️' : '✅';
  lines.push(`${statusEmoji} ${tagName} vs ${baseBranch}`);

  if (hasBreaking) {
    lines.push('');
    lines.push('Breaking changes:');
    for (const item of diff.breaking) {
      lines.push(`  • ${item}`);
    }
  }

  if (hasAdditions) {
    lines.push('');
    lines.push('Non-breaking additions:');
    for (const item of diff.additions) {
      lines.push(`  • ${item}`);
    }
  }

  if (!hasBreaking && !hasAdditions) {
    lines.push('  No breaking changes, no additions.');
  }

  return lines.join('\n');
}

interface ComponentScanResult {
  tagName: string;
  diff: DiffResult;
}

function formatAggregatedResults(baseBranch: string, results: ComponentScanResult[]): string {
  if (results.length === 0) {
    return `No components found in CEM. Nothing to check against ${baseBranch}.`;
  }

  const breakingComponents = results.filter((r) => !r.diff.isNew && r.diff.breaking.length > 0);
  const newComponents = results.filter((r) => r.diff.isNew);
  const additionOnlyComponents = results.filter(
    (r) => !r.diff.isNew && r.diff.breaking.length === 0 && r.diff.additions.length > 0,
  );
  const cleanComponents = results.filter(
    (r) => !r.diff.isNew && r.diff.breaking.length === 0 && r.diff.additions.length === 0,
  );

  const lines: string[] = [];

  // Summary header
  const totalBreaking = breakingComponents.length;
  lines.push(`Breaking change scan vs ${baseBranch} — ${results.length} component(s) checked`);
  lines.push('');

  if (totalBreaking === 0) {
    lines.push('✅ No breaking changes detected across any component.');
  } else {
    lines.push(`🔴 ${totalBreaking} component(s) have breaking changes.`);
  }

  lines.push('');

  // Per-component detail
  for (const { tagName, diff } of results) {
    lines.push(formatDiffResult(tagName, baseBranch, diff));
    lines.push('');
  }

  // Compact summary table
  lines.push('---');
  lines.push(
    `Summary: 🔴 ${breakingComponents.length} breaking  ⚠️ ${additionOnlyComponents.length} additions-only  ✅ ${cleanComponents.length} clean  🆕 ${newComponents.length} new`,
  );

  return lines.join('\n').trimEnd();
}

// --- Public dispatch ---

/**
 * Dispatches a safety tool call by name and returns an MCPToolResult.
 * Called by the server's consolidated CallToolRequestSchema handler.
 */
export async function handleSafetyCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
  cem: Cem,
): Promise<MCPToolResult> {
  try {
    if (name === 'diff_cem') {
      const { tagName, baseBranch } = DiffCemArgsSchema.parse(args);
      const diff = await diffCem(tagName, baseBranch, config, cem);
      return createSuccessResponse(formatDiffResult(tagName, baseBranch, diff));
    }

    if (name === 'check_breaking_changes') {
      const { baseBranch } = CheckBreakingChangesArgsSchema.parse(args);
      const tagNames = listAllComponents(cem);
      const results: ComponentScanResult[] = [];

      for (const tagName of tagNames) {
        const diff = await diffCem(tagName, baseBranch, config, cem);
        results.push({ tagName, diff });
      }

      return createSuccessResponse(formatAggregatedResults(baseBranch, results));
    }

    return createErrorResponse(`Unknown safety tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the safety tool group.
 * Used by the consolidated CallToolRequestSchema handler to dispatch correctly.
 */
export function isSafetyTool(name: string): boolean {
  return SAFETY_TOOL_DEFINITIONS.some((t) => t.name === name);
}
