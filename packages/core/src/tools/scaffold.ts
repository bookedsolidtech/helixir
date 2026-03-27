import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import type { Cem } from '../handlers/cem.js';
import {
  scaffoldComponent,
  type ScaffoldSlot,
  type ScaffoldCssPart,
  type ScaffoldEvent,
  type ScaffoldProperty,
} from '../handlers/scaffold.js';
import { handleToolError } from '../shared/error-handling.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const SlotSchema = z.object({
  name: z.string().default(''),
  description: z.string().optional(),
});

const CssPartSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

const EventSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
});

const PropertySchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  attribute: z.string().optional(),
  default: z.string().optional(),
  description: z.string().optional(),
  reflects: z.boolean().optional(),
});

const ScaffoldComponentArgsSchema = z.object({
  tagName: z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/, {
    message: 'tagName must be a valid custom element tag name (lowercase, containing a hyphen)',
  }),
  baseClass: z.string().optional(),
  slots: z.array(SlotSchema).optional(),
  cssParts: z.array(CssPartSchema).optional(),
  events: z.array(EventSchema).optional(),
  properties: z.array(PropertySchema).optional(),
});

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const SCAFFOLD_TOOL_DEFINITIONS = [
  {
    name: 'scaffold_component',
    description:
      'Generate a complete Helix-pattern web component scaffold: Lit class with decorators, ' +
      'CEM annotations (@slot, @csspart, @fires), Vitest test stub, Storybook CSF3 story, and ' +
      'CSS structure. Conventions (tag prefix, base class) are auto-detected from the library CEM ' +
      'so the generated code matches existing library patterns.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description:
            'Custom element tag name (e.g. "hx-button"). Must be lowercase and contain a hyphen.',
        },
        baseClass: {
          type: 'string',
          description:
            'Base class to extend (e.g. "LitElement"). If omitted, detected from the CEM or defaults to "LitElement".',
        },
        slots: {
          type: 'array',
          description: 'Slots to expose. Use name "" or "default" for the unnamed default slot.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Slot name (empty string = default slot).' },
              description: { type: 'string', description: 'Slot description for CEM annotation.' },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
        cssParts: {
          type: 'array',
          description: 'CSS parts to expose via ::part().',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'CSS part name.' },
              description: {
                type: 'string',
                description: 'Part description for CEM annotation.',
              },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
        events: {
          type: 'array',
          description: 'Custom events to dispatch.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Event name (e.g. "hx-change").' },
              type: {
                type: 'string',
                description:
                  'CustomEvent detail type (e.g. "{ value: string }"). Defaults to "void".',
              },
              description: { type: 'string', description: 'Event description.' },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
        properties: {
          type: 'array',
          description: 'Reactive properties / attributes to declare.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'JavaScript property name.' },
              type: {
                type: 'string',
                description: 'TypeScript type (e.g. "string", "boolean", "number").',
              },
              attribute: {
                type: 'string',
                description: 'HTML attribute name if different from the property name.',
              },
              default: {
                type: 'string',
                description: 'Default value as a source literal (e.g. "\'primary\'", "false").',
              },
              description: { type: 'string', description: 'Property description.' },
              reflects: {
                type: 'boolean',
                description: 'Whether the property reflects to an attribute.',
              },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
] as const;

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Dispatches a scaffold tool call by name and returns an MCPToolResult.
 * Called by the server's consolidated CallToolRequestSchema handler.
 */
export function handleScaffoldCall(
  name: string,
  args: Record<string, unknown>,
  _config: McpWcConfig,
  cem: Cem,
): MCPToolResult {
  try {
    if (name === 'scaffold_component') {
      const parsed = ScaffoldComponentArgsSchema.parse(args);
      const result = scaffoldComponent(
        {
          tagName: parsed.tagName,
          baseClass: parsed.baseClass,
          slots: parsed.slots as ScaffoldSlot[] | undefined,
          cssParts: parsed.cssParts as ScaffoldCssPart[] | undefined,
          events: parsed.events as ScaffoldEvent[] | undefined,
          properties: parsed.properties as ScaffoldProperty[] | undefined,
        },
        cem,
        _config.componentPrefix || undefined,
      );

      const output = [
        `## scaffold_component: ${result.tagName}`,
        '',
        `**Detected conventions:** prefix="${result.conventions.prefix}", baseClass="${result.conventions.baseClass}"${result.conventions.packageName ? `, package="${result.conventions.packageName}"` : ''}`,
        '',
        '### Component: `' + result.tagName + '.ts`',
        '```typescript',
        result.component,
        '```',
        '',
        '### Test: `' + result.tagName + '.test.ts`',
        '```typescript',
        result.test,
        '```',
        '',
        '### Story: `' + result.tagName + '.stories.ts`',
        '```typescript',
        result.story,
        '```',
        '',
        '### CSS: `' + result.tagName + '.css`',
        '```css',
        result.css,
        '```',
      ].join('\n');

      return createSuccessResponse(output);
    }

    return createErrorResponse(`Unknown scaffold tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err, config.projectRoot);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the scaffold tool group.
 * Used by the consolidated CallToolRequestSchema handler to dispatch correctly.
 */
export function isScaffoldTool(name: string): boolean {
  return SCAFFOLD_TOOL_DEFINITIONS.some((t) => t.name === name);
}
