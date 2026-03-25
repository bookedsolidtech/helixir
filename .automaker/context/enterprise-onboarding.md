# Enterprise Onboarding — HELiXiR

This context file is injected into agent prompts when assisting enterprise teams with HELiXiR setup, configuration, and day-to-day workflows. Reference it when a user asks about installation, configuration, IDE integration, auditing, scaffolding, or theming.

---

## What HELiXiR Does for Enterprise Teams

HELiXiR is an MCP server that gives AI agents full situational awareness of any web component library. It eliminates AI hallucinations by grounding every component suggestion in the actual Custom Elements Manifest (CEM) — the authoritative source of truth for every attribute, event, slot, CSS part, and design token.

**Enterprise value:**
- AI agents read your real component API, not training data guesses
- 30+ MCP tools for component discovery, health scoring, token lookup, TypeScript diagnostics
- Works with any CEM-producing framework: Lit, Stencil, FAST, Spectrum, Shoelace, custom
- Connects to Claude Code, Claude Desktop, Cursor, VS Code (Cline/Continue), Zed

---

## Installation

```bash
npm install helixir
# or
pnpm add helixir
```

Generate a starter config in the component library root:

```bash
npx helixir init
```

This writes `mcpwc.config.json` to the current directory. Edit it to match the library:

```json
{
  "cemPath": "custom-elements.json",
  "projectRoot": "/absolute/path/to/your/component-library",
  "componentPrefix": "hx-",
  "healthHistoryDir": ".mcp-wc/health",
  "tsconfigPath": "tsconfig.json",
  "tokensPath": "dist/tokens/tokens.json"
}
```

**Config priority:** environment variables > `mcpwc.config.json` > defaults.

---

## Configuration Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `cemPath` | `string` | `"custom-elements.json"` | Path to CEM, relative to `projectRoot` |
| `projectRoot` | `string` | `process.cwd()` | Absolute path to the component library |
| `componentPrefix` | `string` | `""` | Tag-name prefix (e.g. `"hx-"`) to scope discovery |
| `healthHistoryDir` | `string` | `".mcp-wc/health"` | Where health snapshots are stored |
| `tsconfigPath` | `string` | `"tsconfig.json"` | Path to tsconfig, relative to `projectRoot` |
| `tokensPath` | `string \| null` | `null` | Design tokens JSON path; `null` disables token tools |
| `cdnBase` | `string \| null` | `null` | CDN base URL for usage snippet generation |
| `watch` | `boolean` | `false` | Auto-reload CEM on file changes |

**Environment variable overrides:**

| Variable | Overrides |
|----------|-----------|
| `MCP_WC_PROJECT_ROOT` | `projectRoot` |
| `MCP_WC_CEM_PATH` | `cemPath` |
| `MCP_WC_COMPONENT_PREFIX` | `componentPrefix` |
| `MCP_WC_HEALTH_HISTORY_DIR` | `healthHistoryDir` |
| `MCP_WC_TSCONFIG_PATH` | `tsconfigPath` |
| `MCP_WC_TOKENS_PATH` | `tokensPath` |
| `MCP_WC_CDN_BASE` | `cdnBase` |

---

## IDE Integration

### Claude Code

Add to `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  }
}
```

Verify: run `:mcp` in Claude Code — `helixir` must appear in the server list.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

### VS Code (Cline)

