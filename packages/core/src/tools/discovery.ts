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

const ListByCategoryArgsSchema = z.object({
  category: z.string().optional(),
  includeUncategorized: z.boolean().optional().default(false),
});

// --- Tool definitions ---

export const DISCOVERY_TOOL_DEFINITIONS = [
  {
    name: 'list_components',
    description: 'List all custom element components registered in the Custom Elements Manifest.',
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
    name: 'find_component',
    description:
      'Semantically search for components by name, description, or member names using token-overlap scoring. Returns the top 3 matches with scores above zero.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
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
    name: 'list_events',
    description:
      'List all events across all components in the library. Optionally filter by component tag name. Returns event name, component tag, description, and detail type.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
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
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
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
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
        tagName: {
          type: 'string',
          description: 'Optional component tag name to filter CSS parts (e.g. "my-button").',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_components_by_category',
    description:
      'Group components by functional category (form, navigation, feedback, layout, data-display, media, overlay). Uses @category JSDoc tag when present, falls back to heuristic tag-name pattern matching.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
        category: {
          type: 'string',
          description:
            'Optional category to filter to (e.g. "form", "navigation"). If omitted, returns all categories.',
        },
        includeUncategorized: {
          type: 'boolean',
          description:
            'When true, includes components that could not be categorized (default: false).',
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
 * Computes Levenshtein edit distance between two strings using a two-row rolling array.
 * Uses `as number` casts to satisfy noUncheckedIndexedAccess without non-null assertions.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr.push(
        Math.min(
          (prev[j] as number) + 1,
          (curr[j - 1] as number) + 1,
          (prev[j - 1] as number) + cost,
        ),
      );
    }
    prev = curr;
  }
  return prev[n] as number;
}

/**
 * Scores a component against query tokens using token-overlap scoring:
 * - tag name token matches × 3
 * - description token matches × 2
 * - member name token matches × 1
 * - event/slot/cssPart name matches × 1 each
 * - fuzzy fallback: Levenshtein ≤ 1 when no exact match found anywhere (+1 per token)
 */
export function scoreComponent(
  tagName: string,
  description: string,
  memberNames: string[],
  queryTokens: string[],
  eventNames?: string[],
  slotNames?: string[],
  cssPartNames?: string[],
): number {
  if (queryTokens.length === 0) return 0;

  const tagTokens = new Set(tokenize(tagName));
  const descTokens = new Set(tokenize(description));
  const memberTokens = new Set(memberNames.flatMap((m) => tokenize(m)));
  const eventTokens = new Set((eventNames ?? []).flatMap((e) => tokenize(e)));
  const slotTokens = new Set((slotNames ?? []).flatMap((s) => tokenize(s)));
  const partTokens = new Set((cssPartNames ?? []).flatMap((p) => tokenize(p)));

  const allCandidates = [
    ...tagTokens,
    ...descTokens,
    ...memberTokens,
    ...eventTokens,
    ...slotTokens,
    ...partTokens,
  ];

  let score = 0;
  for (const qt of queryTokens) {
    let exactMatched = false;
    if (tagTokens.has(qt)) {
      score += 3;
      exactMatched = true;
    }
    if (descTokens.has(qt)) {
      score += 2;
      exactMatched = true;
    }
    if (memberTokens.has(qt)) {
      score += 1;
      exactMatched = true;
    }
    if (eventTokens.has(qt)) {
      score += 1;
      exactMatched = true;
    }
    if (slotTokens.has(qt)) {
      score += 1;
      exactMatched = true;
    }
    if (partTokens.has(qt)) {
      score += 1;
      exactMatched = true;
    }

    if (!exactMatched) {
      const fuzzyMatch = allCandidates.some((c) => levenshtein(qt, c) <= 1);
      if (fuzzyMatch) score += 1;
    }
  }

  return score;
}

function buildMatchReason(
  tagName: string,
  description: string,
  memberNames: string[],
  queryTokens: string[],
  eventNames?: string[],
  slotNames?: string[],
  cssPartNames?: string[],
): string {
  const tagTokens = new Set(tokenize(tagName));
  const descTokens = new Set(tokenize(description));
  const memberTokens = new Set(memberNames.flatMap((m) => tokenize(m)));
  const eventTokens = new Set((eventNames ?? []).flatMap((e) => tokenize(e)));
  const slotTokens = new Set((slotNames ?? []).flatMap((s) => tokenize(s)));
  const partTokens = new Set((cssPartNames ?? []).flatMap((p) => tokenize(p)));

  const allCandidates = [
    ...tagTokens,
    ...descTokens,
    ...memberTokens,
    ...eventTokens,
    ...slotTokens,
    ...partTokens,
  ];

  const reasons: string[] = [];
  for (const qt of queryTokens) {
    if (tagTokens.has(qt)) {
      reasons.push(`matched tag name: ${qt}`);
      continue;
    }
    if (descTokens.has(qt)) {
      reasons.push(`matched description: ${qt}`);
      continue;
    }
    if (memberTokens.has(qt)) {
      reasons.push(`matched member: ${qt}`);
      continue;
    }
    if (eventTokens.has(qt)) {
      reasons.push(`matched event: ${qt}`);
      continue;
    }
    if (slotTokens.has(qt)) {
      reasons.push(`matched slot: ${qt}`);
      continue;
    }
    if (partTokens.has(qt)) {
      reasons.push(`matched css-part: ${qt}`);
      continue;
    }
    const fuzzyTarget = allCandidates.find((c) => levenshtein(qt, c) <= 1);
    if (fuzzyTarget) reasons.push(`fuzzy matched "${qt}" → "${fuzzyTarget}"`);
  }
  return reasons.length > 0 ? reasons.join(', ') : 'unknown match';
}

const CATEGORY_PATTERNS: Record<string, string[]> = {
  form: [
    'input',
    'select',
    'checkbox',
    'radio',
    'textarea',
    'form',
    'field',
    'slider',
    'switch',
    'toggle',
  ],
  navigation: ['nav', 'menu', 'tab', 'breadcrumb', 'pagination', 'sidebar', 'drawer'],
  feedback: ['alert', 'toast', 'notification', 'snackbar', 'banner', 'badge', 'chip', 'tag'],
  layout: ['grid', 'stack', 'flex', 'container', 'divider', 'spacer', 'card'],
  'data-display': ['table', 'list', 'tree', 'accordion', 'timeline', 'stat'],
  media: ['avatar', 'image', 'icon', 'video'],
  overlay: ['dialog', 'modal', 'popover', 'tooltip', 'dropdown'],
};

/**
 * Classifies a component tag name into a functional category using heuristic
 * token matching against known category patterns. Returns 'uncategorized' when
 * no pattern matches.
 */
export function classifyByHeuristic(tagName: string): string {
  const tokens = tokenize(tagName);
  for (const [cat, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (tokens.some((t) => patterns.includes(t))) return cat;
  }
  return 'uncategorized';
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

      const scored: Array<ComponentScore & { matchReason: string }> = [];
      for (const tagName of tags) {
        const meta = parseCem(tagName, resolvedCem);
        const memberNames = meta.members.map((m) => m.name);
        const eventNames = meta.events.map((e) => e.name);
        const slotNames = meta.slots.map((s) => s.name);
        const cssPartNames = meta.cssParts.map((p) => p.name);
        const score = scoreComponent(
          tagName,
          meta.description,
          memberNames,
          queryTokens,
          eventNames,
          slotNames,
          cssPartNames,
        );
        if (score > 0) {
          const matchReason = buildMatchReason(
            tagName,
            meta.description,
            memberNames,
            queryTokens,
            eventNames,
            slotNames,
            cssPartNames,
          );
          scored.push({ tagName, score, matchReason });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      const top3 = scored.slice(0, 3);

      if (top3.length === 0) {
        return createSuccessResponse(`No components found matching "${query}".`);
      }

      const lines = top3.map((r) => `${r.tagName} (score: ${r.score}) — ${r.matchReason}`);
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

    if (name === 'list_components_by_category') {
      const { category, includeUncategorized } = ListByCategoryArgsSchema.parse(args);
      const categories: Record<string, string[]> = {};
      const uncategorized: string[] = [];
      let total = 0;

      for (const mod of resolvedCem.modules) {
        for (const decl of mod.declarations ?? []) {
          if (!decl.tagName) continue;
          total++;
          // Check @category JSDoc tag first
          const jsdocCategory = decl.jsdocTags?.find((t) => t.name === 'category')?.description;
          const cat = jsdocCategory ?? classifyByHeuristic(decl.tagName);

          if (cat === 'uncategorized') {
            uncategorized.push(decl.tagName);
          } else {
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(decl.tagName);
          }
        }
      }

      if (category) {
        const lowerCat = category.toLowerCase();
        const filtered = categories[lowerCat] ?? [];
        return createSuccessResponse(
          JSON.stringify(
            { categories: { [lowerCat]: filtered }, total: filtered.length, uncategorized: [] },
            null,
            2,
          ),
        );
      }

      const result: Record<string, unknown> = {
        categories,
        total,
      };
      if (includeUncategorized) {
        result['uncategorized'] = uncategorized;
      } else {
        result['uncategorized'] = [];
      }
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    return createErrorResponse(`Unknown discovery tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err, config.projectRoot);
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
