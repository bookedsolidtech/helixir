# wc-mcp + Stencil

This example configures wc-mcp to work with a [Stencil](https://stenciljs.com/) component library.

## Prerequisites

```bash
npm install @stencil/core
```

## How to Generate the CEM File

Stencil generates a Custom Elements Manifest through its `docs-custom-elements-manifest` output target. Add it to your `stencil.config.ts`:

```ts
import { Config } from '@stencil/core';
import { CustomElementsManifestGenerator } from '@stencil/core/compiler';

export const config: Config = {
  namespace: 'my-components',
  outputTargets: [
    {
      type: 'docs-custom-elements-manifest',
      outDir: './dist/custom-elements',
    },
    {
      type: 'dist',
    },
  ],
};
```

Then build your project:

```bash
npx stencil build
```

This produces `dist/custom-elements/custom-elements.json`.

## `mcpwc.config.json`

```json
{
  "cemPath": "dist/custom-elements/custom-elements.json",
  "componentPrefix": "my-"
}
```

Place this file in your Stencil project root alongside `stencil.config.ts`.

## MCP Server Config (Claude Desktop)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wc-mcp": {
      "command": "npx",
      "args": ["wc-mcp"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/path/to/your/stencil-project"
      }
    }
  }
}
```

## Example: Claude Using wc-mcp with Stencil

**Prompt:** "What props does my-button accept and what are the valid values for its `variant` attribute?"

**Claude's response (powered by wc-mcp):**

> The `my-button` component accepts the following props:
>
> - `variant` (`string`, default: `"primary"`) — Button style. Valid values: `"primary"`, `"secondary"`, `"danger"`, `"ghost"`
> - `disabled` (`boolean`, default: `false`) — Disables interaction and applies muted styling
> - `href` (`string | undefined`) — When set, renders the button as an anchor tag
> - `size` (`"sm" | "md" | "lg"`, default: `"md"`) — Controls padding and font size
>
> ```html
> <my-button variant="danger" size="lg">Delete account</my-button>
> ```
