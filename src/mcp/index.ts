import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { existsSync, readFileSync, watch as fsWatch } from 'fs';
import { resolve, relative, sep } from 'path';
import { loadConfig } from '../../packages/core/src/config.js';
import { CemSchema, loadLibrary, resolveCem } from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';
import {
  DISCOVERY_TOOL_DEFINITIONS,
  handleDiscoveryCall,
  isDiscoveryTool,
} from '../../packages/core/src/tools/discovery.js';
import {
  COMPONENT_TOOL_DEFINITIONS,
  handleComponentCall,
  isComponentTool,
} from '../../packages/core/src/tools/component.js';
import {
  SAFETY_TOOL_DEFINITIONS,
  handleSafetyCall,
  isSafetyTool,
} from '../../packages/core/src/tools/safety.js';
import {
  HEALTH_TOOL_DEFINITIONS,
  handleHealthCall,
  isHealthTool,
} from '../../packages/core/src/tools/health.js';
import {
  TYPESCRIPT_TOOL_DEFINITIONS,
  handleTypeScriptCall,
  isTypeScriptTool,
} from '../../packages/core/src/tools/typescript.js';
import { isTypescriptAvailable } from '../../packages/core/src/handlers/typescript.js';
import {
  TOKEN_TOOL_DEFINITIONS,
  handleTokenCall,
  isTokenTool,
} from '../../packages/core/src/tools/tokens.js';
import {
  FRAMEWORK_TOOL_DEFINITIONS,
  handleFrameworkCall,
  isFrameworkTool,
} from '../../packages/core/src/tools/framework.js';
import {
  VALIDATE_TOOL_DEFINITIONS,
  handleValidateCall,
  isValidateTool,
} from '../../packages/core/src/tools/validate.js';
import {
  COMPOSITION_TOOL_DEFINITIONS,
  handleCompositionCall,
  isCompositionTool,
} from '../../packages/core/src/tools/composition.js';
import {
  BUNDLE_TOOL_DEFINITIONS,
  handleBundleCall,
  isBundleTool,
} from '../../packages/core/src/tools/bundle.js';
import {
  CDN_TOOL_DEFINITIONS,
  handleCdnCall,
  isCdnTool,
} from '../../packages/core/src/tools/cdn.js';
import {
  STORY_TOOL_DEFINITIONS,
  handleStoryCall,
  isStoryTool,
} from '../../packages/core/src/tools/story.js';
import {
  BENCHMARK_TOOL_DEFINITIONS,
  handleBenchmarkCall,
  isBenchmarkTool,
} from '../../packages/core/src/tools/benchmark.js';
import {
  LIBRARY_TOOL_DEFINITIONS,
  handleLibraryCall,
  isLibraryTool,
} from '../../packages/core/src/tools/library.js';
import {
  TYPEGENERATE_TOOL_DEFINITIONS,
  handleTypegenerateCall,
  isTypegenerateTool,
} from '../../packages/core/src/tools/typegenerate.js';
import {
  STYLING_TOOL_DEFINITIONS,
  handleStylingCall,
  isStylingTool,
} from '../../packages/core/src/tools/styling.js';
import { createErrorResponse } from '../../packages/core/src/shared/mcp-helpers.js';
import type { MCPToolResult } from '../../packages/core/src/shared/mcp-helpers.js';

// --- CEM cache ---

// Module-level parsed CEM — loaded at startup, re-assigned on file change in watch mode.
// CONCURRENCY NOTE (Finding #12): cemCache and cemLoadedAt are global mutable state.
// A request arriving during the debounced reload window may read a partially-stale cache.
// The loading sentinel below prevents reads while a reload is in flight; a full CemCacheManager
// class extraction would eliminate the globals entirely but is out of scope here.
let cemCache: Cem | null = null;
let cemLoadedAt: Date | null = null;
// Set to true during the debounced reload to signal that cemCache is being refreshed.
let cemReloading = false;

function loadCem(cemAbsPath: string): { componentCount: number } {
  const raw = readFileSync(cemAbsPath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  cemCache = CemSchema.parse(parsed);
  cemLoadedAt = new Date();
  // Register the default CEM in the namespaced store
  loadLibrary('default', cemCache, 'config');
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
      cemReloading = true;
      try {
        const { componentCount } = loadCem(cemAbsPath);
        process.stderr.write(
          `[helixir] CEM reloaded: ${componentCount} components (was ${prevCount})\n`,
        );
        prevCount = componentCount;
      } catch (err) {
        process.stderr.write(`[helixir] CEM reload failed: ${String(err)}\n`);
      } finally {
        cemReloading = false;
      }
    }, 100);
  });
}

const server = new Server({ name: 'helixir', version: '0.4.0' }, { capabilities: { tools: {} } });

