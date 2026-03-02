import { z } from 'zod';
import type { McpWcConfig } from '../config.js';
import { parseCem, validateCompleteness, findComponentsByToken } from '../handlers/cem.js';
import type { Cem, CemMember } from '../handlers/cem.js';
import { suggestUsage, generateImport } from '../handlers/suggest.js';
import { getComponentNarrative } from '../handlers/narrative.js';
import { formatPropConstraints } from '../handlers/component.js';
import { getComponentDependencies } from '../handlers/dependencies.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

const GetComponentArgsSchema = z.object({
  tagName: z.string(),
});

const ValidateCemArgsSchema = z.object({
  tagName: z.string(),
});

const SuggestUsageArgsSchema = z.object({
  tagName: z.string(),
});

const GenerateImportArgsSchema = z.object({
  tagName: z.string(),
});

const GetComponentNarrativeArgsSchema = z.object({
  tagName: z.string(),
});

const GetPropConstraintsArgsSchema = z.object({
  tagName: z.string(),
  attributeName: z.string(),
});

const FindComponentsByTokenArgsSchema = z.object({
  tokenName: z.string(),
  partialMatch: z.boolean().optional().default(true),
});

const GetComponentDependenciesArgsSchema = z.object({
  tagName: z.string(),
  includeTransitive: z.boolean().optional().default(true),
});

export const COMPONENT_TOOL_DEFINITIONS = [
  {
    name: 'get_component',
    description:
      'Get full metadata for a web component by tag name, including members, events, slots, CSS parts, and CSS properties.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name (e.g. "my-button").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'validate_cem',
    description:
      'Validates the documentation completeness of a component in the Custom Elements Manifest. Returns a pass/fail result with a score and list of issues.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name to validate.',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_usage',
    description:
      'Generates an HTML usage snippet for a component, showing key attributes with their default values. Lists required vs optional attributes and variant options from union types.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name (e.g. "my-button").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_import',
    description:
      'Generates import statements for a component based on the CEM exports and package.json. Returns both a side-effect import and a named import.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name (e.g. "my-button").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_component_narrative',
    description:
      'Returns a 3-5 paragraph markdown prose description of a component — what it is, when to use it, how to customize it, its slots, and its events. Optimized for LLM comprehension.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name (e.g. "my-button").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_prop_constraints',
    description:
      'Returns a structured constraint table for a component attribute. Union type attributes include all valid values with descriptions. Non-union types return simple type info.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name (e.g. "sl-button").',
        },
        attributeName: {
          type: 'string',
          description: 'The attribute or property name to inspect (e.g. "variant").',
        },
      },
      required: ['tagName', 'attributeName'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_components_by_token',
    description:
      'Find all components that expose or use a given CSS custom property token. Returns tagName, token description, and default value for each match.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenName: {
          type: 'string',
          description:
            'CSS custom property name (must start with "--", e.g. "--sl-color-primary-600")',
        },
        partialMatch: {
          type: 'boolean',
          description: 'If true (default), match any token containing tokenName as a substring.',
        },
      },
      required: ['tokenName'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_component_dependencies',
    description:
      'Returns the dependency graph for a component — direct dependencies (components it renders) and transitive dependencies (full tree). Requires a CEM built with dependency reference data.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name to inspect (e.g. "my-dialog").',
        },
        includeTransitive: {
          type: 'boolean',
          description: 'When true (default), resolves the full transitive dependency tree.',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a component tool call by name and returns an MCPToolResult.
 * Called by the server's consolidated CallToolRequestSchema handler.
 */
export async function handleComponentCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
  cem: Cem,
): Promise<MCPToolResult> {
  try {
    if (name === 'get_component') {
      const { tagName } = GetComponentArgsSchema.parse(args);
      const meta = parseCem(tagName, cem);
      return createSuccessResponse(JSON.stringify(meta, null, 2));
    }

    if (name === 'validate_cem') {
      const { tagName } = ValidateCemArgsSchema.parse(args);
      const result = validateCompleteness(tagName, cem);
      const status = result.score === 100 ? 'PASS' : 'FAIL';
      const issueLines =
        result.issues.length > 0
          ? result.issues.map((i) => `  - ${i}`).join('\n')
          : '  (no issues)';
      const output = `Status: ${status}\nScore: ${result.score}/100\n\nIssues:\n${issueLines}`;
      return createSuccessResponse(output);
    }

    if (name === 'suggest_usage') {
      const { tagName } = SuggestUsageArgsSchema.parse(args);
      const result = await suggestUsage(tagName, config, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'generate_import') {
      const { tagName } = GenerateImportArgsSchema.parse(args);
      const result = await generateImport(tagName, config, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'get_component_narrative') {
      const { tagName } = GetComponentNarrativeArgsSchema.parse(args);
      const narrative = await getComponentNarrative(tagName, cem);
      return createSuccessResponse(narrative);
    }

    if (name === 'get_prop_constraints') {
      const { tagName, attributeName } = GetPropConstraintsArgsSchema.parse(args);
      const meta = parseCem(tagName, cem);
      const member = meta.members.find((m) => m.name === attributeName);
      if (!member) {
        return createErrorResponse(
          `Attribute "${attributeName}" not found on component "${tagName}".`,
        );
      }
      const cemMember: CemMember = {
        name: member.name,
        kind: member.kind,
        type: member.type ? { text: member.type } : undefined,
      };
      const result = formatPropConstraints(cemMember);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'find_components_by_token') {
      const { tokenName, partialMatch } = FindComponentsByTokenArgsSchema.parse(args);
      if (!tokenName.startsWith('--')) {
        return createErrorResponse(
          `CSS custom property name must start with "--". Got: "${tokenName}"`,
        );
      }
      const result = findComponentsByToken(tokenName, partialMatch, cem);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'get_component_dependencies') {
      const { tagName, includeTransitive } = GetComponentDependenciesArgsSchema.parse(args);
      const result = getComponentDependencies(cem, tagName, includeTransitive);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    return createErrorResponse(`Unknown component tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the component tool group.
 * Used by the consolidated CallToolRequestSchema handler to dispatch correctly.
 */
export function isComponentTool(name: string): boolean {
  return COMPONENT_TOOL_DEFINITIONS.some((t) => t.name === name);
}