Add to `.vscode/cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

---

## Running Your First Component Audit

### Single component

```
score_component({ tagName: "hx-button" })
```

Returns: grade (A–F), dimension scores, and issues across 14 quality dimensions.

### Full library audit

```
score_all_components()
get_health_summary()
```

Returns: aggregate stats, grade distribution, top issues across all components.

### Accessibility audit

```
analyze_accessibility({ tagName: "hx-button" })
```

Returns: ARIA roles, keyboard events, focus management, label support.

### Health trend (track over time)

```
get_health_trend({ tagName: "hx-button" })
```

Health snapshots are stored in `healthHistoryDir` and used to compute trend direction.

### Breaking change detection (before a release)

```
check_breaking_changes({ baseBranch: "main" })
```

Scans all components against the base branch CEM and flags removed attributes, changed types, renamed events.

---

## Scaffolding Your First Component

The `scaffold_component` MCP tool generates a new component following Helix patterns:

```
scaffold_component({
  tagName: "hx-my-widget",
  description: "A reusable widget for displaying status information"
})
```

Generates:
- `src/components/hx-my-widget/hx-my-widget.ts` — Lit component source
- `src/components/hx-my-widget/hx-my-widget.stories.ts` — Storybook stories
- `src/components/hx-my-widget/hx-my-widget.test.ts` — Vitest unit tests

After scaffolding, regenerate the CEM:

```bash
npm run analyze  # or: cem analyze --litelement --globs 'src/**/*.ts'
```

Then verify the scaffold was picked up:

```
get_component({ tagName: "hx-my-widget" })
```

---

## Creating Your First Theme

The `create_theme` MCP tool generates a design token theme file:

```
create_theme({
  themeName: "brand-dark",
  baseTokens: {
    "--hx-color-primary": "#1a56db",
    "--hx-color-surface": "#0f172a",
    "--hx-color-text": "#f1f5f9"
  }
})
```

The `apply_theme_tokens` tool patches an existing theme file with updated token values:

```
apply_theme_tokens({
  themeName: "brand-dark",
  tokens: {
    "--hx-color-primary": "#2563eb"
  }
})
```

To discover which components are affected by a token change:

```
find_components_using_token({ tokenName: "--hx-color-primary" })
```

---

## Keeping the CEM Current

The CEM is the source of truth. If it goes stale, HELiXiR's scores and suggestions drift from reality.

**Add to your build pipeline:**

```bash
# package.json
"scripts": {
  "analyze:cem": "cem analyze --litelement --globs 'src/**/*.ts'",
  "build": "npm run analyze:cem && tsc && ..."
}
```

**Enable watch mode for local development:**

```json
{
  "watch": true
}
```

With `watch: true`, HELiXiR monitors the CEM file and reloads automatically — no server restart needed.

---

## CI Integration

Add a health gate to your GitHub Actions pipeline:

```yaml
- name: Run HELiXiR health check
  run: |
    npx helixir score_all_components
  env:
    MCP_WC_PROJECT_ROOT: ${{ github.workspace }}/packages/web-components
```

For automated breaking-change detection on every PR:

```yaml
- name: Check for breaking changes
  run: |
    npx helixir check_breaking_changes --baseBranch main
  env:
    MCP_WC_PROJECT_ROOT: ${{ github.workspace }}/packages/web-components
```

---

## Common Troubleshooting

### "No components found" / empty list_components result

1. Verify `cemPath` is correct: `cat mcpwc.config.json | grep cemPath`
2. Check the CEM file exists: `ls -la custom-elements.json`
3. Verify the CEM has `modules` with `declarations`: `cat custom-elements.json | head -50`
4. If using a monorepo, ensure `projectRoot` is the package directory, not the repo root

### "Server not appearing" in IDE

1. Verify `MCP_WC_PROJECT_ROOT` is an absolute path
2. Confirm `helixir` is installed: `npx helixir --version`
3. Check that `mcpwc.config.json` exists at `projectRoot`
4. Restart the IDE after config changes

### Health scores seem wrong / too high or too low

1. Regenerate the CEM from source: `npm run analyze:cem`
2. Confirm the CEM timestamp matches recent changes: `stat custom-elements.json`
3. Enable `watch: true` if CEM drifts during local development

### Token tools return "tokensPath not configured"

Set `tokensPath` in `mcpwc.config.json` to the absolute or `projectRoot`-relative path of your tokens JSON file:

```json
{
  "tokensPath": "dist/tokens/tokens.json"
}
```

The tokens file must follow W3C DTCG format (or Theo/Style Dictionary compatible JSON).

### scaffold_component generates files in the wrong location

The scaffold uses `projectRoot` as the base. If components live in a subdirectory (e.g. `packages/web-components/src`), set `projectRoot` to that subdirectory, not the monorepo root.

### Breaking change scanner reports false positives

The scanner compares the current working tree CEM against the base branch CEM. If the base branch CEM is stale (checked-in CEM not regenerated after last merge), the diff will be noisy. Ensure CEM generation is part of your CI build step on the base branch.
