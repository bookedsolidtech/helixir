/**
 * Token canonicality + alias resolution (M4)
 *
 * Pinned per `bst-cto-kb/Projects/HELiXiR/Audits/defect-corpus/01-token-deprecated-alias.md`
 * and §4 of the migration retry runbook.
 *
 * Helix renamed tokens across R8 / R11 / R14 / R32, then re-added the
 * old names as deprecated aliases for backwards compat. Helixir's
 * existing tokens reader treats both names as equally valid; this
 * module adds the canonicality layer:
 *
 *   - Parse the alias map (sibling `tokens.deprecated.json` or DTCG
 *     `$deprecated` metadata). Each alias points at its canonical
 *     replacement and records when (R-round + commit) it became
 *     deprecated.
 *   - Resolve any token name to `{ canonical, replacedBy, deprecatedSince }`.
 *   - Provide a single chokepoint M4's `verify_token_inheritance` and
 *     M5's component-extension audit can call.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve, dirname, join } from 'node:path';
import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

// ─── Public types ───────────────────────────────────────────────────────────

export interface DeprecatedAlias {
  /** The CSS-variable form of the deprecated token name (e.g. "--hx-color-border-on-dark-default"). */
  alias: string;
  /** The canonical replacement, also CSS-variable form. */
  replacedBy: string;
  /** Helix release version the deprecation landed in (e.g. "3.2.2"). */
  deprecatedSinceVersion: string | null;
  /** R-round identifier (e.g. "R8"). */
  deprecatedSinceRound: string | null;
  /** Commit sha that introduced the deprecation. */
  deprecatedSinceCommit: string | null;
  /** Helix release version when the alias is scheduled for removal (e.g. "4.0.0"). */
  removalScheduledFor: string | null;
  /** Free-text rationale for the rename (used in finding messages). */
  rationale: string | null;
}

export interface CanonicalityResult {
  /** True when the token name is the current canonical (not aliased). */
  canonical: boolean;
  /** When `canonical: false`, the canonical replacement to use instead. */
  replacedBy: string | null;
  /** Provenance metadata when known. Null for unmapped tokens. */
  deprecatedSinceVersion: string | null;
  deprecatedSinceRound: string | null;
  deprecatedSinceCommit: string | null;
  removalScheduledFor: string | null;
  rationale: string | null;
}

// ─── Alias-map schema ───────────────────────────────────────────────────────

const DeprecatedAliasSchema = z.object({
  alias: z.string(),
  replacedBy: z.string(),
  deprecatedSinceVersion: z.string().nullable().optional(),
  deprecatedSinceRound: z.string().nullable().optional(),
  deprecatedSinceCommit: z.string().nullable().optional(),
  removalScheduledFor: z.string().nullable().optional(),
  rationale: z.string().nullable().optional(),
});

const DeprecatedAliasesFileSchema = z.object({
  schemaVersion: z.literal(1),
  /**
   * Optional helix repo + commit-range pointer for traceability.
   * Pure metadata — not consumed by resolution.
   */
  source: z.object({ repo: z.string().optional(), since: z.string().optional() }).optional(),
  aliases: z.array(DeprecatedAliasSchema),
});

export type DeprecatedAliasesFile = z.infer<typeof DeprecatedAliasesFileSchema>;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load the deprecated-aliases map. Lookup order:
 *   1. `MCP_WC_TOKENS_DEPRECATED_PATH` env var (absolute or
 *      tokens-relative).
 *   2. `tokens.deprecated.json` next to the configured tokensPath.
 *   3. Empty map (token tools work, just without the canonicality layer).
 *
 * The file format is documented in the schema above. Returns the array
 * of aliases — empty when no map is configured.
 */
