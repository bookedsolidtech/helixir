#!/usr/bin/env node
/**
 * Entry point for the wc-tools binary.
 * Dispatches to the MCP server or CLI init command based on argv.
 */

const subcommand = process.argv[2];

if (subcommand === 'init') {
  import('./cli/index.js')
    .then(({ runInit }) => runInit())
    .catch((err) => {
      process.stderr.write(`Fatal: ${String(err)}\n`);
      process.exit(1);
    });
} else {
  import('./mcp/index.js')
    .then(({ main }) => main())
    .catch((err) => {
      process.stderr.write(`Fatal: ${String(err)}\n`);
      process.exit(1);
    });
}
