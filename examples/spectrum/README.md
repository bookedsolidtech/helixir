# wc-tools + Adobe Spectrum Web Components

This example configures wc-tools to work with [Adobe Spectrum Web Components](https://opensource.adobe.com/spectrum-web-components/) — Adobe's design system implementation as web components.

Spectrum is a **multi-package monorepo** where each component is published separately (e.g., `@spectrum-web-components/button`, `@spectrum-web-components/dialog`). The `@spectrum-web-components/bundle` package re-exports everything and ships a combined CEM file, making it the easiest starting point.

## Prerequisites

**Option A — Full bundle (recommended for getting started):**

```bash
npm install @spectrum-web-components/bundle
```

**Option B — Individual packages (production, tree-shakeable):**

```bash
npm install @spectrum-web-components/button \
            @spectrum-web-components/dialog \
            @spectrum-web-components/textfield \
            @spectrum-web-components/theme
```

For Option B, point `cemPath` at one of the individually installed packages (e.g., `node_modules/@spectrum-web-components/button/custom-elements.json`).

## How to Generate the CEM File

Spectrum ships pre-built CEM files — no generation step required. After installing the bundle:

```
node_modules/@spectrum-web-components/bundle/custom-elements.json
```

This single file covers all components in the bundle.

## `mcpwc.config.json`

```json
{
  "cemPath": "node_modules/@spectrum-web-components/bundle/custom-elements.json",
  "componentPrefix": "sp-"
}
```

Place this file in your project root alongside `package.json`.

### Individual-Package Variant

If using separate packages without the bundle, point to the package that matters most for your current work:

```json
{
  "cemPath": "node_modules/@spectrum-web-components/button/custom-elements.json",
  "componentPrefix": "sp-"
}
```

## MCP Server Config (Claude Desktop)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/path/to/your/spectrum-project"
      }
    }
  }
}
```

## Example: Claude Using wc-tools with Spectrum

**Prompt:** "How do I build an accessible modal dialog with Spectrum Web Components?"

**Claude's response (powered by wc-tools):**

> Use `sp-dialog-wrapper` (handles the overlay + dismiss behavior) or the lower-level `sp-dialog` inside `sp-overlay`:
>
> ```html
> <sp-theme system="spectrum" color="light" scale="medium">
>   <sp-dialog-wrapper headline="Confirm deletion" dismissable underlay open>
>     <p>This action cannot be undone. Are you sure?</p>
>     <sp-button
>       slot="button"
>       variant="negative"
>       onclick="this.closest('sp-dialog-wrapper').open = false"
>     >
>       Delete
>     </sp-button>
>     <sp-button
>       slot="button"
>       variant="secondary"
>       treatment="outline"
>       onclick="this.closest('sp-dialog-wrapper').open = false"
>     >
>       Cancel
>     </sp-button>
>   </sp-dialog-wrapper>
> </sp-theme>
> ```
>
> **Notes:**
>
> - Always wrap Spectrum components in `sp-theme` to apply the design tokens
> - `dismissable` adds the × close button; `underlay` adds the backdrop
> - Buttons in the `button` slot are placed in the dialog footer
