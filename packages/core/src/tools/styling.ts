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
import { checkThemeCompatibility } from '../handlers/theme-checker.js';
import { recommendChecks } from '../handlers/recommend-checks.js';
import { suggestFix } from '../handlers/suggest-fix.js';
import { checkCssSpecificity } from '../handlers/specificity-checker.js';
import { checkLayoutPatterns } from '../handlers/layout-checker.js';
import { checkCssScope } from '../handlers/scope-checker.js';
import { checkCssShorthand } from '../handlers/shorthand-checker.js';
import { checkColorContrast } from '../handlers/color-contrast-checker.js';
import { checkTransitionAnimation } from '../handlers/transition-checker.js';
import { checkShadowDomJs } from '../handlers/shadow-dom-js-checker.js';
import { resolveCssApi } from '../handlers/css-api-resolver.js';
import { runStylingPreflight } from '../handlers/styling-preflight.js';
import { validateCssFile } from '../handlers/css-file-validator.js';
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

const CheckThemeCompatibilityArgsSchema = z.object({
  cssText: z.string(),
});

const RecommendChecksArgsSchema = z.object({
  codeText: z.string(),
});

const CheckLayoutPatternsArgsSchema = z.object({
  cssText: z.string(),
});

const CheckCssScopeArgsSchema = z.object({
  cssText: z.string(),
  tagName: z.string(),
  cem: z.any(),
});

const CheckCssShorthandArgsSchema = z.object({
  cssText: z.string(),
});

const CheckColorContrastArgsSchema = z.object({
  cssText: z.string(),
});

const CheckTransitionAnimationArgsSchema = z.object({
  cssText: z.string(),
  tagName: z.string(),
});

const CheckShadowDomJsArgsSchema = z.object({
  codeText: z.string(),
  tagName: z.string().optional(),
});

const CheckCssSpecificityArgsSchema = z.object({
  code: z.string(),
  mode: z.enum(['css', 'html']).optional(),
});

const SuggestFixArgsSchema = z.object({
  type: z.enum([
    'shadow-dom',
    'token-fallback',
    'theme-compat',
    'method-call',
    'event-usage',
    'specificity',
    'layout',
  ]),
  issue: z.string(),
  original: z.string(),
  tagName: z.string().optional(),
  partNames: z.array(z.string()).optional(),
  property: z.string().optional(),
  memberName: z.string().optional(),
  suggestedName: z.string().optional(),
  eventName: z.string().optional(),
  tokenPrefix: z.string().optional(),
});

const ValidateComponentCodeArgsSchema = z.object({
  html: z.string(),
  css: z.string().optional(),
  code: z.string().optional(),
  tagName: z.string(),
  framework: z.enum(['react', 'vue', 'angular', 'html']).optional(),
});

const ResolveCssApiArgsSchema = z.object({
  cssText: z.string(),
  tagName: z.string(),
  htmlText: z.string().optional(),
});

const StylingPreflightArgsSchema = z.object({
  cssText: z.string(),
  tagName: z.string(),
  htmlText: z.string().optional(),
});

