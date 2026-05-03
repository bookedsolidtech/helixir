/**
 * MCP tools: verify_token_inheritance + analyze_token_canonicality (M4)
 *
 * Closes defect-corpus classes 01, 02, 03, 14 by surfacing token alias
 * usage, cascade gaps, color literals, and cssprop deprecation drift
 * on extending components.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import type { Cem } from '../handlers/cem.js';
import { parseTokens } from '../handlers/tokens.js';
import { loadDeprecatedAliases, resolveCanonicality } from '../handlers/token-canonicality.js';
import { verifyTokenInheritance } from '../handlers/verify-token-inheritance.js';
import { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';
import type { MCPToolResult } from '../shared/mcp-helpers.js';
import { handleToolError, MCPError, ErrorCategory } from '../shared/error-handling.js';

// ─── Arg schemas ────────────────────────────────────────────────────────────

const VerifyTokenInheritanceArgsSchema = z.object({
  tagName: z.string(),
  /**
   * Optional CSS source paths (relative to projectRoot) to scan for
   * raw color literals. If omitted, only the CEM-declared cssProperties
   * surface is checked.
   */
  cssSourcePaths: z.array(z.string()).optional(),
  /**
   * Optional pre-computed overlay key sets, when the consumer already
   * knows which CSS-prop names exist under dark / high-contrast.
   * Most consumers should leave this empty — the loader uses the
   * tokens.deprecated.json sibling file instead.
   */
  overlays: z
    .object({
      dark: z.array(z.string()).optional(),
      highContrast: z.array(z.string()).optional(),
    })
    .optional(),
});

const AnalyzeTokenCanonicalityArgsSchema = z.object({
  /**
   * When omitted, returns canonicality info for every alias known to
   * the loaded map. When provided, returns just that one token's status.
   */
  tokenName: z.string().optional(),
});

// ─── Tool definitions ──────────────────────────────────────────────────────

export const TOKEN_VERIFICATION_TOOL_DEFINITIONS = [
  {
    name: 'verify_token_inheritance',
    description:
      'Audit a component for token-related defects across helix R8/R11/R14/R32 alias renames, cascade gaps under dark / high-contrast overlays, and raw color literals where tokens exist. Findings reference defect-corpus classes 01, 02, 03, 14. Use this BEFORE shipping an extending component or migrating across helix major versions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tagName: {
          type: 'string',
          description: 'Custom element tag name (e.g. "hx-button").',
        },
        cssSourcePaths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional CSS source paths (relative to projectRoot). When provided, the color-literal scan runs across them. Without this, only the CEM-declared cssProperties surface is checked.',
        },
        overlays: {
          type: 'object',
          properties: {
            dark: { type: 'array', items: { type: 'string' } },
            highContrast: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
          description:
            'Optional pre-computed CSS-prop key sets per theme overlay. Used by the cascade-gap check.',
        },
      },
      required: ['tagName'],
      additionalProperties: false,
    },
  },
  {
    name: 'analyze_token_canonicality',
    description:
      'Look up a single token (or every alias in the loaded map) against the helix R-round deprecation history. Returns whether the name is canonical, the canonical replacement, and provenance metadata (R-round, commit, removal version). Backbone of M4 finding generation; expose for ad-hoc consumer queries.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenName: {
          type: 'string',
          description:
            'CSS variable name (e.g. "--hx-color-border-on-dark-default"). Omit to dump every alias in the map.',
        },
      },
      additionalProperties: false,
    },
  },
];

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export async function handleTokenVerificationTool(
  name: string,
  args: unknown,
  config: McpWcConfig,
  cem: Cem,
): Promise<MCPToolResult> {
  try {
    if (name === 'verify_token_inheritance') {
      const parsed = VerifyTokenInheritanceArgsSchema.parse(args);
      const decl = findDecl(cem, parsed.tagName);
      if (decl === null) {
        throw new MCPError(
          `Component "${parsed.tagName}" not found in CEM.`,
          ErrorCategory.NOT_FOUND,
        );
      }

      const aliases = await loadDeprecatedAliases(config);
      const tokens =
        config.tokensPath !== null && config.tokensPath !== ''
          ? await parseTokens(
              isAbsolute(config.tokensPath)
                ? config.tokensPath
                : resolve(config.projectRoot, config.tokensPath),
            )
          : [];

      const cssSources =
        parsed.cssSourcePaths !== undefined
          ? await loadCssSources(config.projectRoot, parsed.cssSourcePaths)
          : undefined;

      // Derive overlay sets from the loaded tokens when the caller
      // doesn't pass them explicitly. Helix's DTCG flat naming makes
      // overlay membership inferable: tokens whose flat name starts
      // with `dark-` or `dark.` belong to the dark overlay; `hc-` /
      // `high-contrast-` belong to the high-contrast overlay.
      // Without this derivation, the cascade-gap check (defect class
      // 02) is dead code unless a caller hand-passes the sets — which
      // contradicts the tool description. Codex round-28 P2.
      const overlays = parsed.overlays
        ? {
            ...(parsed.overlays.dark ? { dark: new Set(parsed.overlays.dark) } : {}),
            ...(parsed.overlays.highContrast
              ? { highContrast: new Set(parsed.overlays.highContrast) }
              : {}),
          }
        : deriveOverlaysFromTokens(tokens);

      const result = verifyTokenInheritance({
        decl,
        aliases,
        tokens,
        ...(cssSources !== undefined ? { cssSources } : {}),
        ...(overlays !== undefined ? { overlays } : {}),
      });
      return createSuccessResponse(JSON.stringify(result, null, 2));
    }

    if (name === 'analyze_token_canonicality') {
      const parsed = AnalyzeTokenCanonicalityArgsSchema.parse(args);
      const aliases = await loadDeprecatedAliases(config);
      if (parsed.tokenName !== undefined) {
        const result = resolveCanonicality(parsed.tokenName, aliases);
        return createSuccessResponse(
          JSON.stringify({ tokenName: parsed.tokenName, ...result }, null, 2),
        );
      }
      // Dump every alias.
      return createSuccessResponse(
        JSON.stringify(
          {
            count: aliases.length,
            aliases,
          },
          null,
          2,
        ),
      );
    }

    return createErrorResponse(`Unknown token-verification tool: ${name}`);
  } catch (err) {
    const mcpErr = handleToolError(err, config.projectRoot);
    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);
  }
}

