import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import {
  listAllComponents,
  parseCem,
  listAllEvents,
  listAllSlots,
  listAllCssParts,
} from '../handlers/cem.js';
import type { Cem } from '../handlers/cem.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

// --- Schemas ---

const FindComponentArgsSchema = z.object({
  query: z.string(),
});

const TagNameFilterSchema = z.object({
  tagName: z.string().optional(),
});

// --- Tool definitions ---

export const DISCOVERY_TOOL_DEFINITIONS = [
  {
    name: 'list_components',
    description: 'List all custom element components registered in the Custom Elements Manifest.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'find_component',
    description:
      'Semantically search for components by name, description, or member names using token-overlap scoring. Returns the top 3 matches with scores above zero.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Search query to match against component tag names, descriptions, and member names.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_library_summary',
    description:
      'Get an overview of the component library: component count, average health score, grade distribution, and last health check timestamp.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'list_events',
    description:
      'List all events across all components in the library. Optionally filter by component tag name. Returns event name, component tag, description, and detail type.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'Optional component tag name to filter events (e.g. "my-button").',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_slots',
    description:
      'List all slots across all components in the library. Optionally filter by component tag name. Returns slot name, component tag, description, and whether the slot is named or default.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'Optional component tag name to filter slots (e.g. "my-button").',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_css_parts',
    description:
      'List all CSS parts (::part()) across all components in the library. Optionally filter by component tag name. Returns part name, component tag, and description.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'Optional component tag name to filter CSS parts (e.g. "my-button").',
        },
      },
      additionalProperties: false,
    },
  },
];

// --- Pure scoring logic (exported for testing) ---

/**
 * Tokenizes a string into lowercase words, splitting on whitespace,
 * hyphens, underscores, and camelCase boundaries.
 */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase split
    .split(/[\s\-_]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0);
}

export interface ComponentScore {
  tagName: string;
  score: number;
}

/**
 * Scores a component against query tokens using token-overlap scoring:
 * - tag name token matches × 3
 * - description token matches × 2
 * - member name token matches × 1
 */
export function scoreComponent(
  tagName: string,
  description: string,
  memberNames: string[],
  queryTokens: string[],
): number {
  if (queryTokens.length === 0) return 0;

  const tagTokens = new Set(tokenize(tagName));
  const descTokens = new Set(tokenize(description));
  const memberTokens = new Set(memberNames.flatMap((m) => tokenize(m)));

  let score = 0;
  for (const qt of queryTokens) {
    if (tagTokens.has(qt)) score += 3;
    if (descTokens.has(qt)) score += 2;
    if (memberTokens.has(qt)) score += 1;
  }

  return score;
}

// --- Grade helper ---

function computeGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// --- Handler ---

/**
 * Dispatches a discovery tool call by name and returns an MCPToolResult.
 * Called by the server's consolidated CallToolRequestSchema handler.
 */
const EMPTY_CEM: Cem = { schemaVersion: '1.0.0', modules: [] };