export async function loadDeprecatedAliases(config: McpWcConfig): Promise<DeprecatedAlias[]> {
  const path = resolveAliasesPath(config);
  if (path === null || !existsSync(path)) return [];

  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (err) {
    throw new MCPError(
      `Could not read deprecated-aliases file at ${path}: ${String(err)}`,
      ErrorCategory.FILESYSTEM,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new MCPError(
      `Deprecated-aliases file at ${path} is not valid JSON: ${String(err)}`,
      ErrorCategory.VALIDATION,
    );
  }

  const result = DeprecatedAliasesFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new MCPError(
      `Deprecated-aliases file at ${path} doesn't match schema: ${result.error.message}`,
      ErrorCategory.VALIDATION,
    );
  }
  // Normalize all optional null/undefined fields so callers don't need
  // to defensively check both.
  return result.data.aliases.map((a) => ({
    alias: a.alias,
    replacedBy: a.replacedBy,
    deprecatedSinceVersion: a.deprecatedSinceVersion ?? null,
    deprecatedSinceRound: a.deprecatedSinceRound ?? null,
    deprecatedSinceCommit: a.deprecatedSinceCommit ?? null,
    removalScheduledFor: a.removalScheduledFor ?? null,
    rationale: a.rationale ?? null,
  }));
}

/**
 * Resolve a single token name against an alias map. Pure function —
 * the caller supplies the loaded map (so tests / batch operations
 * don't re-read the file each call).
 */
export function resolveCanonicality(
  tokenName: string,
  aliases: DeprecatedAlias[],
): CanonicalityResult {
  const match = aliases.find((a) => a.alias === tokenName);
  if (match === undefined) {
    return {
      canonical: true,
      replacedBy: null,
      deprecatedSinceVersion: null,
      deprecatedSinceRound: null,
      deprecatedSinceCommit: null,
      removalScheduledFor: null,
      rationale: null,
    };
  }
  return {
    canonical: false,
    replacedBy: match.replacedBy,
    deprecatedSinceVersion: match.deprecatedSinceVersion,
    deprecatedSinceRound: match.deprecatedSinceRound,
    deprecatedSinceCommit: match.deprecatedSinceCommit,
    removalScheduledFor: match.removalScheduledFor,
    rationale: match.rationale,
  };
}

/**
 * Convenience — build a canonical-lookup `Map<alias, CanonicalityResult>`
 * up front, then resolve in O(1). For batch token-usage scans.
 */
export function buildCanonicalityIndex(
  aliases: DeprecatedAlias[],
): Map<string, CanonicalityResult> {
  const index = new Map<string, CanonicalityResult>();
  for (const a of aliases) {
    index.set(a.alias, {
      canonical: false,
      replacedBy: a.replacedBy,
      deprecatedSinceVersion: a.deprecatedSinceVersion,
      deprecatedSinceRound: a.deprecatedSinceRound,
      deprecatedSinceCommit: a.deprecatedSinceCommit,
      removalScheduledFor: a.removalScheduledFor,
      rationale: a.rationale,
    });
  }
  return index;
}

// ─── Internals ──────────────────────────────────────────────────────────────

function resolveAliasesPath(config: McpWcConfig): string | null {
  // Resolve the tokens.json absolute path first so we can use its
  // directory as the base for the relative env override below — the
  // env var is conceptually a sibling pointer to tokens.json, not
  // a project-root-relative path. Codex round-29 P2.
  const tokensAbs =
    config.tokensPath !== null && config.tokensPath !== ''
      ? isAbsolute(config.tokensPath)
        ? config.tokensPath
        : resolve(config.projectRoot, config.tokensPath)
      : null;

  const envPath = process.env['MCP_WC_TOKENS_DEPRECATED_PATH'];
  if (envPath !== undefined && envPath !== '') {
    if (isAbsolute(envPath)) return envPath;
    // Relative env value: prefer tokens.json's directory (sibling
    // semantics). Fall back to projectRoot if no tokensPath is
    // configured.
    const base = tokensAbs !== null ? dirname(tokensAbs) : config.projectRoot;
    return resolve(base, envPath);
  }
  if (tokensAbs === null) return null;
  return join(dirname(tokensAbs), 'tokens.deprecated.json');
}
