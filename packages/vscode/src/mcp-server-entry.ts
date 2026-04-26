/**
 * Helixir MCP Server — entry point for the bundled server.
 *
 * This file is bundled by esbuild into dist/mcp-server.js (ESM format).
 * It is spawned as a child process by the VS Code extension (mcpProvider.ts)
 * using stdio transport.
 *
 * The helixir/mcp module exports a `main()` function that initialises and
 * starts the MCP server, listening on stdin/stdout.
 *
 * Imports the source TypeScript directly (not the `helixir/mcp` package
 * export, which resolves to the built `build/src/mcp/index.js` artifact).
 * Bundling from source guarantees `dist/mcp-server.js` reflects the current
 * working tree, not whatever was last committed to the build directory.
 */
import { main } from '../../../src/mcp/index.js';

main().catch((err: unknown) => {
  process.stderr.write(`[helixir-mcp] Fatal: ${String(err)}\n`);
  process.exit(1);
});