export function isTokenVerificationTool(name: string): boolean {
  return TOKEN_VERIFICATION_TOOL_DEFINITIONS.some((t) => t.name === name);
}

// ─── Internals ──────────────────────────────────────────────────────────────

function findDecl(cem: Cem, tagName: string) {
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tagName) return decl;
    }
  }
  return null;
}

/**
 * Derive overlay coverage sets from a flat token list. Heuristic on
 * the W3C DTCG flat-name convention helix uses:
 *   - Tokens whose name starts with `dark-` or contains `.dark.` are
 *     dark-overlay coverage.
 *   - Tokens starting with `hc-` / `high-contrast-` / containing
 *     `.high-contrast.` are HC coverage.
 * The CSS variable name is `--<token.name>` so we map each overlay
 * member to its `--`-prefixed form for the cascade-gap check.
 */
function deriveOverlaysFromTokens(
  tokens: { name: string }[],
): { dark?: Set<string>; highContrast?: Set<string> } | undefined {
  const dark = new Set<string>();
  const highContrast = new Set<string>();
  // Same DTCG dot→dash normalization as verify-token-inheritance.ts
  // tokenIndex build. Codex round-31 P1.
  const toCssVar = (n: string): string => '--' + n.replace(/\./g, '-');
  for (const t of tokens) {
    const cssVar = toCssVar(t.name);
    const lower = t.name.toLowerCase();
    // Dark coverage detection — recognizes (in order):
    //   - flat-name prefix:  `dark-color-foo`     (kebab DTCG)
    //   - top-level group:   `dark.color.foo`     (nested DTCG)
    //   - nested suffix:     `color.foo.dark`     (alt DTCG style)
    // Codex round-29 P2 added the top-level `dark.` recognition.
    const isDark =
      lower.startsWith('dark-') ||
      lower.startsWith('dark.') ||
      lower.includes('.dark.') ||
      lower.endsWith('.dark');
    if (isDark) {
      const stripped = t.name
        .replace(/^dark[-.]/i, '')
        .replace(/\.dark$/i, '')
        .replace(/\.dark\./gi, '.');
      dark.add(toCssVar(stripped));
      dark.add(cssVar);
    }
    const isHc =
      lower.startsWith('hc-') ||
      lower.startsWith('hc.') ||
      lower.startsWith('high-contrast-') ||
      lower.startsWith('high-contrast.') ||
      lower.includes('.hc.') ||
      lower.includes('.high-contrast.') ||
      lower.endsWith('.hc') ||
      lower.endsWith('.high-contrast');
    if (isHc) {
      const stripped = t.name
        .replace(/^hc[-.]/i, '')
        .replace(/^high-contrast[-.]/i, '')
        .replace(/\.hc$/i, '')
        .replace(/\.high-contrast$/i, '')
        .replace(/\.hc\./gi, '.')
        .replace(/\.high-contrast\./gi, '.');
      highContrast.add(toCssVar(stripped));
      highContrast.add(cssVar);
    }
  }
  if (dark.size === 0 && highContrast.size === 0) return undefined;
  const out: { dark?: Set<string>; highContrast?: Set<string> } = {};
  if (dark.size > 0) out.dark = dark;
  if (highContrast.size > 0) out.highContrast = highContrast;
  return out;
}

async function loadCssSources(projectRoot: string, paths: string[]): Promise<string[]> {
  // Path containment: reject absolute paths and ../ traversal so the
  // tool can't be coerced into reading arbitrary host files. The
  // resolved path must stay inside projectRoot. Codex round-31 P2.
  const projectAbs = resolve(projectRoot);
  const out: string[] = [];
  for (const p of paths) {
    if (isAbsolute(p)) {
      throw new MCPError(
        `CSS source path must be project-relative: "${p}"`,
        ErrorCategory.VALIDATION,
      );
    }
    const abs = resolve(projectAbs, p);
    if (abs !== projectAbs && !abs.startsWith(projectAbs + sep)) {
      throw new MCPError(
        `CSS source path escapes projectRoot via ../: "${p}"`,
        ErrorCategory.VALIDATION,
      );
    }
    if (!existsSync(abs)) {
      throw new MCPError(`CSS source path not found: ${p}`, ErrorCategory.NOT_FOUND);
    }
    out.push(await readFile(abs, 'utf-8'));
  }
  return out;
}
