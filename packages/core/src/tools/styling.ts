import { z } from 'zod';

import { parseCem } from '../handlers/cem.js';
import type { Cem } from '../handlers/cem.js';
import { diagnoseStyling } from '../handlers/styling-diagnostics.js';
import { checkShadowDomUsage } from '../handlers/shadow-dom-checker.js';
import { checkHtmlUsage } from '../handlers/html-usage-checker.js';
import { checkEventUsage } from '../handlers/event-usage-checker.js';
import { getComponentQuickRef } from '../handlers/quick-ref.js';
import { detectThemeSupport } from '../handlers/theme-detection.js';
import { checkComponentImports } from '../handlers/import-checker.js';
import { checkSlotChildren } from '../handlers/slot-children-checker.js';
import { checkAttributeConflicts } from '../handlers/attribute-conflict-checker.js';
import { checkA11yUsage } from '../handlers/a11y-usage-checker.js';
import { checkCssVars } from '../handlers/css-var-checker.js';
import { validateComponentCode } from '../handlers/code-validator.js';
import { checkTokenFallbacks } from '../handlers/token-fallback-checker.js';
import { checkComposition } from '../handlers/composition-checker.js';
import { checkMethodCalls } from '../handlers/method-checker.js';
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

const CheckSlotChildrenArgsSchema = z.object({
  htmlText: z.string(),
  tagName: z.string(),
});

const CheckAttributeConflictsArgsSchema = z.object({
  htmlText: z.string(),
  tagName: z.string(),
});

const CheckA11yUsageArgsSchema = z.object({
  htmlText: z.string(),
  tagName: z.string(),
});

const CheckCssVarsArgsSchema = z.object({
  cssText: z.string(),
  tagName: z.string(),
});

const CheckTokenFallbacksArgsSchema = z.object({
  cssText: z.string(),
  tagName: z.string(),
});

const CheckCompositionArgsSchema = z.object({
  htmlText: z.string(),
});

const CheckMethodCallsArgsSchema = z.object({
  codeText: z.string(),
  tagName: z.string(),
});

