# IDE Integration Guide — wc-tools

> Complete setup guide for every supported IDE and MCP client. This document is standalone — no need to read the README first.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Claude Code (CLI)](#1-claude-code-cli)
3. [Claude Desktop](#2-claude-desktop)
4. [Cursor](#3-cursor)
5. [VS Code + Cline](#4-vs-code--cline)
6. [VS Code + Continue](#5-vs-code--continue)
7. [Zed](#6-zed)
8. [Local Development Setup](#local-development-setup)
9. [Multi-project Setup](#multi-project-setup)
10. [Configuration Reference](#configuration-reference)
11. [Framework-specific Notes](#framework-specific-notes)
12. [Troubleshooting FAQ](#troubleshooting-faq)

---

## Quick Start

**Fastest path from zero to a component-aware AI agent (under 2 minutes).**

### Step 1 — Generate a config file

Run the interactive wizard inside your component library project:

```bash
cd /path/to/your/component-library
npx wc-tools init
```

The wizard:

- Detects your framework (Lit, Stencil, Shoelace, FAST, etc.)
- Auto-discovers your `custom-elements.json` (CEM)
- Asks about a design tokens file
- Writes `mcpwc.config.json` to your project root

The resulting `mcpwc.config.json` looks like:

```json
{
  "cemPath": "custom-elements.json",
  "projectRoot": "/absolute/path/to/your/component-library",
  "componentPrefix": "",
  "healthHistoryDir": ".mcp-wc/health",
  "tsconfigPath": "tsconfig.json",
  "tokensPath": null
}
```

### Step 2 — Add to your IDE

Pick your editor from the sections below. At minimum you need:

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  }
}
```

### Step 3 — Verify

Ask your AI agent: **"List the components available in wc-tools."**

If it responds with a real component list from your library, everything is working.

---

## 1. Claude Code (CLI)

Claude Code reads MCP server configuration from `.mcp.json` (project-scoped) or `~/.claude.json` (global).

### Config file location

| Scope   | Path                                      |
| ------- | ----------------------------------------- |
| Project | `<your-project>/.mcp.json`                |
| Global  | `~/.claude.json` (under `mcpServers` key) |

### Option A — npx (recommended, no install required)

**`<your-project>/.mcp.json`:**

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  }
}
```

> **Note:** `npx` downloads wc-tools on first use and caches it. Subsequent starts are fast.

### Option B — Global install

```bash
npm install -g wc-tools
```

Then in `.mcp.json`:

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "wc-tools",
      "args": [],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  }
}
```

### Verifying it works

After saving `.mcp.json`, type `/mcp` in Claude Code. You should see `wc-tools` listed as a connected server with a green status indicator.

Then try: `list_components` — Claude should return the component list from your library.

### Common pitfalls

- **Absolute paths only** — `MCP_WC_PROJECT_ROOT` must be an absolute path. `~` is not expanded.
- **JSON must be valid** — A trailing comma or comment in `.mcp.json` will silently prevent the server from loading.
- **npx version lag** — If npx serves a cached old version, run `npm cache clean --force` or pin to a version: `"args": ["wc-tools@0.1.0"]`.
- **Reload required** — Claude Code does not hot-reload `.mcp.json`. Restart or use `/mcp reload` after changes.

---

## 2. Claude Desktop

Claude Desktop uses a single JSON config file. Edit it, save, and restart the app.

### Config file location

| Platform | Path                                                              |
| -------- | ----------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows  | `%APPDATA%\Claude\claude_desktop_config.json`                     |
| Linux    | `~/.config/Claude/claude_desktop_config.json`                     |

### Configuration

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  }
}
```

**macOS example with real path:**

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/Users/yourname/projects/my-design-system"
      }
    }
  }
}
```

**Windows example:**

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "C:\\Users\\yourname\\projects\\my-design-system"
      }
    }
  }
}
```

> **Windows note:** Use double backslashes (`\\`) in JSON strings, or use forward slashes (`/`) — both work on Windows.

### Platform-specific notes

**macOS:** If `npx` is not found, Claude Desktop may not inherit your shell's PATH. Fix by using the full path:

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "/usr/local/bin/npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/Users/yourname/projects/my-design-system"
      }
    }
  }
}
```

Find the full path with: `which npx`

**Windows:** Use the `.cmd` wrapper for npx to avoid PATH issues:

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx.cmd",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "C:\\Users\\yourname\\projects\\my-design-system"
      }
    }
  }
}
```

