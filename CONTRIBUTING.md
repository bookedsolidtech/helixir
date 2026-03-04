# Contributing to wc-tools

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

```bash
git clone https://github.com/bookedsolidtech/wc-tools.git
cd wc-tools
pnpm install
pnpm test
pnpm run build
```

**Requirements:**

- Node.js >= 20
- pnpm >= 9

`pnpm install` automatically installs the husky pre-commit hooks via the `prepare` lifecycle script.

## Project Structure

```
wc-tools/
├── src/
│   ├── index.ts              # Server entry point, tool dispatch
│   ├── config.ts             # Config loading (env vars → file → defaults)
│   ├── cli.ts                # CLI entry point
│   ├── handlers/             # Business logic — pure functions, no MCP coupling
│   │   ├── cem.ts            # Custom Elements Manifest parsing
│   │   ├── health.ts         # Health scoring for components
│   │   ├── tokens.ts         # Design token parsing
│   │   ├── typescript.ts     # TypeScript diagnostics
│   │   ├── accessibility.ts  # Accessibility checks
│   │   ├── narrative.ts      # Natural language summaries
│   │   └── suggest.ts        # Component suggestions
│   ├── tools/                # MCP tool definitions and dispatch
│   │   ├── component.ts      # Component introspection tools
│   │   ├── discovery.ts      # Library discovery tools
│   │   ├── health.ts         # Health check tools
│   │   ├── safety.ts         # Safety validation tools
│   │   ├── tokens.ts         # Token tools
│   │   └── typescript.ts     # TypeScript tools
│   └── shared/               # Cross-cutting utilities
│       ├── discovery.ts      # CEM file discovery helpers
│       ├── error-handling.ts # Standardized error types
│       ├── file-ops.ts       # File system helpers
│       ├── git.ts            # Git integration
│       ├── mcp-helpers.ts    # MCP response formatting
│       └── validation.ts     # Zod validation helpers
├── tests/
│   ├── __fixtures__/         # Sample CEM JSON files for testing
│   ├── handlers/             # Unit tests for handlers
│   ├── tools/                # Unit tests for tools
│   └── integration/          # Integration tests (start real server)
└── examples/                 # Example mcpwc.config.json files
```

**The key distinction:**

- `src/handlers/` — Pure business logic. These functions take plain data and return plain data. Easy to unit test.
- `src/tools/` — MCP glue layer. Each file exports tool definitions (JSON Schema) and a dispatch function that calls handlers and formats MCP responses.
- `src/shared/` — Utilities used across both layers.

## How to Add a New Tool

Follow these four steps:

### 1. Add to tool definitions

In the appropriate `src/tools/*.ts` file, add your tool to the `*_TOOL_DEFINITIONS` array:

```typescript
export const MY_TOOL_DEFINITIONS: Tool[] = [
  // ... existing tools
  {
    name: 'my_new_tool',
    description: 'What this tool does for AI agents',
    inputSchema: {
      type: 'object',
      properties: {
        componentName: {
          type: 'string',
          description: 'Name of the component to inspect',
        },
      },
      required: ['componentName'],
      additionalProperties: false,
    },
  },
];
```

### 2. Add handler case in the dispatch function

In the same `src/tools/*.ts` file, add a case to the dispatch function:

```typescript
export async function handleMyGroupCall(
  toolName: string,
  args: Record<string, unknown>,
  config: Config,
): Promise<CallToolResult> {
  switch (toolName) {
    // ... existing cases
    case 'my_new_tool': {
      const { componentName } = validateArgs(myNewToolSchema, args);
      const result = await myNewHandler(componentName, config);
      return formatSuccess(result);
    }
    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
  }
}
```

### 3. Add the handler function

Add the business logic in `src/handlers/*.ts`:

```typescript
export async function myNewHandler(componentName: string, config: Config): Promise<MyResult> {
  // Pure business logic here — no MCP types
  const cem = await loadCem(config);
  const component = findComponent(cem, componentName);
  return { ...component, extra: 'data' };
}
```

### 4. Write tests

Add a test file at `tests/handlers/my-handler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { myNewHandler } from '../../src/handlers/my-handler.js';
import type { Config } from '../../src/config.js';

const baseConfig: Config = { cemPath: './tests/__fixtures__/shoelace-custom-elements.json' };

describe('myNewHandler', () => {
  it('returns expected data for known component', async () => {
    const result = await myNewHandler('sl-button', baseConfig);
    expect(result).toMatchObject({ name: 'sl-button' });
  });

  it('throws for unknown component', async () => {
    await expect(myNewHandler('does-not-exist', baseConfig)).rejects.toThrow();
  });
});
```

## How to Add a New Framework Fixture

Framework fixtures are CEM JSON files that let you write tests against real-world component libraries without network calls.

### Steps

1. **Obtain the CEM file** from the framework's published package or repository. Look for `custom-elements.json` or `custom-elements-manifest.json`.

2. **Copy it to `tests/__fixtures__/`:**

   ```
   tests/__fixtures__/my-framework-custom-elements.json
   ```

3. **Trim if needed.** If the file is very large (> 500KB), reduce it to a representative subset: 3–5 components covering different patterns (simple component, component with slots, component with CSS parts, component with events).

