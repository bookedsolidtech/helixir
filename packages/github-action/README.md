# @helixir/github-action

GitHub Action that runs [helixir](https://github.com/bookedsolidtech/helixir) quality gates on every PR. Validates CEM completeness, health scores, and detects breaking changes in web component libraries.

## Usage

```yaml
- uses: bookedsolidtech/helixir/.github/actions/helixir-quality-gates@main
  with:
    checks: 'health,breaking-changes,accessibility'
    health-threshold: '70'
    fail-on-breaking: 'true'
```

## Inputs

| Input              | Description                                                                  | Default                                 |
| ------------------ | ---------------------------------------------------------------------------- | --------------------------------------- |
| `checks`           | Comma-separated checks to run: `health`, `breaking-changes`, `accessibility` | `health,breaking-changes,accessibility` |
| `health-threshold` | Minimum health score (0–100) required to pass                                | `70`                                    |
| `fail-on-breaking` | Fail if breaking changes are detected                                        | `true`                                  |
| `fail-on-warning`  | Fail if minor (warning-level) breaking changes are detected                  | `false`                                 |
| `comment`          | Post a summary comment on the pull request                                   | `true`                                  |
| `config-path`      | Path to `mcpwc.config.json` (auto-discovered if empty)                       | `""`                                    |
| `node-version`     | Node.js version to use                                                       | `20`                                    |
| `helixir-version`  | Version of helixir to install                                                | `latest`                                |

## Outputs

| Output                   | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `health-score`           | Average health score across all components        |
| `failing-components`     | Number of components below the threshold          |
| `breaking-changes-count` | Number of breaking changes detected               |
| `passed`                 | Whether all quality gates passed (`true`/`false`) |

## Examples

### Gate all PRs on health score

```yaml
name: Component Quality Gates

on:
  pull_request:
    branches: [main, dev]

jobs:
  helixir:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - uses: bookedsolidtech/helixir/.github/actions/helixir-quality-gates@main
        with:
          checks: 'health,breaking-changes,accessibility'
          health-threshold: '70'
          fail-on-breaking: 'true'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Strict mode — fail on warnings too

```yaml
- uses: bookedsolidtech/helixir/.github/actions/helixir-quality-gates@main
  with:
    checks: 'health,breaking-changes'
    health-threshold: '80'
    fail-on-breaking: 'true'
    fail-on-warning: 'true'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Health-only check (no breaking change detection)

```yaml
- uses: bookedsolidtech/helixir/.github/actions/helixir-quality-gates@main
  with:
    checks: 'health'
    health-threshold: '60'
    comment: 'true'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Custom config path (monorepo)

```yaml
- uses: bookedsolidtech/helixir/.github/actions/helixir-quality-gates@main
  with:
    checks: 'health,breaking-changes'
    health-threshold: '75'
    config-path: 'packages/web-components/mcpwc.config.json'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Use outputs in downstream steps

```yaml
- id: helixir
  uses: bookedsolidtech/helixir/.github/actions/helixir-quality-gates@main
  with:
    checks: 'health'
    health-threshold: '70'

- name: Report score
  run: echo "Average health score: ${{ steps.helixir.outputs.health-score }}"

- name: Block deploy if quality gate failed
  if: steps.helixir.outputs.passed != 'true'
  run: exit 1
```

## PR Comment

When `comment: 'true'` (default), the action posts a formatted summary comment on the PR and updates it on subsequent pushes:

```
## 🔍 helixir Quality Gate Report

### ✅ Health Scores (threshold: 70)

**Average: 84** | Passing: 12 | Failing: 0

| | Component       | Score | Grade | Health     |
|---|---|---|---|---|
| ✅ | `hx-button`   | 91    | A     | █████████░ |
| ✅ | `hx-input`    | 84    | B     | ████████░░ |
| ✅ | `hx-dialog`   | 77    | C     | ███████░░░ |

### Breaking Changes

✅ No breaking changes detected.
```

## Setup

helixir requires a `mcpwc.config.json` in the component library root (or specify `config-path`):

```json
{
  "cemPath": "custom-elements.json",
  "projectRoot": "/absolute/path/to/your/component-library",
  "componentPrefix": "hx-"
}
```

The CEM must be up-to-date. Add CEM generation to your build step:

```json
{
  "scripts": {
    "analyze:cem": "cem analyze --litelement --globs 'src/**/*.ts'",
    "build": "npm run analyze:cem && tsc"
  }
}
```

## Required Permissions

The action needs `pull-requests: write` to post PR comments:

```yaml
permissions:
  pull-requests: write
```