### Verifying it works

1. Restart Claude Desktop after saving the config.
2. Start a new conversation.
3. Click the hammer/tools icon — you should see "wc-tools" listed.
4. Ask: **"What components are available?"** — Claude will call `list_components` automatically.

### Common pitfalls

- **Must restart** — Claude Desktop does not hot-reload config. Always restart after edits.
- **Tilde not expanded** — Use absolute paths, not `~/projects/...`.
- **File must be valid JSON** — Use a JSON validator if the server doesn't appear after restart.
- **Node.js version** — wc-tools requires Node.js 20+. Check with `node --version`.

---

## 3. Cursor

Cursor supports MCP via `.cursor/mcp.json` (project-scoped) or `~/.cursor/mcp.json` (global/user-scoped).

### Config file location

| Scope   | Path                              |
| ------- | --------------------------------- |
| Project | `<your-project>/.cursor/mcp.json` |
| Global  | `~/.cursor/mcp.json`              |

### Configuration

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

> **Workspace variable:** `${workspaceFolder}` is expanded to the workspace root at runtime. Use this if your component library is in the same repo you have open in Cursor. For an external library, use an absolute path instead.

### External library example

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  }
}
```

### With design tokens

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "${workspaceFolder}",
        "MCP_WC_TOKENS_PATH": "${workspaceFolder}/dist/tokens/tokens.json"
      }
    }
  }
}
```

### Verifying it works

1. Open Cursor Settings → Features → MCP.
2. You should see `wc-tools` listed with a green dot (connected).
3. Open the Composer (`Cmd+I` / `Ctrl+I`) and ask: **"List available components."**

### Common pitfalls

- **`${workspaceFolder}` only works in project config** — In `~/.cursor/mcp.json`, the variable may not expand. Use absolute paths in the global config.
- **Create the `.cursor/` folder** if it doesn't exist: `mkdir -p .cursor`
- **Reload required after config change** — Use the MCP settings panel to disconnect/reconnect, or restart Cursor.

---

## 4. VS Code + Cline

Cline is a VS Code extension that reads MCP config from `.vscode/cline_mcp_settings.json` in your workspace.

### Config file location

```
<your-project>/.vscode/cline_mcp_settings.json
```

### Configuration

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

### External library example

If your component library lives outside the current workspace:

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  }
}
```

### With component prefix filtering

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "${workspaceFolder}",
        "MCP_WC_COMPONENT_PREFIX": "sl-"
      }
    }
  }
}
```

### Verifying it works

1. Open the Cline sidebar in VS Code.
2. Click the MCP servers icon — `wc-tools` should appear as connected.
3. Start a chat and ask: **"Use wc-tools to get information about sl-button."**

### Common pitfalls

- **Create `.vscode/`** if it doesn't exist: `mkdir -p .vscode`
- **Cline must be installed** — Install the "Cline" extension from the VS Code marketplace first.
- **`${workspaceFolder}` support** — Check your Cline version; older releases may not expand workspace variables. Use absolute paths if uncertain.
- **Conflicting MCP configs** — If you also have a global Cline config, project-level config takes precedence.

---

## 5. VS Code + Continue

Continue is a VS Code (and JetBrains) extension that reads MCP servers from `~/.continue/config.json`.

### Config file location

```
~/.continue/config.json
```

> This is a **global** config. Changes affect all workspaces.

### Configuration

Add a `mcpServers` array to your existing `~/.continue/config.json`:

```json
{
  "models": [],
  "mcpServers": [
    {
      "name": "wc-tools",
      "command": "npx wc-tools",
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  ]
}
```

> **Note:** Continue uses a slightly different format — `command` is a single string (not split into `command` + `args` array), and `name` replaces the outer key.

### Multiple libraries

```json
{
  "mcpServers": [
    {
      "name": "wc-tools-shoelace",
      "command": "npx wc-tools",
      "env": {
        "MCP_WC_PROJECT_ROOT": "/Users/yourname/projects/shoelace"
      }
    },
    {
      "name": "wc-tools-spectrum",
      "command": "npx wc-tools",
      "env": {
        "MCP_WC_PROJECT_ROOT": "/Users/yourname/projects/spectrum-web-components"
      }
    }
  ]
}
```