const ValidateCssFileArgsSchema = z.object({
  cssText: z.string(),
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
      'Returns a complete quick reference for a web component — all attributes with types and valid enum values, methods, events, slots, CSS custom properties with examples, CSS parts with ::part() selectors, a ready-to-use CSS snippet, Shadow DOM warnings, and antiPatterns (component-specific "don\'t do this" negative examples using real tag/part/token names). Use this as the FIRST call when working with any web component to get the complete API surface and avoid common mistakes.',
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
      'ALL-IN-ONE validator — runs 19 anti-hallucination sub-validators on agent-generated code in a single call. Validates HTML attributes, slot children, attribute conflicts, a11y patterns, Shadow DOM CSS, custom properties, token fallbacks, theme compatibility, CSS specificity, layout patterns, inline styles, event bindings, method calls, composition patterns, component imports, color contrast, CSS scope, shorthand safety, and transition/animation patterns. Returns antiPatterns (component-specific negative examples) and auto-generated fix suggestions on issues. Use this as the FINAL check before submitting any code that uses web components.',
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
  {
    name: 'check_theme_compatibility',
    description:
      'Validates consumer CSS for dark mode and theme compatibility — catches hardcoded colors on background/color/border properties, hardcoded shadow colors, and potential contrast issues (light-on-light or dark-on-dark pairings). Does NOT require a CEM — works on any CSS. Run this on styling code to ensure it adapts to theme changes.',
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
          description: 'The CSS code to check for theme compatibility issues.',
        },
      },
      required: ['cssText'],
      additionalProperties: false,
    },
  },
  {
    name: 'recommend_checks',
    description:
      'Analyzes code to determine which validation tools are most relevant — detects HTML, CSS, JavaScript, and JSX patterns, identifies custom element tags, and returns a prioritized list of tool names. Use this as a meta-tool to discover which validators to run on a given piece of code without running them all.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        codeText: {
          type: 'string',
          description: 'The code to analyze for determining which validation tools are relevant.',
        },
      },
      required: ['codeText'],
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_fix',
    description:
      'Generates concrete, copy-pasteable code fixes for validation issues. Pass the issue type (shadow-dom, token-fallback, theme-compat, method-call, event-usage, specificity, layout), the specific issue kind, and the original code — returns a corrected code snippet with an explanation. NOTE: styling_preflight and validate_css_file now embed fixes inline in each issue — only call suggest_fix directly for issues from other validators or when you need a fix for code not already validated.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: [
            'shadow-dom',
            'token-fallback',
            'theme-compat',
            'method-call',
            'event-usage',
            'specificity',
            'layout',
          ],
          description: 'The category of validation issue.',
        },
        issue: {
          type: 'string',
          description:
            'The specific issue kind (e.g. "descendant-piercing", "missing-fallback", "hardcoded-color", "property-as-method", "react-custom-event").',
        },
        original: {
          type: 'string',
          description: 'The original problematic code.',
        },
        tagName: {
          type: 'string',
          description: 'Optional tag name of the component.',
        },
        partNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of CSS part names exposed by the component.',
        },
        property: {
          type: 'string',
          description: 'Optional CSS property name for token/theme fixes.',
        },
        memberName: {
          type: 'string',
          description: 'Optional method/property name for method call fixes.',
        },
        suggestedName: {
          type: 'string',
          description: 'Optional corrected name for typo fixes.',
        },
        eventName: {
          type: 'string',
          description: 'Optional event name for event usage fixes.',
        },
        tokenPrefix: {
          type: 'string',
          description:
            'Optional token prefix from the component library (e.g. "--hx-", "--fast-", "--md-"). When provided, suggested replacement tokens use this prefix. Get this from diagnose_styling.',
        },
      },
      required: ['type', 'issue', 'original'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_css_specificity',
    description:
      'Detects CSS specificity anti-patterns that cause styling issues with web components — catches !important usage, ID selectors targeting components, deeply nested selectors (4+ levels), and inline style attributes. Supports both CSS and HTML mode. Run this on any CSS or HTML to prevent specificity wars.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'The CSS or HTML code to analyze for specificity issues.',
        },
        mode: {
          type: 'string',
          enum: ['css', 'html'],
          description:
            'Analysis mode — "css" checks stylesheets for !important/ID/nesting issues, "html" checks for inline style attributes on web components. Defaults to "css".',
        },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_layout_patterns',
    description:
      'Detects layout anti-patterns when styling web component host elements — catches display overrides (components manage their own display), fixed pixel dimensions (breaks responsive), position absolute/fixed (conflicts with component positioning), and overflow: hidden (clips shadow DOM popups/tooltips). Run this on any CSS that sets layout properties on web components.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cssText: {
          type: 'string',
          description: 'The CSS code to check for layout anti-patterns on web component hosts.',
        },
      },
      required: ['cssText'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_css_scope',
    description:
      'Detects when component-scoped CSS custom properties are set at the wrong scope. Catches component tokens placed on :root, html, body, or * selectors instead of on the component host element. Component tokens only take effect when set on the host — setting them on :root has no effect through shadow DOM.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cssText: {
          type: 'string',
          description: 'The CSS code to check for scope mismatches.',
        },
        tagName: {
          type: 'string',
          description: 'The web component tag name (e.g. "sl-button").',
        },
      },
      required: ['cssText', 'tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_css_shorthand',
    description:
      'Detects risky CSS shorthand + var() combinations that can fail silently. When var() is mixed with literal values in shorthand properties (border, background, font, margin, etc.), if any var() is undefined the ENTIRE declaration fails — not just the dynamic part. Suggests decomposing into longhand properties.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cssText: {
          type: 'string',
          description: 'The CSS code to check for risky shorthand + var() patterns.',
        },
      },
      required: ['cssText'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_color_contrast',
    description:
      'Detects color contrast issues in CSS: low-contrast hardcoded color pairs (light-on-light, dark-on-dark), mixed color sources (one design token + one hardcoded), and low opacity on text. Catches patterns that break readability across theme changes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cssText: { type: 'string', description: 'CSS code to analyze for color contrast issues' },
      },
      required: ['cssText'],
    },
  },
  {
    name: 'check_transition_animation',
    description:
      'Detects CSS transitions and animations on web component hosts that target standard properties which cannot cross Shadow DOM boundaries. Transitions on standard properties (color, background, opacity) only affect the host element box, not the component internals. Use CSS custom properties for animations that the component consumes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cssText: { type: 'string', description: 'CSS code to analyze' },
        tagName: {
          type: 'string',
          description: 'Tag name of the web component (e.g., "sl-button")',
        },
      },
      required: ['cssText', 'tagName'],
    },
  },
  {
    name: 'check_shadow_dom_js',
    description:
      'Detects JavaScript anti-patterns that violate Shadow DOM encapsulation from consumer code. Catches: accessing .shadowRoot.querySelector() to bypass encapsulation, calling attachShadow() on existing components, setting innerHTML on web components (overwriting slot content), and using style.cssText instead of CSS custom properties.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        codeText: { type: 'string', description: 'JavaScript/TypeScript code to analyze' },
        tagName: {
          type: 'string',
          description:
            'Optional tag name of the web component for context-aware checks (e.g., "sl-button")',
        },
      },
      required: ['codeText'],
    },
  },
  {
    name: 'resolve_css_api',
    description:
      'Resolves every ::part(), CSS custom property, and slot reference in agent-generated code against the actual component CEM data. Returns a structured report showing which references are valid, which are hallucinated, and suggests the closest valid alternatives. Call this BEFORE shipping any CSS to verify that every part name, token name, and slot name actually exists on the target component.',
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
          description: 'The CSS code to resolve against the component API.',
        },
        tagName: {
          type: 'string',
          description: 'The custom element tag name (e.g. "sl-dialog").',
        },
        htmlText: {
          type: 'string',
          description:
            'Optional HTML code to validate slot attribute references against the component API.',
        },
      },
      required: ['cssText', 'tagName'],
    },
  },
  {
    name: 'styling_preflight',
    description:
      "Single-call styling validation that combines component API discovery, CSS reference resolution, and anti-pattern detection. Returns: the component's full style API surface (parts, tokens, slots), valid/invalid status for every ::part() and token reference, Shadow DOM and theme validation issues with inline fix suggestions (each issue includes a `fix` object with corrected code + explanation), antiPatterns (component-specific negative examples), a correct CSS snippet, and a pass/fail verdict. Call this ONCE before finalizing any component CSS — fixes are embedded in each issue so you don't need a separate suggest_fix call.",
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
          description: 'The CSS code to validate against the component API.',
        },
        tagName: {
          type: 'string',
          description: 'The custom element tag name (e.g. "hx-button").',
        },
        htmlText: {
          type: 'string',
          description:
            'Optional HTML code to validate slot attribute references against the component API.',
        },
      },
      required: ['cssText', 'tagName'],
    },
  },
  {
    name: 'validate_css_file',
    description:
      'Validates an entire CSS file targeting multiple web components in one call. Auto-detects all web component tag names in selectors, runs per-component validation (Shadow DOM, ::part() resolution, token validation, scope checks) and global validation (theme compatibility, color contrast, specificity, shorthand). Each component result includes antiPatterns (negative examples) and each issue includes an inline `fix` object with corrected code + explanation. Returns issues grouped by component plus global issues. Use this when reviewing a CSS file that styles multiple components — no need to know which components are used.',
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
          description: 'The full CSS file content to validate.',
        },
      },
      required: ['cssText'],
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

    if (name === 'check_theme_compatibility') {
      const { cssText } = CheckThemeCompatibilityArgsSchema.parse(args);
      const result = checkThemeCompatibility(cssText);
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

    if (name === 'recommend_checks') {
      const { codeText } = RecommendChecksArgsSchema.parse(args);
      const result = recommendChecks(codeText);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'suggest_fix') {
      const input = SuggestFixArgsSchema.parse(args);
      const result = suggestFix(input);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_css_specificity') {
      const { code, mode } = CheckCssSpecificityArgsSchema.parse(args);
      const result = checkCssSpecificity(code, mode ? { mode } : undefined);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_layout_patterns') {
      const { cssText } = CheckLayoutPatternsArgsSchema.parse(args);
      const result = checkLayoutPatterns(cssText);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_css_scope') {
      const { cssText, tagName } = CheckCssScopeArgsSchema.parse(args);
      const result = checkCssScope(cssText, tagName, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_css_shorthand') {
      const { cssText } = CheckCssShorthandArgsSchema.parse(args);
      const result = checkCssShorthand(cssText);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_color_contrast') {
      const { cssText } = CheckColorContrastArgsSchema.parse(args);
      const result = checkColorContrast(cssText);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_transition_animation') {
      const { cssText, tagName } = CheckTransitionAnimationArgsSchema.parse(args);
      const result = checkTransitionAnimation(cssText, tagName);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'check_shadow_dom_js') {
      const { codeText, tagName } = CheckShadowDomJsArgsSchema.parse(args);
      const result = checkShadowDomJs(codeText, tagName);
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

    if (name === 'resolve_css_api') {
      const { cssText, tagName, htmlText } = ResolveCssApiArgsSchema.parse(args);
      const meta = parseCem(tagName, cem);
      const result = resolveCssApi(cssText, meta, htmlText);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'styling_preflight') {
      const { cssText, tagName, htmlText } = StylingPreflightArgsSchema.parse(args);
      const meta = parseCem(tagName, cem);
      const result = runStylingPreflight({ css: cssText, html: htmlText, meta });
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'validate_css_file') {
      const { cssText } = ValidateCssFileArgsSchema.parse(args);
      const result = validateCssFile(cssText, cem);
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
