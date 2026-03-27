import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
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

function readConfigFile(projectRoot: string): Partial<McpWcConfig> {
  const primaryPath = resolve(projectRoot, 'helixir.mcp.json');
  if (existsSync(primaryPath)) {
    try {
      const raw = readFileSync(primaryPath, 'utf-8');
      return JSON.parse(raw) as Partial<McpWcConfig>;
    } catch {
      process.stderr.write(`[helixir] Warning: helixir.mcp.json is malformed. Using defaults.\n`);
      return {};
    }
  }

  return {};
}

export function loadConfig(): Readonly<McpWcConfig> {
  // Determine effective project root — env var takes priority over cwd default
  const effectiveRoot = process.env['MCP_WC_PROJECT_ROOT'] ?? process.cwd();

  // Build config: defaults → file → env vars
  const config: McpWcConfigMutable = { ...defaults, projectRoot: effectiveRoot };

  // Merge config file values (override defaults, lower priority than env vars).
  // Exclude projectRoot from file config — it's already determined from env/cwd,
  // and the config file is located relative to it (circular dependency).
  const fileConfig = readConfigFile(effectiveRoot);
  const fileCemPath = fileConfig.cemPath;
  // Prevent config file from overriding projectRoot (circular dependency).
  const safeFileConfig: Omit<Partial<McpWcConfig>, 'projectRoot'> = { ...fileConfig };
  delete (safeFileConfig as Record<string, unknown>)['projectRoot'];
  // scoring needs special validation — extract before mass-assign and apply separately
  const rawScoringFromFile = (safeFileConfig as Record<string, unknown>)['scoring'];
  delete (safeFileConfig as Record<string, unknown>)['scoring'];
  Object.assign(config, safeFileConfig);

  // Apply validated scoring config (weights must be positive numbers)
  if (rawScoringFromFile !== undefined) {
    config.scoring = parseScoringConfig(rawScoringFromFile);
  }

  // Auto-discover cemPath if not explicitly configured via env var or config file
  const cemPathExplicit = process.env['MCP_WC_CEM_PATH'] !== undefined || fileCemPath !== undefined;

  if (!cemPathExplicit) {
    const discovered = discoverCemPath(effectiveRoot);
    if (discovered !== null) {
      config.cemPath = discovered;
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