### Verifying it works

1. Reload VS Code after editing `~/.continue/config.json`.
2. Open the Continue sidebar and click the "@" context provider icon.
3. You should see `wc-tools` listed under MCP tools.
4. In a chat, type `@wc-tools` to trigger context injection.

### Common pitfalls

- **File might not exist** — Create it with `mkdir -p ~/.continue && echo '{"models":[],"mcpServers":[]}' > ~/.continue/config.json`.
- **Reload required** — VS Code must be reloaded after changing `~/.continue/config.json`. Use `Cmd+Shift+P` → "Reload Window".
- **String command format** — Unlike other clients, Continue uses `"command": "npx wc-tools"` (a single string), not an array.
- **Continue version** — MCP support requires Continue v0.8.0+. Check **Extensions** → **Continue** for the installed version.

---

## 6. Zed

Zed reads MCP context servers from `~/.config/zed/settings.json` under the `context_servers` key.

### Config file location

```
~/.config/zed/settings.json
```

### Configuration

Add a `context_servers` block to your existing `settings.json`:

```json
{
  "context_servers": {
    "wc-tools": {
      "command": {
        "path": "npx",
        "args": ["wc-tools"],
        "env": {
          "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
        }
      }
    }
  }
}
```

### macOS example

```json
{
  "context_servers": {
    "wc-tools": {
      "command": {
        "path": "npx",
        "args": ["wc-tools"],
        "env": {
          "MCP_WC_PROJECT_ROOT": "/Users/yourname/projects/my-design-system",
          "MCP_WC_COMPONENT_PREFIX": "my-"
        }
      }
    }
  }
}
```

### With full path to npx (if PATH issues)

```json
{
  "context_servers": {
    "wc-tools": {
      "command": {
        "path": "/usr/local/bin/npx",
        "args": ["wc-tools"],
        "env": {
          "MCP_WC_PROJECT_ROOT": "/Users/yourname/projects/my-design-system"
        }
      }
    }
  }
}
```

Find the path: `which npx`

### Verifying it works

1. Save `settings.json` — Zed reloads context servers automatically.
2. Open the Assistant panel (`Cmd+?` or the chat icon).
3. The context server list shows `wc-tools` with a connected indicator.
4. Start a message with `/` to browse available tools, or ask: **"What components are in my library?"**

### Common pitfalls

- **Zed's `command.path`** — Zed uses nested `command.path` + `command.args`, not a flat `command` string. This is different from other clients.
- **PATH not inherited** — Zed may not inherit your shell PATH. Use `which npx` to get the full path and use that in `command.path`.
- **Settings file must remain valid JSON** — Zed will not start context servers if `settings.json` has syntax errors.
- **Zed version** — Context servers require Zed 0.140+. Check Zed → About Zed.

---

## Local Development Setup

For contributors working on wc-tools itself, or for using a local build instead of the npm version.

### Clone and build

```bash
git clone https://github.com/bookedsolidtech/wc-tools.git
cd wc-tools
pnpm install
pnpm build
```

The build output lands in `build/`:

```
build/
  src/
    index.js        ← MCP server entry point
    cli/index.js    ← CLI entry point
```

### Point your IDE at the local build

Replace the `npx wc-tools` command with `node /path/to/build/src/index.js`:

**Claude Code `.mcp.json`:**

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "node",
      "args": ["/absolute/path/to/wc-tools/build/src/index.js"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  }
}
```

**Claude Desktop `claude_desktop_config.json`:**

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "node",
      "args": ["/Users/yourname/code/wc-tools/build/src/index.js"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/Users/yourname/projects/my-design-system"
      }
    }
  }
}
```

### Rebuild on changes

```bash
pnpm build
```

Then reload your IDE's MCP connection to pick up the new build.

### Running tests

```bash
pnpm test
```

### Verifying the build

```bash
node build/src/index.js --help
# or: pnpm build && echo "Build OK"
```

---

## Multi-project Setup

You can run multiple instances of wc-tools — one per component library — each with a different name and `MCP_WC_PROJECT_ROOT`.

### Claude Desktop — two libraries

