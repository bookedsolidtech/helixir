#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { existsSync, readFileSync, watch as fsWatch } from 'fs';
import { resolve } from 'path';
import { loadConfig } from './config.js';
import { CemSchema } from './handlers/cem.js';
import type { Cem } from './handlers/cem.js';
import {
  DISCOVERY_TOOL_DEFINITIONS,
  handleDiscoveryCall,
  isDiscoveryTool,
} from './tools/discovery.js';
import {
  COMPONENT_TOOL_DEFINITIONS,
  handleComponentCall,
  isComponentTool,
} from './tools/component.js';
import { SAFETY_TOOL_DEFINITIONS, handleSafetyCall, isSafetyTool } from './tools/safety.js';
import { HEALTH_TOOL_DEFINITIONS, handleHealthCall, isHealthTool } from './tools/health.js';
import {
  TYPESCRIPT_TOOL_DEFINITIONS,
  handleTypeScriptCall,
  isTypeScriptTool,
} from './tools/typescript.js';
import { isTypescriptAvailable } from './handlers/typescript.js';
import { TOKEN_TOOL_DEFINITIONS, handleTokenCall, isTokenTool } from './tools/tokens.js';
import { createErrorResponse } from './shared/mcp-helpers.js';
import type { MCPToolResult } from './shared/mcp-helpers.js';

// --- CEM cache ---

// Module-level parsed CEM — loaded at startup, re-assigned on file change in watch mode
let cemCache: Cem | null = null;
let cemLoadedAt: Date | null = null;

function loadCem(cemAbsPath: string): { componentCount: number } {
  const raw = readFileSync(cemAbsPath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  cemCache = CemSchema.parse(parsed);
  cemLoadedAt = new Date();
  const componentCount = cemCache.modules
    .flatMap((m) => m.declarations ?? [])
    .filter((d) => d.tagName).length;
  return { componentCount };
}

function startCemWatcher(cemAbsPath: string): void {
  // cemCache is already loaded at startup — derive initial count from it
  let prevCount =
    cemCache?.modules.flatMap((m) => m.declarations ?? []).filter((d) => d.tagName).length ?? 0;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  fsWatch(cemAbsPath, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const { componentCount } = loadCem(cemAbsPath);
        process.stderr.write(
          `[wc-mcp] CEM reloaded: ${componentCount} components (was ${prevCount})\n`,
        );
        prevCount = componentCount;
      } catch (err) {
        process.stderr.write(`[wc-mcp] CEM reload failed: ${String(err)}\n`);
      }
    }, 100);
  });
}

const server = new Server({ name: 'wc-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });

async function main(): Promise<void> {
  const config = loadConfig();

  // --watch CLI flag overrides config file value
  if (process.argv.includes('--watch')) {
    config.watch = true;
  }

  const cemAbsPath = resolve(config.projectRoot, config.cemPath);

  if (!existsSync(cemAbsPath)) {
    process.stderr.write(
      `Fatal: CEM file not found at ${cemAbsPath}. Set MCP_WC_CEM_PATH or add cemPath to mcpwc.config.json\n`,
    );
    process.exit(1);
  }

  // Parse and cache CEM at startup (validates JSON + schema in one step)
  try {
    loadCem(cemAbsPath);
  } catch (err) {
    process.stderr.write(`Fatal: CEM file at ${cemAbsPath} is invalid: ${String(err)}\n`);
    process.exit(1);
  }

  if (config.watch) {
    startCemWatcher(cemAbsPath);
  }

  const tsTools = isTypescriptAvailable() ? TYPESCRIPT_TOOL_DEFINITIONS : [];

  const coreTools = [
    ...DISCOVERY_TOOL_DEFINITIONS,
    ...COMPONENT_TOOL_DEFINITIONS,
    ...SAFETY_TOOL_DEFINITIONS,
    ...HEALTH_TOOL_DEFINITIONS,
    ...tsTools,
  ];

  const allTools = config.tokensPath ? [...coreTools, ...TOKEN_TOOL_DEFINITIONS] : coreTools;

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const typedArgs = args as Record<string, unknown>;

    const result = await (async (): Promise<MCPToolResult> => {
      if (
        isDiscoveryTool(name) ||
        isComponentTool(name) ||
        isSafetyTool(name) ||
        isHealthTool(name)
      ) {
        if (cemCache === null)
          return createErrorResponse(
            'CEM not yet loaded — server is still initializing. Please retry.',
          );
        if (isDiscoveryTool(name))
          return handleDiscoveryCall(name, typedArgs, config, cemCache, cemLoadedAt);
        if (isComponentTool(name)) return handleComponentCall(name, typedArgs, config, cemCache);
        if (isSafetyTool(name)) return handleSafetyCall(name, typedArgs, config, cemCache);
        if (isHealthTool(name)) return handleHealthCall(name, typedArgs, config, cemCache);
      }
      if (isTypeScriptTool(name)) {
        if (!isTypescriptAvailable()) {
          return createErrorResponse(
            'TypeScript diagnostics require TypeScript to be installed.\n' +
              'Run: npm install typescript --save-dev\n' +
              'Then restart wc-mcp.',
          );
        }
        return handleTypeScriptCall(name, typedArgs, config);
      }
      if (isTokenTool(name)) {
        if (!config.tokensPath) {
          return createErrorResponse(
            'Token tools are not enabled. Set tokensPath in mcpwc.config.json or MCP_WC_TOKENS_PATH.',
          );
        }
        return handleTokenCall(name, typedArgs, config);
      }
      throw new Error(`Unknown tool: ${name}`);
    })();

    // MCPToolResult matches the MCP protocol CallToolResult shape at runtime.
    // Cast to satisfy the SDK's ServerResult union which requires an index signature.
    return result as unknown as Record<string, unknown>;
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const subcommand = process.argv[2];

if (subcommand === 'init') {
  import('./cli.js')
    .then(({ runInit }) => runInit())
    .catch((err) => {
      process.stderr.write(`Fatal: ${String(err)}\n`);
      process.exit(1);
    });
} else {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
