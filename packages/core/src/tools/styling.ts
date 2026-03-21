import { z } from 'zod';

import { parseCem } from '../handlers/cem.js';
import type { Cem } from '../handlers/cem.js';
import { diagnoseStyling } from '../handlers/styling-diagnostics.js';
import { checkShadowDomUsage } from '../handlers/shadow-dom-checker.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

const DiagnoseStylingArgsSchema = z.object({
  tagName: z.string(),
});

const CheckShadowDomUsageArgsSchema = z.object({
  cssText: z.string(),
  tagName: z.string().optional(),
});

export const STYLING_TOOL_DEFINITIONS = [
  {
    name: 'diagnose_styling',
    description:
      'Generates a Shadow DOM styling guide for a web component — token prefix, theming approach, dark mode support, anti-pattern warnings, and correct CSS usage snippets. Use this before writing any component CSS to prevent Shadow DOM mistakes.',
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
          description: 'The custom element tag name to diagnose (e.g. "sl-button").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_shadow_dom_usage',
    description:
      'Scans consumer CSS code for Shadow DOM anti-patterns — descendant selectors piercing shadow boundaries, ::slotted() misuse, invalid ::part() chaining, !important on tokens, unknown part names, and typo detection. Run this on any CSS targeting web components to catch mistakes before they reach production.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
        cssText: {
          type: 'string',
          description: 'The CSS code to scan for Shadow DOM anti-patterns.',
        },
        tagName: {
          type: 'string',
          description:
            'Optional tag name to scope checks. When provided, enables CEM-based validation (unknown parts, typo detection).',
        },
      },
      required: ['cssText'],
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a styling tool call by name and returns an MCPToolResult.
 */
export function handleStylingCall(
  name: string,
  args: Record<string, unknown>,
  cem: Cem,
): MCPToolResult {
  try {
    if (name === 'diagnose_styling') {
      const { tagName } = DiagnoseStylingArgsSchema.parse(args);
      const meta = parseCem(tagName, cem);
      const result = diagnoseStyling(meta);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_shadow_dom_usage') {
      const { cssText, tagName } = CheckShadowDomUsageArgsSchema.parse(args);
      let meta = undefined;
      if (tagName) {
        try {
          meta = parseCem(tagName, cem);
        } catch {
          // Tag not in CEM — skip CEM-based checks, still run pattern checks
        }
      }
      const result = checkShadowDomUsage(cssText, tagName, meta);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    return createErrorResponse(`Unknown styling tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the styling tool group.
 */
export function isStylingTool(name: string): boolean {
  return STYLING_TOOL_DEFINITIONS.some((t) => t.name === name);
}