export async function handleDiscoveryCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
  cem?: Cem,
  cemLoadedAt?: Date | null,
): Promise<MCPToolResult> {
  const resolvedCem = cem ?? EMPTY_CEM;
  try {
    if (name === 'list_components') {
      const tags = listAllComponents(resolvedCem);
      if (tags.length === 0) {
        return createSuccessResponse('No components found in the Custom Elements Manifest.');
      }
      return createSuccessResponse(tags.join('\n'));
    }

    if (name === 'find_component') {
      const { query } = FindComponentArgsSchema.parse(args);
      const queryTokens = tokenize(query);
      const tags = listAllComponents(resolvedCem);

      const scored: ComponentScore[] = [];
      for (const tagName of tags) {
        const meta = parseCem(tagName, resolvedCem);
        const memberNames = meta.members.map((m) => m.name);
        const score = scoreComponent(tagName, meta.description, memberNames, queryTokens);
        if (score > 0) {
          scored.push({ tagName, score });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      const top3 = scored.slice(0, 3);

      if (top3.length === 0) {
        return createSuccessResponse(`No components found matching "${query}".`);
      }

      const lines = top3.map((r) => `${r.tagName} (score: ${r.score})`);
      return createSuccessResponse(lines.join('\n'));
    }

    if (name === 'get_library_summary') {
      const tags = listAllComponents(resolvedCem);
      const componentCount = tags.length;

      let averageScore: number | undefined;
      let gradeDistribution: Record<string, number> | undefined;
      let lastCheckTimestamp: string | undefined;

      try {
        const historyDir = resolve(config.projectRoot, config.healthHistoryDir);
        const files = await readdir(historyDir);
        const jsonFiles = files.filter((f) => f.endsWith('.json'));

        if (jsonFiles.length > 0) {
          const scores: number[] = [];
          const grades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
          let latestDate = '';

          for (const file of jsonFiles) {
            try {
              const raw = await readFile(join(historyDir, file), 'utf-8');
              const data = JSON.parse(raw) as { score?: number; date?: string };

              if (typeof data.score === 'number') {
                scores.push(data.score);
                const grade = computeGrade(data.score);
                grades[grade] = (grades[grade] ?? 0) + 1;
              }
              if (typeof data.date === 'string' && data.date > latestDate) {
                latestDate = data.date;
              }
            } catch {
              // skip malformed files
            }
          }

          if (scores.length > 0) {
            averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            gradeDistribution = grades;
            lastCheckTimestamp = latestDate || undefined;
          }
        }
      } catch {
        // health history dir doesn't exist or can't be read — that's fine
      }

      const result: Record<string, unknown> = { componentCount };
      if (averageScore !== undefined) result['averageScore'] = averageScore;
      if (gradeDistribution !== undefined) result['gradeDistribution'] = gradeDistribution;
      if (lastCheckTimestamp !== undefined) result['lastCheckTimestamp'] = lastCheckTimestamp;
      if (cemLoadedAt != null) {
        const ageSeconds = Math.floor((Date.now() - cemLoadedAt.getTime()) / 1000);
        result['cacheAge'] = `${ageSeconds}s`;
      }

      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'list_events') {
      const { tagName } = TagNameFilterSchema.parse(args);
      const rows = listAllEvents(resolvedCem, tagName);
      if (rows.length === 0) {
        return createSuccessResponse('No events found.');
      }
      const header = 'event name\tcomponent\tdescription\ttype';
      const lines = rows.map((r) => `${r.eventName}\t${r.tagName}\t${r.description}\t${r.type}`);
      return createSuccessResponse([header, ...lines].join('\n'));
    }

    if (name === 'list_slots') {
      const { tagName } = TagNameFilterSchema.parse(args);
      const rows = listAllSlots(resolvedCem, tagName);
      if (rows.length === 0) {
        return createSuccessResponse('No slots found.');
      }
      const header = 'slot name\tcomponent\tdescription\tkind';
      const lines = rows.map((r) => {
        const kind = r.isDefault ? 'default' : 'named';
        const displayName = r.slotName === '' ? '(default)' : r.slotName;
        return `${displayName}\t${r.tagName}\t${r.description}\t${kind}`;
      });
      return createSuccessResponse([header, ...lines].join('\n'));
    }

    if (name === 'list_css_parts') {
      const { tagName } = TagNameFilterSchema.parse(args);
      const rows = listAllCssParts(resolvedCem, tagName);
      if (rows.length === 0) {
        return createSuccessResponse('No CSS parts found.');
      }
      const header = 'part name\tcomponent\tdescription';
      const lines = rows.map((r) => `${r.partName}\t${r.tagName}\t${r.description}`);
      return createSuccessResponse([header, ...lines].join('\n'));
    }

    return createErrorResponse(`Unknown discovery tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the discovery tool group.
 * Used by the consolidated CallToolRequestSchema handler to dispatch correctly.
 */
export function isDiscoveryTool(name: string): boolean {
  return DISCOVERY_TOOL_DEFINITIONS.some((t) => t.name === name);
}
