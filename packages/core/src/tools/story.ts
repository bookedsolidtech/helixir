import { z } from 'zod';
import type { Cem } from '../handlers/cem.js';
import { generateStory } from '../handlers/story.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

const GenerateStoryArgsSchema = z.object({
  tagName: z.string(),
});

export const STORY_TOOL_DEFINITIONS = [
  {
    name: 'generate_story',
    description:
      'Generates a Storybook CSF3 story file for a web component based on its CEM declaration. Returns TypeScript source ready to paste into a .stories.ts file, with argTypes, default args, a render function, and named story exports for each variant value.',
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
          description: 'The custom element tag name (e.g. "my-button").',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a story tool call by name and returns an MCPToolResult.
 */
export async function handleStoryCall(
  name: string,
  args: Record<string, unknown>,
  cem: Cem,
): Promise<MCPToolResult> {
  try {
    if (name === 'generate_story') {
      const { tagName } = GenerateStoryArgsSchema.parse(args);

      // Find the declaration in the CEM
      let decl: import('../handlers/cem.js').CemDeclaration | undefined;
      for (const mod of cem.modules) {
        for (const d of mod.declarations ?? []) {
          if (d.tagName === tagName) {
            decl = d;
            break;
          }
        }
        if (decl) break;
      }

      if (!decl) {
        const known = cem.modules
          .flatMap((m) => m.declarations ?? [])
          .filter((d) => d.tagName)
          .map((d) => d.tagName as string)
          .sort()
          .join(', ');
        return createErrorResponse(
          `Component "${tagName}" not found in CEM. Known components: ${known || '(none)'}`,
        );
      }

      const story = generateStory(decl);
      return createSuccessResponse(story);
    }

    return createErrorResponse(`Unknown story tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the story tool group.
 */
export function isStoryTool(name: string): boolean {
  return STORY_TOOL_DEFINITIONS.some((t) => t.name === name);
}
