import { z } from 'zod';

import type { Cem } from '../handlers/cem.js';
import { createTheme, applyThemeTokens } from '../handlers/theme.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

// ─── Input Schemas ─────────────────────────────────────────────────────────────

const CreateThemeArgsSchema = z.object({
  themeName: z.string().optional(),
  prefix: z.string().optional(),
});

const ApplyThemeTokensArgsSchema = z.object({
  themeTokens: z.record(z.string(), z.string()),
  tagNames: z.array(z.string()).optional(),
});

// ─── Tool Definitions ──────────────────────────────────────────────────────────

export const THEME_TOOL_DEFINITIONS = [
  {
    name: 'create_theme',
    description:
      "Scaffold a complete enterprise CSS theme from the component library's design tokens. " +
      'Analyzes the CEM to detect the token prefix and categories, then generates a ready-to-customize ' +
      'CSS file with light mode variables, dark mode overrides (via prefers-color-scheme and explicit class), ' +
      'and color-scheme declarations. Returns the full CSS content and per-category token counts.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        themeName: {
          type: 'string',
          description:
            'Name for the theme (used in CSS class selectors). ' +
            'E.g. "brand" generates ".brand-light" and ".brand-dark". Defaults to "theme".',
        },
        prefix: {
          type: 'string',
          description:
            'Override the CSS custom property prefix detected from the CEM. ' +
            'E.g. "--hx-". When omitted, the prefix is detected automatically.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'apply_theme_tokens',
    description:
      'Map a theme token definition to specific components, showing how to apply it with correct ' +
      'CSS custom property overrides. Accepts a map of CSS variable names to values, then generates ' +
      'per-component CSS blocks and a global :root block. Use this after create_theme to wire ' +
      'your theme tokens to individual component CSS properties.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        themeTokens: {
          type: 'object',
          description:
            'Map of CSS custom property names to their values. ' +
            'E.g. { "--hx-color-primary": "#0066cc", "--hx-spacing-md": "1rem" }. ' +
            'Property names that match component CSS properties generate per-component CSS blocks.',
          additionalProperties: { type: 'string' },
        },
        tagNames: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of component tag names to filter results. ' +
            'When omitted, all components with CSS properties are included.',
        },
      },
      required: ['themeTokens'],
      additionalProperties: false,
    },
  },
];

// ─── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Dispatches a theme tool call by name and returns an MCPToolResult.
 * Called by the server's consolidated CallToolRequestSchema handler.
 */
export async function handleThemeCall(
  name: string,
  args: Record<string, unknown>,
  cem: Cem,
): Promise<MCPToolResult> {
  try {
    if (name === 'create_theme') {
      const { themeName, prefix } = CreateThemeArgsSchema.parse(args);
      const result = createTheme(cem, { themeName, prefix });
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'apply_theme_tokens') {
      const { themeTokens, tagNames } = ApplyThemeTokensArgsSchema.parse(args);
      const result = applyThemeTokens(cem, themeTokens, tagNames);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    return createErrorResponse(`Unknown theme tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the theme tool group.
 * Used by the consolidated CallToolRequestSchema handler to dispatch correctly.
 */
export function isThemeTool(name: string): boolean {
  return THEME_TOOL_DEFINITIONS.some((t) => t.name === name);
}
