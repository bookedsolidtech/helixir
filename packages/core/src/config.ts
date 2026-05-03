import { readFileSync, existsSync } from 'fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'path';
import { discoverCemPath, FRIENDLY_CEM_ERROR } from './shared/discovery.js';

/**
 * Weight multipliers for each health scoring dimension.
 * Each key maps to a dimension in the DIMENSION_REGISTRY.
 * Values are positive multipliers (1.0 = base weight, 2.0 = double, 0.5 = half).
 */
export interface ScoringWeights {
  /** CEM Completeness dimension */
  readonly documentation?: number;
  /** Accessibility dimension */
  readonly accessibility?: number;
  /** Type Coverage dimension */
  readonly typeCoverage?: number;
  /** API Surface Quality dimension */
  readonly apiConsistency?: number;
  /** CSS Architecture dimension */
  readonly cssArchitecture?: number;
  /** Event Architecture dimension */
  readonly eventArchitecture?: number;
  /** Test Coverage dimension */
  readonly testCoverage?: number;
  /** Bundle Size dimension */
  readonly bundleSize?: number;
  /** Story Coverage dimension */
  readonly storyCoverage?: number;
  /** Performance dimension */
  readonly performance?: number;
  /** Drupal Readiness dimension */
  readonly drupalReadiness?: number;
  /** CEM-Source Fidelity dimension */
  readonly cemSourceFidelity?: number;
  /** Slot Architecture dimension */
  readonly slotArchitecture?: number;
  /** Naming Consistency dimension */
  readonly naming?: number;
}

/**
 * Enterprise scoring configuration.
 * Allows teams to adjust dimension weights to match their priorities.
 */
export interface ScoringConfig {
  /** Per-dimension weight multipliers. Missing keys default to 1.0. */
  readonly weights?: ScoringWeights;
}

export interface McpWcConfig {
  readonly cemPath: string;
  readonly projectRoot: string;
  readonly componentPrefix: string;
  readonly healthHistoryDir: string;
  readonly tsconfigPath: string;
  readonly tokensPath: string | null;
  readonly cdnBase: string | null;
  readonly cdnAutoloader?: string | null;
  readonly cdnStylesheet?: string | null;
  readonly watch: boolean;
  /** Optional scoring configuration for customizing health dimension weights. */
  readonly scoring?: ScoringConfig;
  /**
   * Provenance flag: true when cemPath was preserved as an absolute
   * out-of-tree path through the MCP_WC_CONFIG_ALLOW_EXTERNAL_PATHS=1
   * opt-in on an actual external config file (MCP_WC_CONFIG_PATH).
   * Used by the MCP server's startup containment check to bypass
   * the in-root requirement only for paths that genuinely came from
   * the trusted external-config opt-in. Codex round-14 P1.
   */
  readonly cemPathFromExternalConfig?: boolean;
}

/** Mutable version used internally during config construction. */
type McpWcConfigMutable = { -readonly [K in keyof McpWcConfig]: McpWcConfig[K] };

/**
 * Validates and sanitizes the scoring.weights section from config file.
 * Invalid values (non-positive numbers, non-numbers) are discarded with a warning.
 */
function validateScoringWeights(raw: unknown): ScoringWeights | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === 'number' && val > 0) {
      result[key] = val;
    } else if (val !== undefined) {
      process.stderr.write(
        `[helixir] Warning: scoring.weights.${key} must be a positive number. Ignoring.\n`,
      );
    }
  }
  return Object.keys(result).length > 0 ? (result as ScoringWeights) : undefined;
}

/**
 * Parses the scoring section from the config file.
 * Always returns a ScoringConfig object (never undefined) when called.
 */
function parseScoringConfig(raw: unknown): ScoringConfig {
  if (typeof raw !== 'object' || raw === null) return {};
  const scoringRaw = raw as Record<string, unknown>;
  if (scoringRaw['weights'] === undefined) return {};
  const weights = validateScoringWeights(scoringRaw['weights']);
  return weights !== undefined ? { weights } : {};
}

const defaults: McpWcConfig = {
  cemPath: 'custom-elements.json',
  projectRoot: process.cwd(),
  componentPrefix: '',
  healthHistoryDir: '.mcp-wc/health',
  tsconfigPath: 'tsconfig.json',
  tokensPath: null,
  cdnBase: null,
  cdnAutoloader: null,
  cdnStylesheet: null,
  watch: false,
};

// Path-bearing fields that should resolve relative to the config file's
// directory when MCP_WC_CONFIG_PATH points outside projectRoot. URL fields
// (cdnBase, cdnAutoloader, cdnStylesheet) are deliberately excluded.
const CONFIG_PATH_FIELDS = ['cemPath', 'tsconfigPath', 'tokensPath', 'healthHistoryDir'] as const;