```json
{
  "mcpServers": {
    "wc-tools-shoelace": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/Users/yourname/projects/shoelace",
        "MCP_WC_COMPONENT_PREFIX": "sl-"
      }
    },
    "wc-tools-my-lib": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/Users/yourname/projects/my-design-system",
        "MCP_WC_COMPONENT_PREFIX": "ds-"
      }
    }
  }
}
```

### Cursor — switching between libraries

Use a project-scoped `.cursor/mcp.json` in each library's repo:

**`/projects/shoelace/.cursor/mcp.json`:**

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "${workspaceFolder}",
        "MCP_WC_COMPONENT_PREFIX": "sl-"
      }
    }
  }
}
```

When you open a different repo in Cursor, it automatically uses that repo's `.cursor/mcp.json`.

### Tips for multi-project setups

- **Use descriptive server names** — `wc-tools-shoelace` is better than `wc-tools-1` when you see tool calls in the UI.
- **Component prefixes reduce confusion** — Set `MCP_WC_COMPONENT_PREFIX` per library so `list_components` returns only that library's components.
- **Design tokens per library** — Set `MCP_WC_TOKENS_PATH` independently per server instance.

---

## Configuration Reference

### `mcpwc.config.json`

Place this file in your component library project root (wherever `MCP_WC_PROJECT_ROOT` points).

Config is resolved in priority order: **environment variables > `mcpwc.config.json` > built-in defaults**.

| Key                | Type             | Default                  | Description                                                                                  |
| ------------------ | ---------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| `cemPath`          | `string`         | `"custom-elements.json"` | Path to the Custom Elements Manifest, relative to `projectRoot`. Auto-discovered if omitted. |
| `projectRoot`      | `string`         | `process.cwd()`          | Absolute path to the component library root.                                                 |
| `componentPrefix`  | `string`         | `""`                     | Tag-name prefix to scope component discovery (e.g. `"sl-"`).                                 |
| `healthHistoryDir` | `string`         | `".mcp-wc/health"`       | Directory for health snapshots, relative to `projectRoot`.                                   |
| `tsconfigPath`     | `string`         | `"tsconfig.json"`        | Path to `tsconfig.json`, relative to `projectRoot`.                                          |
| `tokensPath`       | `string \| null` | `null`                   | Path to a design tokens JSON file. `null` disables token tools.                              |
| `cdnBase`          | `string \| null` | `null`                   | Base URL for CDN import snippets in `suggest_usage` output.                                  |
| `cdnAutoloader`    | `string \| null` | `null`                   | CDN URL for the library's autoloader script.                                                 |
| `cdnStylesheet`    | `string \| null` | `null`                   | CDN URL for the library's CSS stylesheet.                                                    |
| `watch`            | `boolean`        | `false`                  | Auto-reload CEM on file changes.                                                             |

**Complete example:**

```json
{
  "cemPath": "dist/custom-elements.json",
  "projectRoot": "/home/user/my-design-system",
  "componentPrefix": "ds-",
  "healthHistoryDir": ".mcp-wc/health",
  "tsconfigPath": "tsconfig.build.json",
  "tokensPath": "dist/tokens/tokens.json",
  "cdnBase": "https://cdn.example.com/ds",
  "cdnAutoloader": null,
  "cdnStylesheet": null,
  "watch": false
}
```

### Environment variables

Set these in the `env` block of your MCP server config, or in your shell. They override the config file.

| Variable                    | Overrides          | Example value                              |
| --------------------------- | ------------------ | ------------------------------------------ |
| `MCP_WC_PROJECT_ROOT`       | `projectRoot`      | `/Users/name/projects/my-lib`              |
| `MCP_WC_CEM_PATH`           | `cemPath`          | `dist/custom-elements.json`                |
| `MCP_WC_COMPONENT_PREFIX`   | `componentPrefix`  | `sl-`                                      |
| `MCP_WC_HEALTH_HISTORY_DIR` | `healthHistoryDir` | `.mcp-wc/health`                           |
| `MCP_WC_TSCONFIG_PATH`      | `tsconfigPath`     | `tsconfig.build.json`                      |
| `MCP_WC_TOKENS_PATH`        | `tokensPath`       | `dist/tokens/tokens.json`                  |
| `MCP_WC_CDN_BASE`           | `cdnBase`          | `https://cdn.example.com`                  |
| `MCP_WC_CDN_AUTOLOADER`     | `cdnAutoloader`    | `https://cdn.example.com/autoloader.js`    |
| `MCP_WC_CDN_STYLESHEET`     | `cdnStylesheet`    | `https://cdn.example.com/themes/light.css` |