const ValidateComponentCodeArgsSchema = z.object({
  html: z.string(),
  css: z.string().optional(),
  code: z.string().optional(),
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
  {
    name: 'detect_theme_support',
    description:
      'Analyzes a component library for theming capabilities — token categories (color, spacing, typography, etc.), semantic naming patterns, dark mode readiness, and coverage score. Library-wide analysis, not per-component.',
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
    name: 'check_component_imports',
    description:
      'Scans HTML/JSX/template code for all custom element tags and verifies they exist in the loaded CEM. Catches non-existent components and misspelled tag names with fuzzy suggestions. Use this to verify that generated code only references real components.',
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
          description: 'The HTML/JSX/template code to scan for custom element tags.',
        },
      },
      required: ['codeText'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_slot_children',
    description:
      'Validates that children placed inside a web component\'s slots match the expected element types from the CEM — catches wrong child elements in constrained slots (e.g. putting a <div> inside <sl-select> which requires <sl-option>). Parses slot descriptions for "Must be", "Works best with", and "Accepts" patterns.',
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
          description: 'The HTML code containing the component and its children to validate.',
        },
        tagName: {
          type: 'string',
          description:
            'The parent custom element tag name to check slot children for (e.g. "sl-select").',
        },
      },
      required: ['htmlText', 'tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_attribute_conflicts',
    description:
      'Detects conditional attributes used without their guard conditions — catches "target" without "href", "min"/"max" on non-number inputs, "checked" without type="checkbox", and other attribute interaction mistakes. Parses CEM member descriptions for "Only used when" and "Only applies to" patterns.',
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
          description: 'The HTML code containing the component to check for attribute conflicts.',
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
    name: 'check_a11y_usage',
    description:
      'Validates consumer HTML for accessibility mistakes when using web components — catches missing accessible labels on icon buttons/dialogs/selects, and manual role overrides on components that self-assign ARIA roles. Run this on any HTML using web components to catch a11y issues.',
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
          description: 'The HTML code to validate for accessibility issues.',
        },
        tagName: {
          type: 'string',
          description:
            'The custom element tag name to check accessibility for (e.g. "sl-icon-button").',
        },
      },
      required: ['htmlText', 'tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_css_vars',
    description:
      'Validates consumer CSS for custom property usage against a component CEM — catches unknown CSS custom properties with typo suggestions, and !important on design tokens (anti-pattern). Run this on any CSS that sets component-scoped custom properties.',
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
          description: 'The CSS code to validate for custom property usage.',
        },
        tagName: {
          type: 'string',
          description: 'The custom element tag name to validate against (e.g. "sl-button").',
        },
      },
      required: ['cssText', 'tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'validate_component_code',
    description:
      'ALL-IN-ONE validator — runs every anti-hallucination check on agent-generated code in a single call. Validates HTML attributes, slot children, attribute conflicts, a11y patterns, Shadow DOM CSS, custom properties, event bindings, and component imports. Use this as the FINAL check before submitting any code that uses web components.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Optional library ID to target a specific loaded library instead of the default.',
        },
        html: {
          type: 'string',
          description: 'The HTML markup to validate.',
        },
        css: {
          type: 'string',
          description: 'Optional CSS code to validate for Shadow DOM and custom property issues.',
        },
        code: {
          type: 'string',
          description: 'Optional JS/JSX/template code to validate event bindings.',
        },
        tagName: {
          type: 'string',
          description: 'The primary custom element tag name to validate against.',
        },
        framework: {
          type: 'string',
          enum: ['react', 'vue', 'angular', 'html'],
          description: 'Optional framework hint for event validation.',
        },
      },
      required: ['html', 'tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_token_fallbacks',
    description:
      'Validates consumer CSS for proper var() fallback chains and detects hardcoded colors that break theme switching. Catches var() calls without fallback values (fragile if token undefined), hardcoded hex/rgb/hsl/named colors on color properties (breaks dark mode), and named CSS colors used directly instead of tokens. Run this on any CSS that references design tokens.',
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
          description: 'The CSS code to validate for token fallback usage.',
        },
        tagName: {
          type: 'string',
          description: 'The custom element tag name to validate against (e.g. "sl-button").',
        },
      },
      required: ['cssText', 'tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_composition',
    description:
      'Validates cross-component composition patterns — catches tab/panel count mismatches, unlinked cross-references (tab panel="x" without matching panel name="x"), and empty containers (select with no options). Detects component pairs automatically from CEM slot descriptions. Run this on any HTML using compound components like tab-groups, selects, accordions, etc.',
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
          description: 'The HTML code containing compound component patterns to validate.',
        },
      },
      required: ['htmlText'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_method_calls',
    description:
      'Validates JavaScript/TypeScript code for correct method and property usage on web components — catches hallucinated API calls (methods that do not exist), properties called as methods (e.g. dialog.open() when open is a boolean), methods assigned as properties (e.g. dialog.show = true), and typos with suggestions. Run this on any JS code that interacts with web component APIs.',
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
          description: 'The JavaScript/TypeScript code to validate for method/property usage.',
        },
        tagName: {
          type: 'string',
          description: 'The custom element tag name to validate against (e.g. "sl-dialog").',
        },
      },
      required: ['codeText', 'tagName'],
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

    if (name === 'detect_theme_support') {
      const result = detectThemeSupport(cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_component_imports') {
      const codeText = z.string().parse(args.codeText);
      const result = checkComponentImports(codeText, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_slot_children') {
      const { htmlText, tagName } = CheckSlotChildrenArgsSchema.parse(args);
      const result = checkSlotChildren(htmlText, tagName, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_attribute_conflicts') {
      const { htmlText, tagName } = CheckAttributeConflictsArgsSchema.parse(args);
      const result = checkAttributeConflicts(htmlText, tagName, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_a11y_usage') {
      const { htmlText, tagName } = CheckA11yUsageArgsSchema.parse(args);
      const result = checkA11yUsage(htmlText, tagName, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_css_vars') {
      const { cssText, tagName } = CheckCssVarsArgsSchema.parse(args);
      const result = checkCssVars(cssText, tagName, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_method_calls') {
      const { codeText, tagName } = CheckMethodCallsArgsSchema.parse(args);
      const result = checkMethodCalls(codeText, tagName, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_composition') {
      const { htmlText } = CheckCompositionArgsSchema.parse(args);
      const result = checkComposition(htmlText, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_token_fallbacks') {
      const { cssText, tagName } = CheckTokenFallbacksArgsSchema.parse(args);
      const result = checkTokenFallbacks(cssText, tagName, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'validate_component_code') {
      const { html, css, code, tagName, framework } = ValidateComponentCodeArgsSchema.parse(args);
      const result = validateComponentCode({
        html,
        css,
        code,
        tagName,
        cem,
        framework,
      });
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
