# @helixui/mcp

Standalone SDK for building custom MCP (Model Context Protocol) tools on top of **helixir**'s web component analysis engine.

Enterprise teams install this package to programmatically access helixir's core analysis engine — CEM parsing, design token handling, code generation, and more — without coupling to helixir's own MCP server internals.

## Requirements

- Node.js >= 20
- `helixir` >= 0.5.0 (peer dependency)
- `@modelcontextprotocol/sdk` >= 1.26.0 (peer dependency)
- `zod` >= 3.22.0 (peer dependency)

## Installation

```bash
npm install helixir @helixui/mcp
# or
pnpm add helixir @helixui/mcp
```

## API Overview

`@helixui/mcp` exports three core engine modules plus config and error utilities:

| Module              | Description                                                                     |
| ------------------- | ------------------------------------------------------------------------------- |
| **CEM Reader**      | Parse Custom Elements Manifests, query components, events, slots, and CSS parts |
| **Token Parser**    | Parse W3C DTCG design token files and query token usage across components       |
| **Template Engine** | Generate framework-specific usage snippets (React, Vue, Svelte, Angular, HTML)  |
| **Config**          | Load helixir configuration from env vars and config files                       |
| **Error Utilities** | Structured error handling primitives for MCP tool implementations               |

---

## CEM Reader