function rebaseRelativePaths(
  config: Partial<McpWcConfig>,
  configDir: string,
  projectRoot: string,
): Partial<McpWcConfig> {
  // Path resolution semantics for external configs (MCP_WC_CONFIG_PATH):
  //
  //   - Relative values are resolved against the CONFIG FILE'S directory
  //     (`packages/ds/helixir.mcp.json` with `cemPath: "dist/cem.json"`
  //     means `packages/ds/dist/cem.json`). After rebasing, results inside
  //     projectRoot are relativized to projectRoot for git-backed
  //     consumers; results outside projectRoot are dropped with warning
  //     (the rebase math gave us something the user didn't sanction).
  //
  //   - Absolute values are taken as-is. Inside projectRoot they're
  //     relativized; outside they're dropped (mcp/index.ts containment
  //     check would fatal anyway, and silently letting them through means
  //     analyzing the wrong workspace).
  //
  // Out-of-tree CEMs that genuinely belong on a shared host path should be
  // pointed at via MCP_WC_CEM_PATH directly — env vars bypass this rebase.
  const rebased: Record<string, unknown> = { ...config };
  const normalizedRoot = resolve(projectRoot);
  const dropped = new Set<string>();
  for (const field of CONFIG_PATH_FIELDS) {
    const value = rebased[field];
    if (typeof value !== 'string' || value === '') continue;
    const absolute = isAbsolute(value) ? value : resolve(configDir, value);
    const inRoot = absolute === normalizedRoot || absolute.startsWith(normalizedRoot + sep);
    if (!inRoot) {
      // Out-of-tree cemPath: pinned per `bst-cto-kb/Projects/HELiXiR/
      // HELiXiR migration retry runbook — rea 0.13.0 (2026-05-03).md` §4a:
      // **drop with explicit allowlist override.**
      //
      // Default is drop (defense-in-depth — out-of-tree absolute paths
      // are a path-traversal vector for the MCP server). Set
      // `MCP_WC_CONFIG_ALLOW_EXTERNAL_PATHS=1` to opt back in for
      // legitimate sibling-repo / vendored-CEM use cases. This pins
      // codex's flip-flopping (drop R9/R17/R21/R28/R36/R38 vs
      // preserve R19/R20/R24/R30/R37/R40) into one deliberate position
      // with a documented escape hatch.
      const allowExternal = process.env['MCP_WC_CONFIG_ALLOW_EXTERNAL_PATHS'] === '1';
      if (field === 'cemPath' && !allowExternal) {
        process.stderr.write(
          `[helixir] Warning: cemPath in MCP_WC_CONFIG_PATH resolves to ${absolute}, which is outside projectRoot (${normalizedRoot}). Dropping per defense-in-depth default. (To allow: set MCP_WC_CONFIG_ALLOW_EXTERNAL_PATHS=1, or set MCP_WC_CEM_PATH directly.)\n`,
        );
        dropped.add(field);
      } else {
        rebased[field] = absolute;
        // Mark provenance: this absolute cemPath came from the
        // external-config opt-in path. The MCP server's startup
        // containment check uses this to decide whether to allow
        // the out-of-tree path. Without this flag, the startup
        // check could be tricked by a relative MCP_WC_CEM_PATH
        // override or a fallback-to-in-repo discovery path that
        // happened to be evaluated while the opt-in env was set.
        // Codex round-14 P1.
        if (field === 'cemPath') {
          rebased['cemPathFromExternalConfig'] = true;
        }
      }
      continue;
    }
    // Inside projectRoot: emit project-relative POSIX path so git-backed
    // consumers (gitShow's repo-relative allowlist) work, and so the path
    // doesn't accidentally double-segment when later resolved against
    // projectRoot.
    rebased[field] = relative(normalizedRoot, absolute).split(sep).join('/');
  }
  return Object.fromEntries(
    Object.entries(rebased).filter(([k]) => !dropped.has(k)),
  ) as Partial<McpWcConfig>;
}

/**
 * Result of readConfigFile — includes the partial config plus the directory
 * the config was actually loaded FROM. CEM auto-discovery uses sourceDir
 * to scope its search; null means "no config was loaded, use projectRoot".
 */
interface ConfigReadResult {
  partial: Partial<McpWcConfig>;
  sourceDir: string | null;
}

