import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface McpWcConfig {
  cemPath: string;
  projectRoot: string;
  componentPrefix: string;
  healthHistoryDir: string;
  tsconfigPath: string;
  tokensPath: string | null;
}

const defaults: McpWcConfig = {
  cemPath: 'custom-elements.json',
  projectRoot: process.cwd(),
  componentPrefix: '',
  healthHistoryDir: '.mcp-wc/health',
  tsconfigPath: 'tsconfig.json',
  tokensPath: null,
};

function readConfigFile(projectRoot: string): Partial<McpWcConfig> {
  const configPath = resolve(projectRoot, 'mcpwc.config.json');
  if (!existsSync(configPath)) return {};
  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as Partial<McpWcConfig>;
  } catch {
    return {};
  }
}

export function loadConfig(): McpWcConfig {
  // Determine effective project root — env var takes priority over cwd default
  const effectiveRoot = process.env['MCP_WC_PROJECT_ROOT'] ?? process.cwd();

  // Build config: defaults → file → env vars
  const config: McpWcConfig = { ...defaults, projectRoot: effectiveRoot };

  // Merge config file values (override defaults, lower priority than env vars)
  const fileConfig = readConfigFile(effectiveRoot);
  Object.assign(config, fileConfig);

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

  return config;
}
