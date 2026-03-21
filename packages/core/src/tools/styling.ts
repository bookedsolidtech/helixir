import { z } from 'zod';

import { parseCem } from '../handlers/cem.js';
import type { Cem } from '../handlers/cem.js';
import { diagnoseStyling } from '../handlers/styling-diagnostics.js';
import { checkShadowDomUsage } from '../handlers/shadow-dom-checker.js';
import { checkHtmlUsage } from '../handlers/html-usage-checker.js';
import { checkEventUsage } from '../handlers/event-usage-checker.js';
import { getComponentQuickRef } from '../handlers/quick-ref.js';
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

const CheckHtmlUsageArgsSchema = z.object({
  htmlText: z.string(),
  tagName: z.string(),
});

const GetComponentQuickRefArgsSchema = z.object({
  tagName: z.string(),
});

const CheckEventUsageArgsSchema = z.object({
  codeText: z.string(),
  tagName: z.string(),
  framework: z.enum(['react', 'vue', 'angular', 'html']).optional(),
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
  {
    name: 'check_html_usage',
    description:
      'Validates consumer HTML against a component CEM — catches invalid slot names, wrong enum attribute values, boolean attribute misuse, and unknown attributes with typo suggestions. Run this on any HTML using web components to catch markup mistakes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
        htmlText: {
          type: 'string',
          description: 'The HTML code to validate against the component CEM.',
        },
        tagName: {
          type: 'string',
          description: 'The custom element tag name to validate against (e.g. "sl-button").',
        },
      },
      required: ['htmlText', 'tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_event_usage',
    description:
      "Validates event listener patterns against a component CEM — catches React onXxx props for custom events (won't work), unknown event names, misspelled events, and framework-specific binding mistakes. Supports React, Vue, and Angular patterns.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
        codeText: {
          type: 'string',
          description: 'The code (JSX, template, etc.) to validate event usage in.',
        },
        tagName: {
          type: 'string',
          description: 'The custom element tag name to validate against (e.g. "sl-button").',
        },
        framework: {
          type: 'string',
          enum: ['react', 'vue', 'angular', 'html'],
          description:
            'Optional framework hint. Enables framework-specific checks (e.g. React onXxx prop detection).',
        },
      },
      required: ['codeText', 'tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_component_quick_ref',
    description:
      'Returns a complete quick reference for a web component — all attributes with types and valid enum values, methods, events, slots, CSS custom properties with examples, CSS parts with ::part() selectors, a ready-to-use CSS snippet, and Shadow DOM warnings. Use this as the FIRST call when working with any web component to get the complete API surface.',
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
          description: 'The custom element tag name (e.g. "sl-button").',
        },
      },
      required: ['tagName'],
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

    if (name === 'check_html_usage') {
      const { htmlText, tagName } = CheckHtmlUsageArgsSchema.parse(args);
      const meta = parseCem(tagName, cem);
      const result = checkHtmlUsage(htmlText, meta);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_event_usage') {
      const { codeText, tagName, framework } = CheckEventUsageArgsSchema.parse(args);
      const meta = parseCem(tagName, cem);
      const result = checkEventUsage(codeText, meta, framework);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'get_component_quick_ref') {
      const { tagName } = GetComponentQuickRefArgsSchema.parse(args);
      const meta = parseCem(tagName, cem);
      const result = getComponentQuickRef(meta);
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