function readConfigFile(projectRoot: string): ConfigReadResult {
  // Highest priority: explicit MCP_WC_CONFIG_PATH (e.g. set by the VS Code
  // extension's helixir.configPath setting). When present, this absolute or
  // project-relative path is read directly and the in-root discovery below is
  // skipped — workspaces whose config lives outside the project root depend on
  // this override.
  const explicitConfigPath = process.env['MCP_WC_CONFIG_PATH'];
  if (explicitConfigPath !== undefined && explicitConfigPath !== '') {
    const resolvedExplicit = resolve(projectRoot, explicitConfigPath);
    if (existsSync(resolvedExplicit)) {
      try {
        const raw = readFileSync(resolvedExplicit, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<McpWcConfig>;
        // When the config file lives outside projectRoot (e.g. a colocated
        // packages/ds/helixir.mcp.json), its relative path fields refer to the
        // config's own directory, not the workspace root. Rebase them to be
        // relative to projectRoot so downstream resolution against projectRoot
        // points at the right tree without breaking consumers (containment
        // checks, git-backed paths) that require repo-relative inputs.
        return {
          partial: rebaseRelativePaths(parsed, dirname(resolvedExplicit), projectRoot),
          sourceDir: dirname(resolvedExplicit),
        };
      } catch {
        // Bad explicit-path JSON — warn and FALL THROUGH to the in-root
        // discovery below. A stale or malformed editor setting should not
        // silently drop an otherwise valid workspace config.
        process.stderr.write(
          `[helixir] Warning: MCP_WC_CONFIG_PATH=${explicitConfigPath} is malformed. Falling back to in-repo config.\n`,
        );
      }
    } else {
      process.stderr.write(
        `[helixir] Warning: MCP_WC_CONFIG_PATH=${explicitConfigPath} not found. Falling back to in-repo config.\n`,
      );
    }
    // Fall through to standard in-root discovery rather than returning {}.
  }

  const primaryPath = resolve(projectRoot, 'helixir.mcp.json');
  if (existsSync(primaryPath)) {
    try {
      const raw = readFileSync(primaryPath, 'utf-8');
      return { partial: JSON.parse(raw) as Partial<McpWcConfig>, sourceDir: projectRoot };
    } catch {
      process.stderr.write(`[helixir] Warning: helixir.mcp.json is malformed. Using defaults.\n`);
      return { partial: {}, sourceDir: null };
    }
  }

  // Fallback to legacy mcpwc.config.json with deprecation warning
  const legacyPath = resolve(projectRoot, 'mcpwc.config.json');
  if (existsSync(legacyPath)) {
    process.stderr.write(
      `[helixir] Warning: mcpwc.config.json is deprecated. Rename to helixir.mcp.json.\n`,
    );
    try {
      const raw = readFileSync(legacyPath, 'utf-8');
      return { partial: JSON.parse(raw) as Partial<McpWcConfig>, sourceDir: projectRoot };
    } catch {
      process.stderr.write(`[helixir] Warning: mcpwc.config.json is malformed. Using defaults.\n`);
      return { partial: {}, sourceDir: null };
    }
  }

  return { partial: {}, sourceDir: null };
}

export function loadConfig(): Readonly<McpWcConfig> {
  // Determine effective project root — env var takes priority over cwd default
  const effectiveRoot = process.env['MCP_WC_PROJECT_ROOT'] ?? process.cwd();

  // Build config: defaults → file → env vars
  const config: McpWcConfigMutable = { ...defaults, projectRoot: effectiveRoot };

  // Merge config file values (override defaults, lower priority than env vars).
  // Exclude projectRoot from file config — it's already determined from env/cwd,
  // and the config file is located relative to it (circular dependency).
  const fileConfigResult = readConfigFile(effectiveRoot);
  const fileConfig = fileConfigResult.partial;
  const configSourceDir = fileConfigResult.sourceDir;
  const fileCemPath = fileConfig.cemPath;
  // Prevent config file from overriding projectRoot (circular dependency).
  const safeFileConfig: Omit<Partial<McpWcConfig>, 'projectRoot'> = { ...fileConfig };
  delete (safeFileConfig as Record<string, unknown>)['projectRoot'];
  // scoring needs special validation — extract before mass-assign and apply separately
  const rawScoringFromFile = (safeFileConfig as Record<string, unknown>)['scoring'];
  delete (safeFileConfig as Record<string, unknown>)['scoring'];
  // Strip cemPathFromExternalConfig — this is an internal provenance
  // flag stamped only by rebaseRelativePaths when the runtime opt-in
  // fires. Accepting it from user-supplied JSON would let any local
  // helixir.mcp.json forge "trusted external config" provenance and
  // bypass the startup containment check. Codex round-15 P1.
  delete (safeFileConfig as Record<string, unknown>)['cemPathFromExternalConfig'];
  Object.assign(config, safeFileConfig);

  // Apply validated scoring config (weights must be positive numbers)
  if (rawScoringFromFile !== undefined) {
    config.scoring = parseScoringConfig(rawScoringFromFile);
  }

  // Auto-discover cemPath if not explicitly configured via env var or config file
  const cemPathExplicit = process.env['MCP_WC_CEM_PATH'] !== undefined || fileCemPath !== undefined;

  if (!cemPathExplicit) {
    // Two-phase CEM discovery:
    //   1. If the config was loaded from a directory inside projectRoot
    //      (e.g. packages/ds/helixir.mcp.json), search there first so a
    //      package-local dist/custom-elements.json wins.
    //   2. If nothing is found there — or the config came from outside
    //      projectRoot, or fall-through happened (missing/malformed
    //      explicit config) — search projectRoot. This avoids missing a
    //      workspace-root manifest in monorepos that use a nested config
    //      only for tsconfigPath/tokensPath.
    const normalizedRoot = resolve(effectiveRoot);
    let discoveryRoot = effectiveRoot;
    let discovered: string | null = null;
    if (configSourceDir !== null) {
      const normalizedSource = resolve(configSourceDir);
      if (
        (normalizedSource === normalizedRoot ||
          normalizedSource.startsWith(normalizedRoot + sep)) &&
        normalizedSource !== normalizedRoot
      ) {
        discovered = discoverCemPath(normalizedSource);
        if (discovered !== null) {
          discoveryRoot = normalizedSource;
        }
      }
    }
    if (discovered === null) {
      discovered = discoverCemPath(effectiveRoot);
      discoveryRoot = effectiveRoot;
    }
    if (discovered !== null) {
      // discoverCemPath returns a path relative to discoveryRoot; rebase to
      // projectRoot so the containment check + git-backed consumers stay
      // happy. Normalize to POSIX separators for Windows compatibility.
      const absolute = resolve(discoveryRoot, discovered);
      if (absolute === normalizedRoot || absolute.startsWith(normalizedRoot + sep)) {
        const relPath = relative(normalizedRoot, absolute) || discovered;
        config.cemPath = relPath.split(sep).join('/');
      } else {
        // Discovered CEM is outside projectRoot — would fail downstream.
        // Fall back to the friendly-error path rather than handing it on.
        process.stderr.write(FRIENDLY_CEM_ERROR);
      }
    } else {
      process.stderr.write(FRIENDLY_CEM_ERROR);
    }
  }

  // Apply env vars (highest priority)
  // String keys map directly; nullable keys treat the literal string 'null' as null.
  const ENV_MAP_STRING: Readonly<Record<string, keyof McpWcConfigMutable>> = {
    MCP_WC_CEM_PATH: 'cemPath',
    MCP_WC_PROJECT_ROOT: 'projectRoot',
    MCP_WC_COMPONENT_PREFIX: 'componentPrefix',
    MCP_WC_HEALTH_HISTORY_DIR: 'healthHistoryDir',
    MCP_WC_TSCONFIG_PATH: 'tsconfigPath',
  };
  const ENV_MAP_NULLABLE: Readonly<Record<string, keyof McpWcConfigMutable>> = {
    MCP_WC_TOKENS_PATH: 'tokensPath',
    MCP_WC_CDN_BASE: 'cdnBase',
    MCP_WC_CDN_AUTOLOADER: 'cdnAutoloader',
    MCP_WC_CDN_STYLESHEET: 'cdnStylesheet',
  };

  for (const [envKey, configKey] of Object.entries(ENV_MAP_STRING)) {
    const val = process.env[envKey];
    if (val !== undefined) {
      (config as Record<string, unknown>)[configKey] = val;
      // If MCP_WC_CEM_PATH overrides cemPath, the new value did NOT
      // come from the trusted external-config opt-in path — clear the
      // provenance flag so the startup containment check evaluates
      // the new path on its own merits. Codex round-15 P1.
      if (envKey === 'MCP_WC_CEM_PATH') {
        (config as Record<string, unknown>)['cemPathFromExternalConfig'] = false;
      }
    }
  }
  for (const [envKey, configKey] of Object.entries(ENV_MAP_NULLABLE)) {
    const val = process.env[envKey];
    if (val !== undefined) {
      (config as Record<string, unknown>)[configKey] = val === 'null' ? null : val;
    }
  }

  // --watch CLI flag overrides config file value
  if (process.argv.includes('--watch')) {
    config.watch = true;
  }

  return config;
}
