# wc-mcp + FAST (Fluent UI Web Components)

This example configures wc-mcp to work with [FAST Fluent UI](https://www.fast.design/) — Microsoft's web component implementation of the Fluent design system, built on the FAST foundation.

## Prerequisites

```bash
npm install @fluentui/web-components
```

The package ships with a pre-built Custom Elements Manifest at `dist/custom-elements.json`, so no extra analysis step is required.

## How to Generate the CEM File

The CEM is bundled with the package — no extra step needed. After installing, the CEM is available at:

```
node_modules/@fluentui/web-components/dist/custom-elements.json
```

## `mcpwc.config.json`

```json
{
  "cemPath": "node_modules/@fluentui/web-components/dist/custom-elements.json",
  "componentPrefix": "fluent-"
}
```

Place this file in your project root alongside your `package.json`.

## MCP Server Config (Claude Desktop)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wc-mcp": {
      "command": "npx",
      "args": ["wc-mcp"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/path/to/your/fast-project"
      }
    }
  }
}
```

## Example: Claude Using wc-mcp with FAST Fluent UI

**Prompt:** "I need a data grid that supports sorting. Which Fluent UI component should I use and how do I set it up?"

**Claude's response (powered by wc-mcp):**

> Use `fluent-data-grid` with `fluent-data-grid-row` and `fluent-data-grid-cell` for full sorting support:
>
> ```html
> <fluent-data-grid generate-header="sticky" grid-template-columns="1fr 1fr 1fr">
>   <fluent-data-grid-row row-type="header">
>     <fluent-data-grid-cell
>       cell-type="columnheader"
>       sort-direction="ascending"
>       aria-sort="ascending"
>     >
>       Name
>     </fluent-data-grid-cell>
>     <fluent-data-grid-cell cell-type="columnheader">Status</fluent-data-grid-cell>
>     <fluent-data-grid-cell cell-type="columnheader">Date</fluent-data-grid-cell>
>   </fluent-data-grid-row>
> </fluent-data-grid>
> ```
>
> **Key attributes:**
>
> - `generate-header` — `"default"` | `"sticky"` | `"none"` — controls header rendering
> - `grid-template-columns` — CSS grid template for column widths
> - `sort-direction` on header cells — `"ascending"` | `"descending"` | `"none"`
