/**
 * MCP tool: verify_extension (M5)
 *
 * Validates that an extending component preserves its parent's
 * contract — slots, ARIA, ElementInternals lifecycle, events,
 * accessible-label devWarn, forced-colors, 44 px touch target.
 *
 * Closes defect-corpus classes 05-11.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import type { Cem, CemDeclaration } from '../handlers/cem.js';
import { verifyExtension } from '../handlers/verify-extension.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError, MCPError, ErrorCategory } from '../shared/error-handling.js';

// ─── Arg schemas ────────────────────────────────────────────────────────────

const VerifyExtensionArgsSchema = z.object({
  /** Parent component tag — must exist in the loaded CEM. */
  parentTagName: z.string(),
  /** Extending subclass tag — must also exist in the same CEM. */
  subclassTagName: z.string(),
  /**
   * Optional subclass source paths (relative to projectRoot). When
   * supplied, the source-deepening checks (forced-colors,
   * accessible-label, event-suppression, touch-target) run.
   */
  subclassSourcePaths: z
    .object({
      code: z.string().optional(),
      styles: z.string().optional(),
    })
    .optional(),
  /**
   * Optional library ID for multi-library workspaces. Resolved by the
   * dispatcher before this handler runs. Codex round-33 P2.
   */
  libraryId: z.string().optional(),
});

// ─── Tool definitions ──────────────────────────────────────────────────────

export const VERIFY_EXTENSION_TOOL_DEFINITIONS = [
  {
    name: 'verify_extension',
    description:
      "Audit an extending component against its parent's contract surface. Catches slot drift, ARIA regressions, lost form-association, suppressed events, missing forced-colors blocks, sub-44px touch targets, and broken accessible-label devWarn patterns. Findings reference defect-corpus classes 05-11. Use this BEFORE shipping any helix-pattern subclass.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        parentTagName: {
          type: 'string',
          description: 'Tag name of the parent component (e.g. "hx-button").',
        },
        subclassTagName: {
          type: 'string',
          description: 'Tag name of the extending subclass (e.g. "figgy-button").',
        },
        subclassSourcePaths: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Path to subclass component source (.ts / .js).',
            },
            styles: {
              type: 'string',
              description: 'Path to subclass styles (.css / .styles.ts).',
            },
          },
          additionalProperties: false,
          description:
            'Optional subclass source paths for deeper checks. Without these, the audit only inspects the CEM surface.',
        },
        libraryId: {
          type: 'string',
          description:
            'Optional library ID for multi-library workspaces (resolved by the dispatcher).',
        },
      },
      required: ['parentTagName', 'subclassTagName'],
      additionalProperties: false,
    },
  },
];

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export async function handleVerifyExtensionTool(
  name: string,
  args: unknown,
  config: McpWcConfig,
  cem: Cem,
): Promise<MCPToolResult> {
  try {
    if (name === 'verify_extension') {
      const parsed = VerifyExtensionArgsSchema.parse(args);
      const parent = findDecl(cem, parsed.parentTagName);
      const subclass = findDecl(cem, parsed.subclassTagName);
      if (parent === null) {
        throw new MCPError(
          `Parent component "${parsed.parentTagName}" not found in CEM.`,
          ErrorCategory.NOT_FOUND,
        );
      }
      if (subclass === null) {
        throw new MCPError(
          `Subclass component "${parsed.subclassTagName}" not found in CEM.`,
          ErrorCategory.NOT_FOUND,
        );
      }

      const subclassSources = parsed.subclassSourcePaths
        ? {
            ...(parsed.subclassSourcePaths.code !== undefined
              ? { code: await readSourceFile(config.projectRoot, parsed.subclassSourcePaths.code) }
              : {}),
            ...(parsed.subclassSourcePaths.styles !== undefined
              ? {
                  styles: await readSourceFile(
                    config.projectRoot,
                    parsed.subclassSourcePaths.styles,
                  ),
                }
              : {}),
          }
        : undefined;

      const result = verifyExtension({
        parent,
        subclass,
        ...(subclassSources !== undefined ? { subclassSources } : {}),
      });
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }
    return createErrorResponse(`Unknown verify-extension tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err, config.projectRoot);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

export function isVerifyExtensionTool(name: string): boolean {
  return VERIFY_EXTENSION_TOOL_DEFINITIONS.some((t) => t.name === name);
}

// ─── Internals ──────────────────────────────────────────────────────────────

function findDecl(cem: Cem, tagName: string): CemDeclaration | null {
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tagName) return decl;
    }
  }
  return null;
}

async function readSourceFile(projectRoot: string, path: string): Promise<string> {
  // Path containment: reject absolute paths and ../ traversal so the
  // tool can't be coerced into reading arbitrary host files. The
  // resolved path must stay inside projectRoot. Codex round-31 P2.
  if (isAbsolute(path)) {
    throw new MCPError(`Source path must be project-relative: "${path}"`, ErrorCategory.VALIDATION);
  }
  const projectAbs = resolve(projectRoot);
  const abs = resolve(projectAbs, path);
  if (abs !== projectAbs && !abs.startsWith(projectAbs + sep)) {
    throw new MCPError(
      `Source path escapes projectRoot via ../: "${path}"`,
      ErrorCategory.VALIDATION,
    );
  }
  if (!existsSync(abs)) {
    throw new MCPError(`Source file not found: ${path}`, ErrorCategory.NOT_FOUND);
  }
  return readFile(abs, 'utf-8');
}