4. **Write a minimum fixture test** at `tests/examples.test.ts` or a dedicated `tests/fixtures/my-framework.test.ts`:

   ```typescript
   describe('my-framework fixture', () => {
     it('parses without errors', async () => {
       const cem = await loadCem({
         cemPath: './tests/__fixtures__/my-framework-custom-elements.json',
       });
       expect(cem.modules.length).toBeGreaterThan(0);
     });

     it('discovers components', async () => {
       const components = await listAllComponents(config);
       expect(components.length).toBeGreaterThan(0);
     });

     it('scores health for a known component', async () => {
       const score = await scoreComponent('my-button', config);
       expect(score.score).toBeGreaterThanOrEqual(0);
     });
   });
   ```

### Minimum test requirements for a new fixture

- [ ] Parses without throwing
- [ ] At least one component discovered
- [ ] Health scoring works on at least one component
- [ ] Token extraction works (if the library ships tokens)

## Testing Guidelines

### Unit tests (`tests/handlers/`, `tests/tools/`)

Test a single function in isolation. Use fixture files for CEM data. Mock file system only when testing error paths.

**What to unit test:**

- All handler functions with known inputs and expected outputs
- Edge cases: empty CEM, missing fields, malformed input
- Error paths: file not found, parse failure

**What NOT to unit test:**

- MCP protocol serialization (covered by integration tests)
- Config loading from disk (test the logic, not the I/O)

### Integration tests (`tests/integration/`)

Start a real MCP server in a subprocess and send JSON-RPC messages to it. Test the full request/response cycle.

**What to integration test:**

- Tool discovery (list_tools returns expected tool names)
- A representative happy-path call for each tool group
- Server startup with valid and invalid config

### Writing fixtures

Fixtures in `tests/__fixtures__/` must:

- Be valid CEM JSON (the spec is at [custom-elements-manifest.open-wc.org](https://custom-elements-manifest.open-wc.org/))
- Cover the patterns your test exercises
- Be committed to the repo — tests must not make network calls

## PR Checklist

Before opening a PR, verify:

- [ ] Tests added for new functionality
- [ ] `pnpm run type-check` passes (zero TypeScript errors)
- [ ] `pnpm run lint` passes
- [ ] `pnpm run format:check` passes (run `pnpm run format` to fix)
- [ ] `pnpm test` passes
- [ ] `pnpm run build` succeeds
- [ ] Example config added to `examples/` if you added a new framework fixture
- [ ] `CHANGELOG.md` entry added under `[Unreleased]`

## Pre-Commit Hooks

wc-tools uses [husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) + [commitlint](https://commitlint.js.org) to enforce quality at commit time. These are installed automatically by `pnpm install`.

**What runs on every commit:**

| Hook          | What it does                                                               |
| ------------- | -------------------------------------------------------------------------- |
| `pre-commit`  | Runs lint-staged: ESLint + Prettier on staged `.ts`/`.js` files; Prettier on JSON/CSS/Markdown/YAML |
| `commit-msg`  | Validates the commit message against the conventional-commits format       |

**Allowed commit types:**

```
feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert | audit
```

**Format:** `<type>(<optional scope>): <description>` — max 120 characters per line.

Examples:
```
feat(health): add trend direction to get_health_trend
fix(validation): reject path traversal in cemPath input
docs: update CONTRIBUTING with pre-commit hook setup
```

Merge commits (starting with `Merge`) bypass commitlint automatically.

## CI Pipeline

Five parallel GitHub Actions workflows run on every push and PR to `main`, `dev`, and `staging`:

| Workflow       | File                                | What it does                                                          |
| -------------- | ----------------------------------- | --------------------------------------------------------------------- |
| **build**      | `.github/workflows/build.yml`       | `tsc --noEmit` type-check + `pnpm run build` on Node 20 and 22       |
| **test**       | `.github/workflows/test.yml`        | `pnpm run test:coverage` (vitest) on Node 20 and 22                   |
| **lint**       | `.github/workflows/lint.yml`        | `pnpm run lint` (ESLint)                                              |
| **format**     | `.github/workflows/format.yml`      | `pnpm run format:check` (Prettier)                                    |
| **security**   | `.github/workflows/security.yml`    | `pnpm audit --audit-level=high`                                       |

All five must pass before a PR can merge.

## Running Tests with Coverage

```bash
# Full suite with v8 coverage report
pnpm run test:coverage
```

Coverage output lands in `coverage/`. The CI threshold is configured in `vitest.config.ts`. Aim for ≥80% on new handler code.

Run a single test file or directory:

```bash
# Single file
pnpm exec vitest run tests/handlers/health.test.ts

# All handler tests
pnpm exec vitest run tests/handlers/

# Watch a specific file while developing
pnpm exec vitest tests/handlers/health.test.ts
```

## Branch Protection

`main`, `dev`, and `staging` have branch protection enabled:

- All five CI checks must pass before merge
- PRs require at least one approving review; stale reviews are dismissed on new pushes
- Merge strategy: **squash-only** (no merge commits, no rebase)
- Direct pushes to protected branches are blocked

## Code Style

- ESM only — use `.js` extensions in imports even for `.ts` source files
- No default exports — use named exports throughout
- Handler functions must be pure: no global state, no direct MCP imports
- Zod schemas for all external input validation; use `additionalProperties: false` in JSON schemas
- Run `pnpm run format` before committing (husky does this automatically on commit)
