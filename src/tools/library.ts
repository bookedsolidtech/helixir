import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import type { McpWcConfig } from '../config.js';
import {
  CemSchema,
  loadLibrary,
  getLibrary,
  listLibraries,
  removeLibrary,
} from '../handlers/cem.js';
import type { Cem } from '../handlers/cem.js';
import { resolveCdnCem } from '../handlers/cdn.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

// --- Arg schemas ---

const LoadLibraryArgsSchema = z.object({
  libraryId: z.string().min(1),
  cemPath: z.string().optional(),
  packageName: z.string().optional(),
  version: z.string().optional().default('latest'),
  registry: z.enum(['jsdelivr', 'unpkg']).optional().default('jsdelivr'),
});

const UnloadLibraryArgsSchema = z.object({
  libraryId: z.string().min(1),
});

// --- Tool definitions ---

export const LIBRARY_TOOL_DEFINITIONS = [
  {
    name: 'load_library',
    description:
      'Load an additional web component library into memory by libraryId. Provide either a local cemPath or a packageName (+ optional version) to fetch from CDN. Once loaded, all CEM-dependent tools can target this library using the libraryId parameter.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Unique identifier for this library (e.g. "shoelace", "spectrum"). Used to reference it in subsequent tool calls.',
        },
        cemPath: {
          type: 'string',
          description:
            'Local file path to the custom-elements.json file. Relative paths are resolved from projectRoot.',
        },
        packageName: {
          type: 'string',
          description:
            'npm package name to fetch CEM from CDN (e.g. "@shoelace-style/shoelace"). Used when cemPath is not provided.',
        },
        version: {
          type: 'string',
          description: 'Package version for CDN fetch (default: "latest").',
        },
        registry: {
          type: 'string',
          enum: ['jsdelivr', 'unpkg'],
          description: 'CDN registry for package fetch (default: "jsdelivr").',
        },
      },
      required: ['libraryId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_libraries',
    description:
      'List all loaded web component libraries with their IDs, component counts, and source types.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'unload_library',
    description:
      'Remove a loaded library from memory. Cannot unload the "default" library. Subsequent tool calls with this libraryId will fail.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryId: {
          type: 'string',
          description: 'The library ID to unload.',
        },
      },
      required: ['libraryId'],
      additionalProperties: false,
    },
  },
];

// --- Handler ---

export async function handleLibraryCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
): Promise<MCPToolResult> {
  try {
    if (name === 'load_library') {
      const { libraryId, cemPath, packageName, version, registry } =
        LoadLibraryArgsSchema.parse(args);

      if (libraryId === 'default') {
        return createErrorResponse(
          'Cannot overwrite the "default" library. Choose a different libraryId.',
        );
      }

      if (cemPath) {
        // Load from local file
        const absPath = resolve(config.projectRoot, cemPath);
        let raw: string;
        try {
          raw = readFileSync(absPath, 'utf-8');
        } catch {
          return createErrorResponse(`CEM file not found at ${absPath}`);
        }
        let cem: Cem;
        try {
          cem = CemSchema.parse(JSON.parse(raw));
        } catch (err) {
          return createErrorResponse(`Invalid CEM file at ${absPath}: ${String(err)}`);
        }
        loadLibrary(libraryId, cem, 'local');
        const componentCount = cem.modules
          .flatMap((m) => m.declarations ?? [])
          .filter((d) => d.tagName).length;
        return createSuccessResponse(
          `Loaded library "${libraryId}" from ${absPath}: ${componentCount} component(s).`,
        );
      }

      if (packageName) {
        // Load from CDN using existing resolve_cdn_cem logic
        const result = await resolveCdnCem(packageName, version, registry, config);
        // resolveCdnCem already loads into the store via loadCdnCem, but under sanitized name.
        // We also load under the user's chosen libraryId for explicit targeting.
        const entry = getLibrary(result.libraryId);
        if (entry) {
          loadLibrary(libraryId, entry, 'cdn');
        }
        return createSuccessResponse(
          `Loaded library "${libraryId}" from CDN (${packageName}@${version}): ${result.componentCount} component(s).`,
        );
      }

      return createErrorResponse(
        'Either cemPath (local file) or packageName (CDN) must be provided.',
      );
    }

    if (name === 'list_libraries') {
      const libs = listLibraries();
      if (libs.length === 0) {
        return createSuccessResponse('No libraries loaded.');
      }
      return createSuccessResponse(JSON.stringify(libs, null, 2));
    }

    if (name === 'unload_library') {
      const { libraryId } = UnloadLibraryArgsSchema.parse(args);
      if (libraryId === 'default') {
        return createErrorResponse('Cannot unload the "default" library.');
      }
      const removed = removeLibrary(libraryId);
      if (!removed) {
        return createErrorResponse(`Library "${libraryId}" not found.`);
      }
      return createSuccessResponse(`Library "${libraryId}" unloaded successfully.`);
    }

    return createErrorResponse(`Unknown library tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

export function isLibraryTool(name: string): boolean {
  return LIBRARY_TOOL_DEFINITIONS.some((t) => t.name === name);
}
