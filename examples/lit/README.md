# wc-mcp + Lit

This example configures wc-mcp to work with a [Lit](https://lit.dev/) component library.

Unlike Shoelace, Lit itself does not ship a pre-built Custom Elements Manifest. You must run the CEM analyzer against your source files before starting wc-mcp.

## Prerequisites

```bash
npm install lit
npm install --save-dev @custom-elements-manifest/analyzer
```

## How to Generate the CEM File

Run the CEM analyzer in your project root:

```bash
npx cem analyze --globs "src/**/*.ts"
```

This produces `custom-elements.json` in your project root. Add a script to `package.json` so you can regenerate it easily:

```json
{
  "scripts": {
    "analyze": "cem analyze --globs \"src/**/*.ts\""
  }
}
```

### Optional: CEM Analyzer Config (`custom-elements-manifest.config.mjs`)

```js
export default {
  globs: ['src/**/*.ts'],
  exclude: ['**/*.test.ts', '**/*.stories.ts'],
  outdir: '.',
  dev: false,
};
```

## `mcpwc.config.json`

```json
{
  "cemPath": "custom-elements.json",
  "componentPrefix": "my-"
}
```

Place this file in your Lit project root. Change `componentPrefix` to match your component tag prefix (e.g., `"app-"`, `"ds-"`).

## MCP Server Config (Claude Desktop)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wc-mcp": {
      "command": "npx",
      "args": ["wc-mcp"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/path/to/your/lit-project"
      }
    }
  }
}
```

## Example: Claude Using wc-mcp with Lit

**Prompt:** "Show me how to use my-card component with a header slot and action buttons."

**Claude's response (powered by wc-mcp):**

> The `my-card` component uses named slots for composing content. Here's a complete example:
>
> ```html
> <my-card elevation="2">
>   <span slot="header">Payment Summary</span>
>   <p>Your order total is $42.00.</p>
>   <div slot="actions">
>     <button>Cancel</button>
>     <button variant="primary">Confirm</button>
>   </div>
> </my-card>
> ```
>
> **Available slots:**
>
> - `header` — Card title area (renders in the top bar)
> - _(default)_ — Card body content
> - `actions` — Footer action area (right-aligned)
>
> **Properties:**
>
> - `elevation` (`0 | 1 | 2 | 3`, default: `1`) — Drop shadow depth
> - `outlined` (`boolean`, default: `false`) — Adds a border instead of a shadow
