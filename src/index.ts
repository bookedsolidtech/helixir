#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { existsSync, readFileSync, watch as fsWatch } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
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
import {
  FRAMEWORK_TOOL_DEFINITIONS,
  handleFrameworkCall,
  isFrameworkTool,
} from './tools/framework.js';
import { VALIDATE_TOOL_DEFINITIONS, handleValidateCall, isValidateTool } from './tools/validate.js';
import {
  COMPOSITION_TOOL_DEFINITIONS,
  handleCompositionCall,
  isCompositionTool,
} from './tools/composition.js';
import { BUNDLE_TOOL_DEFINITIONS, handleBundleCall, isBundleTool } from './tools/bundle.js';
import { CDN_TOOL_DEFINITIONS, handleCdnCall, isCdnTool } from './tools/cdn.js';
import { STORY_TOOL_DEFINITIONS, handleStoryCall, isStoryTool } from './tools/story.js';
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
          `[wc-tools] CEM reloaded: ${componentCount} components (was ${prevCount})\n`,
        );
        prevCount = componentCount;
      } catch (err) {
        process.stderr.write(`[wc-tools] CEM reload failed: ${String(err)}\n`);
      }
    }, 100);
  });
}

let _pkgVersion = '0.0.0';
try {
  const parsed = JSON.parse(
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8'),
  ) as Record<string, unknown>;
  if (typeof parsed.version === 'string' && parsed.version.trim() !== '') {
    _pkgVersion = parsed.version;
  }
} catch {
  // fallback to default version
}
const server = new Server(
  { name: 'wc-tools', version: _pkgVersion },
  { capabilities: { tools: {} } },
);

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
    ...COMPOSITION_TOOL_DEFINITIONS,
    ...SAFETY_TOOL_DEFINITIONS,
    ...HEALTH_TOOL_DEFINITIONS,
    ...FRAMEWORK_TOOL_DEFINITIONS,
    ...VALIDATE_TOOL_DEFINITIONS,
    ...BUNDLE_TOOL_DEFINITIONS,
    ...CDN_TOOL_DEFINITIONS,
    ...STORY_TOOL_DEFINITIONS,
    ...tsTools,
  ];

  const allTools = [...coreTools, ...TOKEN_TOOL_DEFINITIONS];

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
              'Then restart wc-tools.',
          );
        }
        return handleTypeScriptCall(name, typedArgs, config);
      }
      if (isCompositionTool(name)) {
        if (cemCache === null)
          return createErrorResponse(
            'CEM not yet loaded — server is still initializing. Please retry.',
          );
        return handleCompositionCall(name, typedArgs, cemCache);
      }
      if (isBundleTool(name)) return handleBundleCall(name, typedArgs, config);
      if (isCdnTool(name)) return handleCdnCall(name, typedArgs, config);
      if (isStoryTool(name)) {
        if (cemCache === null)
          return createErrorResponse(
            'CEM not yet loaded — server is still initializing. Please retry.',
          );
        return handleStoryCall(name, typedArgs, cemCache);
      }
      if (isFrameworkTool(name)) return handleFrameworkCall(name, typedArgs, config);
      if (isValidateTool(name)) {
        if (cemCache === null)
          return createErrorResponse(
            'CEM not yet loaded — server is still initializing. Please retry.',
          );
        return handleValidateCall(name, typedArgs, cemCache);
      }
      if (isTokenTool(name)) {
        if (!config.tokensPath) {
          return createErrorResponse(
            'Token tools are not enabled. Set tokensPath in mcpwc.config.json or MCP_WC_TOKENS_PATH.',
          );
        }
        return handleTokenCall(name, typedArgs, config);
      }
      return createErrorResponse(`Unknown tool: ${name}`);
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
