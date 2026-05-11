/**
 * esbuild configuration for the Helixir VS Code extension.
 *
 * Produces two bundles:
 *   dist/extension.js   — VS Code extension host entry (CJS, externalizes 'vscode')
 *   dist/mcp-server.js  — Helixir MCP server entry (ESM, bundles helixir)
 */

import * as esbuild from 'esbuild';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: 'info',
  platform: 'node',
  target: 'node20',
};

/**
 * Bundle 1: VS Code extension host entry
 *   - CommonJS (VS Code extension host requires CJS)
 *   - 'vscode' is externalized — provided by the VS Code runtime
 */
const extensionConfig = {
  ...sharedOptions,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  format: 'cjs',
  external: ['vscode'],
};

/**
 * Bundle 2: Helixir MCP server
 *   - ESM format (helixir is an ES module)
 *   - Bundles helixir and its dependencies so the extension is self-contained
 *   - Spawned as a child process via stdio by the VS Code extension
 */
const mcpServerConfig = {
  ...sharedOptions,
  entryPoints: ['src/mcp-server-entry.ts'],
  outfile: 'dist/mcp-server.js',
  format: 'esm',
  banner: {
    js: '#!/usr/bin/env node\n// Helixir MCP Server — bundled by esbuild',
  },
};

async function build() {
  const extensionCtx = await esbuild.context(extensionConfig);
  const mcpServerCtx = await esbuild.context(mcpServerConfig);

  if (isWatch) {
    await Promise.all([extensionCtx.watch(), mcpServerCtx.watch()]);
    console.log('[helixir-vscode] Watching for changes...');
  } else {
    await Promise.all([extensionCtx.rebuild(), mcpServerCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), mcpServerCtx.dispose()]);
    console.log('[helixir-vscode] Build complete.');
  }
}

build().catch((err) => {
  console.error('[helixir-vscode] Build failed:', err);
  process.exit(1);
});
