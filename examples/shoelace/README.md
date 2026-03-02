# wc-tools + Shoelace

This example configures wc-tools to work with [Shoelace](https://shoelace.style/), the popular web component library with 12k+ GitHub stars.

## Zero-Config (NPM install)

When `@shoelace-style/shoelace` is installed in your project, wc-tools **automatically discovers** the CEM at:

```
node_modules/@shoelace-style/shoelace/dist/custom-elements.json
```

No configuration needed. Just install Shoelace and start your MCP server:

```bash
npm install @shoelace-style/shoelace
npx wc-tools
```

## CDN Mode

If you deploy Shoelace via CDN rather than npm, set `cdnBase` in your config. wc-tools will then produce CDN link/script tags instead of ES module imports when you use the `generate_import` tool.

### `mcpwc.config.json`

```json
{
  "cemPath": "node_modules/@shoelace-style/shoelace/dist/custom-elements.json",
  "componentPrefix": "sl-",
  "cdnBase": "https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2/cdn"
}
```

When `cdnBase` is set, `generate_import` returns:

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2/cdn/themes/light.css"
/>
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2/cdn/shoelace-autoloader.js"
></script>
```

### Environment Variable

You can also set `cdnBase` via environment variable:

```bash
MCP_WC_CDN_BASE="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2/cdn" npx wc-tools
```

## sl-icon and Bootstrap Icons

Shoelace's `sl-icon` component provides access to 1500+ [Bootstrap Icons](https://icons.getbootstrap.com/). When you use `suggest_usage` on `sl-icon`, wc-tools includes a note explaining the `name` attribute and links to the icon browser.

```html
<sl-icon name="heart"></sl-icon>
<sl-icon name="star-fill"></sl-icon>
<sl-icon name="arrow-right-circle"></sl-icon>
```

Browse all available icons at https://icons.getbootstrap.com/.

## MCP Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "npx",
      "args": ["wc-tools"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/path/to/your/shoelace-project"
      }
    }
  }
}
```
