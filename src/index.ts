#!/usr/bin/env node
/**
 * Entry point for the wc-tools binary.
 * Dispatches to the MCP server or CLI subcommands based on argv.
 *
 * - No subcommand / `serve`: starts MCP stdio server (backwards compat)
 * - All other subcommands: routed through the CLI handler
 */

// Find the first non-flag positional argument
const args = process.argv.slice(2);
const subcommand = args.find((a) => !a.startsWith('-'));
const hasHelpFlag = args.includes('--help') || args.includes('-h');

if ((!subcommand && !hasHelpFlag) || subcommand === 'serve') {
  import('./mcp/index.js')
    .then(({ main }) => main())
    .catch((err) => {
      process.stderr.write(`Fatal: ${String(err)}\n`);
      process.exit(1);
    });
} else {
  import('./cli/index.js')
    .then(({ runCli }) => runCli())
    .catch((err) => {
      process.stderr.write(`Fatal: ${String(err)}\n`);
      process.exit(1);
    });
}
