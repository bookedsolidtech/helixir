# Helixir — VS Code Extension

**AI-powered web component intelligence for VS Code.**

Helixir gives AI assistants full situational awareness of any web component library by wiring the [helixir MCP server](https://github.com/bookedsolidtech/helixir) directly into VS Code's MCP layer.

## Features

- **MCP server auto-registration** — the helixir MCP server starts automatically with VS Code, no manual configuration required
- **30+ MCP tools** — component discovery, health scoring, breaking-change detection, TypeScript diagnostics, design token lookup, and more
- **Zero hallucinations** — every AI component suggestion is grounded in your actual `custom-elements.json`
- **Framework-agnostic** — works with Lit, Stencil, FAST, Spectrum, Shoelace, or any library that produces a Custom Elements Manifest

## Requirements

- VS Code **≥ 1.99.0**
- A component library with a `custom-elements.json` (Custom Elements Manifest)
- Node.js **≥ 20** on `PATH`

## Getting Started

1. Install the extension from the VS Code Marketplace
2. Open your component library folder in VS Code
3. The Helixir MCP server will register automatically with AI assistants that support MCP (e.g., GitHub Copilot, Claude)

### Optional: Configure the Config Path

If your `mcpwc.config.json` is not at the workspace root, set the path via VS Code settings:

```json
// .vscode/settings.json
{
  "helixir.configPath": "packages/web-components/mcpwc.config.json"
}
```

The path can be relative to the workspace root or absolute.

## Commands

| Command                     | Description                                            |
| --------------------------- | ------------------------------------------------------ |
| `Helixir: Run Health Check` | Guides you to run a health check via your AI assistant |

## Extension Settings

| Setting              | Type     | Default | Description                                          |
| -------------------- | -------- | ------- | ---------------------------------------------------- |
| `helixir.configPath` | `string` | `""`    | Path to `mcpwc.config.json`. Empty = workspace root. |

## How It Works

When the extension activates, it registers a **MCP server definition provider** (`helixir`) with VS Code's language model API (`vscode.lm`). VS Code spawns the bundled helixir MCP server (`dist/mcp-server.js`) as a child process over stdio.

The server reads your `custom-elements.json` and exposes 30+ tools that AI models can call to look up component APIs, run health scans, generate type declarations, and more.

## Configuration Reference

The helixir server is configured via environment variables passed by the extension:

| Variable              | Description                                 |
| --------------------- | ------------------------------------------- |
| `MCP_WC_PROJECT_ROOT` | Set to your workspace folder automatically  |
| `MCP_WC_CONFIG_PATH`  | Set when `helixir.configPath` is configured |

Additional configuration (token path, component prefix, health history dir) belongs in `mcpwc.config.json`. See the [helixir documentation](https://github.com/bookedsolidtech/helixir) for the full config reference.

## Troubleshooting

**MCP server not appearing in AI assistant tools**

- Verify VS Code ≥ 1.99.0 is installed
- Confirm your workspace contains a `custom-elements.json`
- Check the Output panel → Helixir for error messages

**"No workspace folder" error from Run Health Check**

- Open a folder (not just a file) in VS Code — the extension uses the workspace folder as the project root

**Server starts but returns no components**

- Ensure `custom-elements.json` exists at the workspace root or configure `helixir.configPath`
- Regenerate the manifest: `npm run analyze:cem` (or your CEM generation script)

## License

MIT — see [LICENSE](../../LICENSE)