export async function main(): Promise<void> {
  const config = loadConfig();

  const resolvedProjectRoot = resolve(config.projectRoot);
  const cemAbsPath = resolve(resolvedProjectRoot, config.cemPath);

  // Verify the resolved cemPath is contained within projectRoot (prevent absolute cemPath escaping).
  if (!cemAbsPath.startsWith(resolvedProjectRoot + sep) && cemAbsPath !== resolvedProjectRoot) {
    process.stderr.write(`Fatal: cemPath resolves outside of projectRoot. Refusing to load.\n`);
    process.exit(1);
  }

  if (!existsSync(cemAbsPath)) {
    const relPath = relative(resolvedProjectRoot, cemAbsPath);
    process.stderr.write(
      `Fatal: CEM file not found at ${relPath}. Set MCP_WC_CEM_PATH or add cemPath to helixir.mcp.json\n`,
    );
    process.exit(1);
  }

  // Parse and cache CEM at startup (validates JSON + schema in one step)
  try {
    loadCem(cemAbsPath);
  } catch (err) {
    const relPath = relative(resolvedProjectRoot, cemAbsPath);
    process.stderr.write(`Fatal: CEM file at ${relPath} is invalid: ${String(err)}\n`);
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
    ...BENCHMARK_TOOL_DEFINITIONS,
    ...LIBRARY_TOOL_DEFINITIONS,
    ...TYPEGENERATE_TOOL_DEFINITIONS,
    ...STYLING_TOOL_DEFINITIONS,
    ...tsTools,
  ];

  const allTools = [...coreTools, ...TOKEN_TOOL_DEFINITIONS];

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    // TODO (Finding #17): `args as Record<string, unknown>` is an unsafe cast.
    // The Zod schemas validate at runtime but this cast hides potential type bugs.
    // The ideal fix is generic handler signatures threaded from Zod schemas, but
    // that requires a larger refactor of the handler interface.
    const typedArgs = args as Record<string, unknown>;

    const result = await (async (): Promise<MCPToolResult> => {
      // Library management tools (no CEM dependency)
      if (isLibraryTool(name)) return handleLibraryCall(name, typedArgs, config);

      // Extract optional libraryId from args for CEM resolution
      const libraryId =
        typeof typedArgs['libraryId'] === 'string' ? typedArgs['libraryId'] : undefined;

      if (
        isDiscoveryTool(name) ||
        isComponentTool(name) ||
        isSafetyTool(name) ||
        isHealthTool(name)
      ) {
        if (cemCache === null || cemReloading)
          return createErrorResponse(
            'CEM not yet loaded — server is still initializing. Please retry.',
          );
        const effectiveCem = resolveCem(libraryId, cemCache);
        if (isDiscoveryTool(name))
          return handleDiscoveryCall(name, typedArgs, config, effectiveCem, cemLoadedAt);
        if (isComponentTool(name))
          return handleComponentCall(name, typedArgs, config, effectiveCem);
        if (isSafetyTool(name)) return handleSafetyCall(name, typedArgs, config, effectiveCem);
        if (isHealthTool(name)) return handleHealthCall(name, typedArgs, config, effectiveCem);
      }
      if (isTypeScriptTool(name)) {
        if (!isTypescriptAvailable()) {
          return createErrorResponse(
            'TypeScript diagnostics require TypeScript to be installed.\n' +
              'Run: npm install typescript --save-dev\n' +
              'Then restart helixir.',
          );
        }
        return handleTypeScriptCall(name, typedArgs, config);
      }
      if (isCompositionTool(name)) {
        if (cemCache === null || cemReloading)
          return createErrorResponse(
            'CEM not yet loaded — server is still initializing. Please retry.',
          );
        return handleCompositionCall(name, typedArgs, resolveCem(libraryId, cemCache));
      }
      if (isBundleTool(name)) return handleBundleCall(name, typedArgs, config);
      if (isCdnTool(name)) return handleCdnCall(name, typedArgs, config);
      if (isStoryTool(name)) {
        if (cemCache === null || cemReloading)
          return createErrorResponse(
            'CEM not yet loaded — server is still initializing. Please retry.',
          );
        return handleStoryCall(name, typedArgs, resolveCem(libraryId, cemCache));
      }
      if (isFrameworkTool(name)) return handleFrameworkCall(name, typedArgs, config);
      if (isValidateTool(name)) {
        if (cemCache === null || cemReloading)
          return createErrorResponse(
            'CEM not yet loaded — server is still initializing. Please retry.',
          );
        return handleValidateCall(name, typedArgs, resolveCem(libraryId, cemCache));
      }
      if (isStylingTool(name)) {
        if (cemCache === null || cemReloading)
          return createErrorResponse(
            'CEM not yet loaded — server is still initializing. Please retry.',
          );
        return handleStylingCall(name, typedArgs, resolveCem(libraryId, cemCache));
      }
      if (isBenchmarkTool(name)) return handleBenchmarkCall(name, typedArgs, config);
      if (isTypegenerateTool(name)) {
        if (cemCache === null || cemReloading)
          return createErrorResponse(
            'CEM not yet loaded — server is still initializing. Please retry.',
          );
        return handleTypegenerateCall(name, typedArgs, resolveCem(libraryId, cemCache));
      }
      if (isTokenTool(name)) {
        if (!config.tokensPath) {
          return createErrorResponse(
            'Token tools are not enabled. Set tokensPath in helixir.mcp.json or MCP_WC_TOKENS_PATH.',
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
