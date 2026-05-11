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
 * Imports via the `helixir/mcp` package export so the VS Code extension's
 * own TypeScript project (rootDir = packages/vscode/src) keeps type-
 * checking. The build is staleness-protected by the root prebuild script —
 * `pnpm --filter helixir-vscode build` runs after the root build that
 * produces the package's built artifact.
 */
import { main } from 'helixir/mcp';

main().catch((err: unknown) => {
  process.stderr.write(`[helixir-mcp] Fatal: ${String(err)}\n`);
  process.exit(1);
});