Parse and query [Custom Elements Manifest](https://custom-elements-manifest.open-wc.org/) documents.

### Parse a CEM file

```typescript
import { CemSchema, listAllComponents, parseCem } from '@helixui/mcp';
import { readFileSync } from 'fs';

// Load and validate the CEM
const raw = JSON.parse(readFileSync('custom-elements.json', 'utf-8'));
const cem = CemSchema.parse(raw); // throws ZodError if the file is malformed

// List all component tag names
const tags = listAllComponents(cem);
// ['my-button', 'my-input', 'my-dialog', ...]

// Get detailed metadata for a specific component
const meta = parseCem('my-button', cem);
console.log(meta.attributes); // array of attribute descriptors
console.log(meta.events); // array of custom event descriptors
console.log(meta.slots); // array of slot descriptors
console.log(meta.cssParts); // array of CSS ::part() descriptors
console.log(meta.cssProperties); // array of CSS custom property descriptors
```

### Check documentation completeness

```typescript
import { validateCompleteness } from '@helixui/mcp';

const result = validateCompleteness('my-button', cem);
console.log(result.score); // 0–100
console.log(result.missing); // ['description', 'cssProperties', ...]
```

### Query across all components

```typescript
import { listAllEvents, listAllSlots, listAllCssParts } from '@helixui/mcp';

// All events (or filter to a specific tag)
const events = listAllEvents(cem);
const buttonEvents = listAllEvents(cem, 'my-button');

// All slots
const slots = listAllSlots(cem);

// All CSS ::part() selectors
const parts = listAllCssParts(cem);
```

### Merge multiple CEM packages

```typescript
import { mergeCems, CemSchema } from '@helixui/mcp';

const merged = mergeCems([
  { packageName: '@my-lib/core', cem: coreCem },
  { packageName: '@my-lib/charts', cem: chartsCem },
]);
const allTags = listAllComponents(merged);
```

---

## Token Parser

Parse [W3C DTCG](https://tr.designtokens.org/format/) design token files.

### Parse a token file

```typescript
import { parseTokens } from '@helixui/mcp';

const tokens = await parseTokens('./tokens/tokens.json');
// [
//   { name: 'color.primary', value: '#0066cc', category: 'color', description: '...' },
//   { name: 'spacing.medium', value: '16px', category: 'spacing', description: '...' },
//   ...
// ]

const colorTokens = tokens.filter((t) => t.category === 'color');
```

### Find components using a token

```typescript
import { findComponentsUsingToken } from '@helixui/mcp';

const result = findComponentsUsingToken(cem, '--color-primary');
console.log(result); // { tokenName: '--color-primary', components: [...] }
```

### Load tokens via config

```typescript
import { loadConfig, getDesignTokens, findToken } from '@helixui/mcp';

const config = loadConfig(); // reads helixir.mcp.json or env vars
const tokens = await getDesignTokens(config);

// Search by name, value, or description
const matches = await findToken(config, 'primary');
```

---

## Template Engine

Generate framework-specific usage snippets for any component.

### Generate a usage snippet

```typescript
import { loadConfig, suggestUsage } from '@helixui/mcp';

const config = loadConfig();

// Auto-detect framework from package.json, or specify explicitly
const result = await suggestUsage(config, 'my-button', 'react');

console.log(result.snippet);
// function MyComponent() {
//   return (
//     <my-button
//       variant="primary"
//     >
//       {/* default slot */}
//     </my-button>
//   );
// }

console.log(result.eventListeners); // event binding examples
console.log(result.styling.tokens); // CSS custom properties to customize
console.log(result.styling.parts); // ::part() selectors available
```

### Supported frameworks

```typescript
import type { FrontendFramework } from '@helixui/mcp';

// 'react' | 'vue' | 'svelte' | 'angular' | 'html'
const framework: FrontendFramework = 'vue';
const result = await suggestUsage(config, 'my-dialog', framework);
```

### Generate import statements

```typescript
import { generateImport } from '@helixui/mcp';

const result = await generateImport(config, 'my-button');
console.log(result.importStatement); // "import '@my-lib/my-button';"
console.log(result.cdnTag); // optional CDN <script> tag
```

---

## Configuration

```typescript
import { loadConfig } from '@helixui/mcp';
import type { McpWcConfig } from '@helixui/mcp';

// Load from helixir.mcp.json + environment variables
const config: McpWcConfig = loadConfig();

// Key configuration fields:
// config.cemPath         — path to custom-elements.json
// config.projectRoot     — root of the component library
// config.componentPrefix — expected tag name prefix (e.g. 'hx-')
// config.tokensPath      — path to design tokens JSON
// config.cdnBase         — CDN base URL for component imports
```

### Environment variables

| Variable                  | Description                         |
| ------------------------- | ----------------------------------- |
| `MCP_WC_PROJECT_ROOT`     | Override the project root directory |
| `MCP_WC_CEM_PATH`         | Override the CEM file path          |
| `MCP_WC_COMPONENT_PREFIX` | Set the expected tag name prefix    |
| `MCP_WC_TOKENS_PATH`      | Override the design token file path |
| `MCP_WC_CDN_BASE`         | Override the CDN base URL           |

---

## Error Handling

All helixir engine functions throw `MCPError` on failure. Use `handleToolError` in your MCP tool implementations to wrap unknown errors into structured responses.

```typescript
import { MCPError, ErrorCategory, handleToolError, parseCem } from '@helixui/mcp';

// Throwing structured errors
throw new MCPError('Component not found', ErrorCategory.NOT_FOUND);

// Catching and wrapping errors
try {
  const meta = parseCem('my-button', cem);
} catch (err) {
  if (err instanceof MCPError) {
    console.error(`[${err.category}] ${err.message}`);
  }
}

// In an MCP tool handler
async function myToolHandler(input: unknown) {
  try {
    // ... tool logic
  } catch (err) {
    const mcpErr = handleToolError(err); // always returns MCPError
    return { isError: true, content: [{ type: 'text', text: mcpErr.message }] };
  }
}
```

### Error categories

| Category                      | When used                            |
| ----------------------------- | ------------------------------------ |
| `ErrorCategory.NOT_FOUND`     | Component or resource does not exist |
| `ErrorCategory.INVALID_INPUT` | Malformed or missing input           |
| `ErrorCategory.INTERNAL`      | Unexpected internal failure          |
| `ErrorCategory.UNSUPPORTED`   | Feature not supported for this input |

---

## Building a Custom MCP Tool

Here is a complete example of building a custom MCP tool that queries component documentation completeness scores using `@helixui/mcp`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  loadConfig,
  CemSchema,
  listAllComponents,
  validateCompleteness,
  handleToolError,
} from '@helixui/mcp';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const config = loadConfig();
const raw = JSON.parse(readFileSync(resolve(config.projectRoot, config.cemPath), 'utf-8'));
const cem = CemSchema.parse(raw);

const server = new Server(
  { name: 'my-quality-tool', version: '1.0.0' },
  {
    capabilities: { tools: {} },
  },
);

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'check_documentation_scores',
      description: 'Get documentation completeness scores for all components',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
  ],
}));

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name !== 'check_documentation_scores') {
    return { isError: true, content: [{ type: 'text', text: 'Unknown tool' }] };
  }
  try {
    const tags = listAllComponents(cem);
    const scores = tags.map((tag) => ({
      tag,
      ...validateCompleteness(tag, cem),
    }));
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(scores, null, 2),
        },
      ],
    };
  } catch (err) {
    const e = handleToolError(err);
    return { isError: true, content: [{ type: 'text', text: e.message }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## License

MIT — see [LICENSE](../../LICENSE) for details.