**Disabling an optional feature via env var:**

Set the value to the string `"null"` to explicitly disable it:

```json
{
  "env": {
    "MCP_WC_TOKENS_PATH": "null"
  }
}
```

---

## Framework-specific Notes

### Shoelace

Shoelace ships `custom-elements.json` inside its npm package — no build step needed.

```json
{
  "cemPath": "node_modules/@shoelace-style/shoelace/dist/custom-elements.json",
  "componentPrefix": "sl-",
  "cdnBase": "https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2/cdn"
}
```

**Tip:** Set `componentPrefix: "sl-"` to avoid loading unrelated components if your project has multiple CEM sources.

### Lit

Generate the CEM with the official analyzer:

```bash
npm install -D @custom-elements-manifest/analyzer
```

Add to `package.json`:

```json
{
  "scripts": {
    "analyze": "cem analyze --litelement --globs 'src/**/*.ts'"
  }
}
```

Run `npm run analyze` after each build, then configure:

```json
{
  "cemPath": "custom-elements.json",
  "componentPrefix": "my-"
}
```

**Watch mode tip:** Set `"watch": true` in `mcpwc.config.json` so wc-tools reloads the CEM automatically when `npm run analyze` regenerates it.

### Stencil

Enable the custom elements output target in `stencil.config.ts`:

```ts
export const config: Config = {
  outputTargets: [{ type: 'dist-custom-elements' }, { type: 'docs-custom' }],
};
```

Stencil emits `custom-elements.json` to `dist/custom-elements/`:

```json
{
  "cemPath": "dist/custom-elements/custom-elements.json",
  "componentPrefix": "my-"
}
```

### FAST

Use the CEM analyzer with FAST:

```bash
npm install -D @custom-elements-manifest/analyzer
```

```json
{
  "scripts": {
    "analyze": "cem analyze --globs 'src/**/*.ts'"
  }
}
```

```json
{
  "cemPath": "custom-elements.json",
  "componentPrefix": "fluent-"
}
```

**Note:** FAST's `@microsoft/fast-element` decorator syntax is well-supported by the analyzer.

### Shoelace (CDN-loaded)

If you use Shoelace via CDN rather than npm install, use `resolve_cdn_cem` to fetch the CEM:

Ask Claude: **"Use resolve_cdn_cem to load @shoelace-style/shoelace@2"**

This fetches and caches the CEM from jsDelivr. No local file needed.

### Adobe Spectrum Web Components

Spectrum ships CEM in its package:

```bash
npm install @spectrum-web-components/bundle
```

```json
{
  "cemPath": "node_modules/@spectrum-web-components/bundle/custom-elements.json",
  "componentPrefix": "sp-"
}
```

### Polymer / Generic Projects

Any project can add CEM generation:

```bash
npm install -D @custom-elements-manifest/analyzer
```

```json
{
  "scripts": {
    "analyze": "cem analyze --globs 'src/**/*.js'"
  }
}
```

```json
{
  "cemPath": "custom-elements.json"
}
```

---

## Troubleshooting FAQ

### 1. The MCP server doesn't appear in my IDE

**Symptoms:** No `wc-tools` in the tool list; no MCP connection.

**Causes and fixes:**

- **Invalid JSON** in your config file — Run through a JSON validator (e.g. `node -e "JSON.parse(require('fs').readFileSync('.mcp.json','utf8'))"`) to catch syntax errors.
- **Node.js not found** — Claude Desktop and some IDEs don't inherit shell PATH. Use the full path to `npx` (find it with `which npx`).
- **Node.js version too old** — wc-tools requires Node.js 20+. Check with `node --version`.
- **Restart required** — Most IDEs require a full restart (not just reload) after config changes.

---

### 2. `Error: CEM file not found`

**Symptoms:** Server starts but tools return "CEM file not found" errors.

**Causes and fixes:**

- `MCP_WC_PROJECT_ROOT` points to the wrong directory. It should be the root of your component library, where `custom-elements.json` lives.
- The CEM hasn't been generated yet. Run your build: `npm run build` or `npm run analyze`.
- `cemPath` in `mcpwc.config.json` is wrong — check the path is relative to `projectRoot`.

