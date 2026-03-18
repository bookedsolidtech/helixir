# Updating the Custom Elements Manifest (CEM)

The `custom-elements.json` file at the repository root is the Custom Elements Manifest for helixir. It is generated from source TypeScript files using [`@custom-elements-manifest/analyzer`](https://custom-elements-manifest.open-wc.org/analyzer/).

## When to update

Update `custom-elements.json` any time you:

- Add, rename, or remove exported functions, classes, or variables in `src/` or `packages/core/src/`
- Change the signature of an exported function
- Add or remove a public class member

## How to update

Run the generation script locally and commit the result:

```bash
pnpm run cem:generate
git add custom-elements.json
git commit -m "chore: update custom-elements.json"
```

## CI gate

The `CEM Validate` CI workflow runs on every pull request. It regenerates the CEM from source and fails if the committed `custom-elements.json` differs from the generated output.

**If your PR fails the CEM Validate check**, run `pnpm run cem:generate` locally, commit the updated file, and push again.

## Configuration

The analyzer is configured in `custom-elements-manifest.config.cjs`. It scans:

- `src/**/*.ts`
- `packages/core/src/**/*.ts`

Test files and type-declaration files are excluded from analysis.

## Why this matters

The published helixir npm package is used by consuming projects (e.g. trip-planner) to get component API information via MCP tools. If `custom-elements.json` is stale at publish time, those projects receive outdated component metadata. This CI gate ensures the manifest is always current before any merge or release.
