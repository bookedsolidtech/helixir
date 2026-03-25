/**
 * @helixir/core — barrel exports for all handlers, shared utilities, and tool definitions.
 *
 * Note: tools/discovery exports a `scoreComponent` search-scoring function that conflicts
 * with the health `scoreComponent` function from handlers. The handlers version is exported
 * under its original name; the discovery version is available via direct import from
 * './tools/discovery.js' or aliased as `scoreComponentSearch` below.
 */

// Config
export * from './config.js';

// Handlers (all handler modules)
export * from './handlers/index.js';

// Shared utilities
export * from './shared/index.js';

// Tool definitions and dispatchers
// Re-export most tools via export *, but handle scoreComponent conflict explicitly.
export * from './tools/benchmark.js';
export * from './tools/bundle.js';
export * from './tools/cdn.js';
export * from './tools/component.js';
export * from './tools/composition.js';
export {
  DISCOVERY_TOOL_DEFINITIONS,
  handleDiscoveryCall,
  isDiscoveryTool,
  tokenize,
  // Export discovery's scoreComponent under an alias to avoid conflict with handlers/health
  scoreComponent as scoreComponentSearch,
} from './tools/discovery.js';
export * from './tools/framework.js';
export * from './tools/health.js';
export * from './tools/library.js';
export * from './tools/safety.js';
export * from './tools/story.js';
export * from './tools/styling.js';
export * from './tools/tokens.js';
export * from './tools/typescript.js';
export * from './tools/validate.js';
export * from './tools/scaffold.js';
