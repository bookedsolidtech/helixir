import { z } from 'zod';
import type { McpWcConfig } from '../config.js';
import { estimateBundleSize } from '../handlers/bundle.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

const NPM_PACKAGE_NAME_REGEX = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9._-]*$/;
const STRICT_SEMVER_REGEX = /^(?:latest|\d+\.\d+\.\d+(?:-[a-zA-Z0-9._-]+)?(?:\+[a-zA-Z0-9._-]+)?)$/;

const EstimateBundleSizeArgsSchema = z.object({
  tagName: z.string(),
  package: z
    .string()
    .regex(NPM_PACKAGE_NAME_REGEX, 'Invalid npm package name. Must follow npm naming rules.')
    .optional(),
  version: z
    .string()
    .regex(
      STRICT_SEMVER_REGEX,
      'Invalid version string. Must be "latest" or a valid semver (e.g. 1.2.3, 1.2.3-beta.1).',
    )
    .optional()
    .default('latest'),
  include_full_package: z.boolean().optional().default(true),
});

export const BUNDLE_TOOL_DEFINITIONS = [
  {
    name: 'estimate_bundle_size',
    description:
      'Estimate the bundle size (minified + gzipped) for a web component or its parent npm package. ' +
      'Queries bundlephobia and the npm registry. Results are cached in memory for 24 hours.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'The custom element tag name, e.g. "sl-button".',
        },
        package: {
          type: 'string',
          description:
            'Optional: explicit npm package name (e.g. "@shoelace-style/shoelace"). ' +
            'If omitted, the package is derived from componentPrefix in your config using a ' +
            'built-in prefix→package map (e.g. "sl"→"@shoelace-style/shoelace", ' +
            '"fluent-"→"@fluentui/web-components", "mwc-"→"@material/web", ' +
            '"ion-"→"@ionic/core", "vaadin-"→"@vaadin/components", ' +
            '"lion-"→"@lion/ui", "pf-"→"@patternfly/elements", ' +
            '"carbon-"→"@carbon/web-components"). ' +
            'If your prefix is not in this list, you must provide the package explicitly — ' +
            'omitting it will return a VALIDATION error.',
        },
        version: {
          type: 'string',
          description: 'Package version to look up. Defaults to "latest".',
        },
        include_full_package: {
          type: 'boolean',
          description:
            'When false, suppresses the full_package size from the result. Defaults to true.',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
];

/**
 * Dispatches a bundle tool call by name and returns an MCPToolResult.
 */
export async function handleBundleCall(
  name: string,
  args: Record<string, unknown>,
  config: McpWcConfig,
): Promise<MCPToolResult> {
  try {
    if (name === 'estimate_bundle_size') {
      const {
        tagName,
        package: pkg,
        version,
        include_full_package,
      } = EstimateBundleSizeArgsSchema.parse(args);

      const result = await estimateBundleSize(tagName, config, pkg, version);

      // Suppress full_package if caller opted out
      if (!include_full_package) {
        result.estimates.full_package = null;
      }

      return createSuccessResponse(JSON.stringify(result, null, 2));
    }
    return createErrorResponse(`Unknown bundle tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err, config.projectRoot);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

/**
 * Returns true if the given tool name belongs to the bundle tool group.
 */
export function isBundleTool(name: string): boolean {
  return BUNDLE_TOOL_DEFINITIONS.some((t) => t.name === name);
}
