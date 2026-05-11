/**
 * MCP tool: audit_component_with_codex (M3)
 *
 * Per-component codex audit with caching. Re-runs against the same
 * contract surface return the cached result in milliseconds; surface
 * changes force a fresh codex review.
 *
 * Pre-M2 strict mode this is opt-in. Post-M6 it'll be a named
 * recommended call from the helixir-tools agent recipe.
 */

import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import type { Cem } from '../handlers/cem.js';
import { auditComponentWithCodex } from '../handlers/codex-audit.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError } from '../shared/error-handling.js';

// ─── Arg schemas ────────────────────────────────────────────────────────────

const AuditComponentArgsSchema = z.object({
  tagName: z.string(),
  /** Skip the cache and force a fresh codex run. Default false. */
  force: z.boolean().optional().default(false),
  /** Override the audits-output root. Defaults to <projectRoot>/audits/. */
  auditsRoot: z.string().optional(),
  /**
   * Optional library ID for multi-library workspaces. Resolved by the
   * dispatcher before this handler runs; declared here so Zod accepts
   * the standard arg without rejecting it as unknown. Codex round-33 P2.
   */
  libraryId: z.string().optional(),
});

// ─── Tool definitions ──────────────────────────────────────────────────────

export const CODEX_AUDIT_TOOL_DEFINITIONS = [
  {
    name: 'audit_component_with_codex',
    description:
      'Run a structured codex adversarial audit against one component. Caches results by contract-surface hash so unchanged surfaces hit cache instantly; surface changes force a fresh review. Findings reference the helix defect-class corpus (01–14). Use this BEFORE shipping an extending component or migrating between helix versions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description:
            'Custom element tag name (e.g. "hx-button"). Must match a declaration in the loaded CEM.',
        },
        force: {
          type: 'boolean',
          description:
            'Skip the cache and force a fresh codex run. Default false. Use when you suspect a stale audit or want a deterministic re-evaluation.',
        },
        auditsRoot: {
          type: 'string',
          description:
            'Override the audits output directory. Defaults to <projectRoot>/audits/. Use for monorepo setups that prefer per-package audit dirs.',
        },
        libraryId: {
          type: 'string',
          description:
            'Optional library ID for multi-library workspaces (resolved by the dispatcher).',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
];

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export async function handleCodexAuditTool(
  name: string,
  args: unknown,
  config: McpWcConfig,
  cem: Cem,
): Promise<MCPToolResult> {
  try {
    if (name === 'audit_component_with_codex') {
      const parsed = AuditComponentArgsSchema.parse(args);
      const optsBase = parsed.force === true ? { force: true } : {};
      const opts =
        parsed.auditsRoot !== undefined ? { ...optsBase, auditsRoot: parsed.auditsRoot } : optsBase;
      const result = await auditComponentWithCodex(config, parsed.tagName, cem, opts);
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }
    return createErrorResponse(`Unknown codex-audit tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err, config.projectRoot);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

export function isCodexAuditTool(name: string): boolean {
  return CODEX_AUDIT_TOOL_DEFINITIONS.some((t) => t.name === name);
}
