import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { discoverCemPath, FRIENDLY_CEM_ERROR } from './shared/discovery.js';

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
}

/** Mutable version used internally during config construction. */
type McpWcConfigMutable = { -readonly [K in keyof McpWcConfig]: McpWcConfig[K] };

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
  // Primary config file name
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

  // Backward-compatible fallback to legacy config file name
  const legacyPath = resolve(projectRoot, 'mcpwc.config.json');
  if (existsSync(legacyPath)) {
    process.stderr.write(
      `[helixir] Warning: mcpwc.config.json is deprecated. Rename to helixir.mcp.json.\n`,
    );
    try {
      const raw = readFileSync(legacyPath, 'utf-8');
      return JSON.parse(raw) as Partial<McpWcConfig>;
    } catch {
      process.stderr.write(`[helixir] Warning: mcpwc.config.json is malformed. Using defaults.\n`);
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
  Object.assign(config, safeFileConfig);

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
  if (process.env['MCP_WC_CEM_PATH'] !== undefined) {
    config.cemPath = process.env['MCP_WC_CEM_PATH'];
  }
  if (process.env['MCP_WC_PROJECT_ROOT'] !== undefined) {
    config.projectRoot = process.env['MCP_WC_PROJECT_ROOT'];
  }
  if (process.env['MCP_WC_COMPONENT_PREFIX'] !== undefined) {
    config.componentPrefix = process.env['MCP_WC_COMPONENT_PREFIX'];
  }
  if (process.env['MCP_WC_HEALTH_HISTORY_DIR'] !== undefined) {
    config.healthHistoryDir = process.env['MCP_WC_HEALTH_HISTORY_DIR'];
  }
  if (process.env['MCP_WC_TSCONFIG_PATH'] !== undefined) {
    config.tsconfigPath = process.env['MCP_WC_TSCONFIG_PATH'];
  }
  if (process.env['MCP_WC_TOKENS_PATH'] !== undefined) {
    const val = process.env['MCP_WC_TOKENS_PATH'];
    config.tokensPath = val === 'null' ? null : val;
  }
  if (process.env['MCP_WC_CDN_BASE'] !== undefined) {
    const val = process.env['MCP_WC_CDN_BASE'];
    config.cdnBase = val === 'null' ? null : val;
  }
  if (process.env['MCP_WC_CDN_AUTOLOADER'] !== undefined) {
    const val = process.env['MCP_WC_CDN_AUTOLOADER'];
    config.cdnAutoloader = val === 'null' ? null : val;
  }
  if (process.env['MCP_WC_CDN_STYLESHEET'] !== undefined) {
    const val = process.env['MCP_WC_CDN_STYLESHEET'];
    config.cdnStylesheet = val === 'null' ? null : val;
  }

  // --watch CLI flag overrides config file value
  if (process.argv.includes('--watch')) {
    config.watch = true;
  }

  return config;
}