**Diagnostic:** Run `ls $MCP_WC_PROJECT_ROOT` to confirm the directory exists and contains your CEM file.

---

### 3. `npx` is slow on first use

**Symptoms:** The server takes 10–30 seconds to start the first time.

**Explanation:** `npx` downloads the package if it's not cached. Subsequent starts are instant.

**Fix:** Install globally once to avoid the download delay:

```bash
npm install -g wc-tools
```

Then change `"command": "npx"` to `"command": "wc-tools"` in your config.

---

### 4. Tools return empty results

**Symptoms:** `list_components` returns `[]` or tools say "no components found."

**Causes and fixes:**

- **Wrong `componentPrefix`** — If `componentPrefix: "sl-"` is set but your components use a different prefix, nothing matches. Set it to `""` to see all components.
- **CEM is empty** — Check `custom-elements.json` with `node -e "const c=require('./custom-elements.json'); console.log(c.modules?.length)"`. If it's 0, your build didn't generate components.
- **`projectRoot` mismatch** — The server is reading a CEM from a different directory than expected.

---

### 5. Design token tools not working

**Symptoms:** `get_design_tokens` returns an error or says tokens are disabled.

**Causes and fixes:**

- `tokensPath` is `null` (the default) — Set it to your tokens file path in `mcpwc.config.json` or via `MCP_WC_TOKENS_PATH`.
- The path is wrong — Must be relative to `projectRoot`. Run `ls $MCP_WC_PROJECT_ROOT/dist/tokens/tokens.json` to verify.
- File format is not supported — Tokens must be in W3C Design Tokens format or a flat key/value JSON.

---

### 6. Health commands fail with git errors

**Symptoms:** `get_health_diff` or `diff_cem` fail with git errors.

**Causes and fixes:**

- `projectRoot` must be inside a git repository for diff-based tools.
- The base branch (`main` by default) must exist. Check with `git branch -a` in the project root.
- Pass `--base` to specify a different branch: the `baseBranch` argument in `diff_cem`.

---

### 7. `MCP_WC_PROJECT_ROOT` with spaces in path

**Symptoms:** Path truncated or server fails to start.

**Fix:** Ensure the path is properly quoted in JSON. JSON strings handle spaces natively:

```json
{
  "env": {
    "MCP_WC_PROJECT_ROOT": "/Users/Jane Smith/projects/my-lib"
  }
}
```

This is valid JSON and works correctly. The space issue only occurs in shell contexts.

---

### 8. Server starts but Claude doesn't call wc-tools tools

**Symptoms:** The server appears connected, but Claude never calls `list_components` or other tools.

**Fix:** Be more explicit in your prompt:

- Instead of: "What components are available?"
- Try: "Use the wc-tools MCP server to list all components."

Or ask directly: "Call the `list_components` tool and show me the result."

Once Claude uses the tool successfully once, it learns to use it proactively.

---

### Getting more debug output

Set the `DEBUG` environment variable to get verbose logging from wc-tools:

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/path/to/your/library",
        "DEBUG": "wc-tools:*"
      }
    }
  }
}
```

Check your IDE's MCP server logs for the output. In Claude Desktop, logs are at:

- **macOS:** `~/Library/Logs/Claude/mcp-server-wc-tools.log`
- **Windows:** `%APPDATA%\Claude\logs\mcp-server-wc-tools.log`

---

## Quick Reference

| IDE                | Config file                                                               | Restart needed?          | Workspace var?       |
| ------------------ | ------------------------------------------------------------------------- | ------------------------ | -------------------- |
| Claude Code        | `.mcp.json`                                                               | `/mcp reload`            | No                   |
| Claude Desktop     | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) | Yes                      | No                   |
| Cursor             | `.cursor/mcp.json`                                                        | Settings panel reconnect | `${workspaceFolder}` |
| VS Code + Cline    | `.vscode/cline_mcp_settings.json`                                         | Cline panel reconnect    | `${workspaceFolder}` |
| VS Code + Continue | `~/.continue/config.json`                                                 | Window reload            | No                   |
| Zed                | `~/.config/zed/settings.json`                                             | Auto                     | No                   |
