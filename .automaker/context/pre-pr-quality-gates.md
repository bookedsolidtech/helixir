# Pre-PR Quality Gates: Complete Setup Guide

A three-layer quality gate system that catches errors at progressively wider scopes: **local commit**, **CI pipeline**, and **deploy verification**. This guide documents the full setup used across protoLabs projects, with instructions for adapting it to any Node.js/TypeScript project.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Layer 1: Pre-Commit Hooks](#layer-1-pre-commit-hooks)
   - [Husky Setup](#husky-setup)
   - [lint-staged Configuration](#lint-staged-configuration)
   - [Commitlint (Conventional Commits)](#commitlint-conventional-commits)
3. [Layer 2: CI Pipeline](#layer-2-ci-pipeline)
   - [Workflow Structure](#workflow-structure)
   - [Build & Type Check](#build--type-check)
   - [ESLint](#eslint)
   - [Prettier Format Check](#prettier-format-check)
   - [Unit Tests (Vitest)](#unit-tests-vitest)
   - [Security Audit](#security-audit)
   - [E2E Tests (Playwright)](#e2e-tests-playwright)
   - [Code Review (CodeRabbit)](#code-review-coderabbit)
4. [Layer 3: Branch Protection & Deploy Gates](#layer-3-branch-protection--deploy-gates)
   - [Required Status Checks](#required-status-checks)
   - [Squash-Only Merges](#squash-only-merges)
   - [Deploy Verification](#deploy-verification)
5. [Tool-by-Tool Setup](#tool-by-tool-setup)
   - [ESLint v9 (Flat Config)](#eslint-v9-flat-config)
   - [Prettier](#prettier)
   - [Vitest with Coverage](#vitest-with-coverage)
   - [Playwright E2E](#playwright-e2e)
6. [Package Manager Notes](#package-manager-notes)
7. [Monorepo Considerations](#monorepo-considerations)
8. [Troubleshooting](#troubleshooting)
9. [Checklist: Minimum Viable Quality Gates](#checklist-minimum-viable-quality-gates)

---

## Architecture Overview

```
Developer writes code
        |
        v
  +-----------------+
  | Layer 1: Local  |  Runs on every commit (< 5 seconds)
  |  - lint-staged  |  Catches: formatting, lint errors on changed files
  |  - commitlint   |  Catches: non-conventional commit messages
  +-----------------+
        |
        v
  +------------------+
  | Layer 2: CI      |  Runs on push/PR to protected branches (2-5 minutes)
  |  - build + tsc   |  Catches: type errors, build failures
  |  - eslint        |  Catches: lint errors across entire codebase
  |  - prettier      |  Catches: formatting drift
  |  - vitest        |  Catches: broken unit tests, coverage regression
  |  - pnpm audit    |  Catches: known vulnerabilities
  |  - playwright    |  Catches: broken user flows (optional per-PR)
  |  - CodeRabbit    |  Catches: code quality, security, style issues
  +------------------+
        |
        v
  +------------------+
  | Layer 3: Deploy  |  Runs on merge to protected branches
  |  - branch rules  |  Enforces: required checks, PR reviews
  |  - deploy verify |  Catches: production build failures, runtime errors
  +------------------+
```

**Why three layers?**

- **Layer 1** gives instant feedback (developers don't push broken formatting)
- **Layer 2** is the hard gate (PR cannot merge if any check fails)
- **Layer 3** prevents misconfiguration (cannot bypass CI by pushing directly)

---

## Layer 1: Pre-Commit Hooks

### Husky Setup

[Husky](https://typicode.github.io/husky/) manages Git hooks as files in `.husky/`.

**Install:**

```bash
# npm
npm install -D husky
npx husky init

# pnpm
pnpm add -wD husky
pnpm exec husky init

# yarn
yarn add -D husky
npx husky init
```

The `init` command:

1. Adds `"prepare": "husky"` to `package.json` scripts
2. Creates `.husky/pre-commit` with a sample command

> **Note:** `husky init` runs automatically on `npm install` / `pnpm install` via the `prepare` script. New contributors get hooks automatically — no manual setup needed.

### lint-staged Configuration

[lint-staged](https://github.com/lint-staged/lint-staged) runs linters only on staged files, keeping pre-commit hooks fast.

**Install:**

```bash
# npm
npm install -D lint-staged

# pnpm
pnpm add -wD lint-staged
```

**Configure in `package.json`:**

```jsonc
{
  "lint-staged": {
    // Run ESLint auto-fix + Prettier on JS/TS files
    "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
    // Run Prettier only on non-code files
    "*.{json,css,md,yml,yaml}": ["prettier --write"],
  },
}
```

**Alternative: Prettier-only approach (simpler, used by protoMaker):**

```jsonc
{
  "lint-staged": {
    "*": ["prettier --write --ignore-unknown"],
  },
}
```

> **Decision point:** Running ESLint in lint-staged catches more issues locally but adds ~2-3 seconds to every commit. If your CI runs ESLint anyway, Prettier-only in lint-staged is a valid lighter approach.

**Wire it up in `.husky/pre-commit`:**

```sh
pnpm exec lint-staged
```

Or for npm:

```sh
npx lint-staged
```

### Commitlint (Conventional Commits)

[Commitlint](https://commitlint.js.org/) enforces [Conventional Commits](https://www.conventionalcommits.org/) format: `type(scope): description`.

**Install:**

```bash
# npm
npm install -D @commitlint/cli @commitlint/config-conventional

# pnpm
pnpm add -wD @commitlint/cli @commitlint/config-conventional
```

**Create `commitlint.config.cjs`:**

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Adjust header length to your preference (default: 100)
    'header-max-length': [2, 'always', 120],
    // Customize allowed types for your project
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation only
        'style', // Formatting, whitespace
        'refactor', // Code change (no new feature, no bug fix)
        'perf', // Performance improvement
        'test', // Adding or updating tests
        'build', // Build system or dependency changes
        'ci', // CI configuration
        'chore', // Maintenance tasks
        'revert', // Revert a previous commit
      ],
    ],
  },
};
```

> **Why `.cjs`?** If your `package.json` has `"type": "module"`, commitlint's config loader needs CommonJS. Using `.cjs` avoids issues regardless of your module system.

**Create `.husky/commit-msg`:**

```sh
pnpm exec commitlint --edit "$1"
```

**Make it executable:**

```bash
chmod +x .husky/commit-msg
```

**Verify it works:**

```bash
# Should fail:
echo "bad message" | pnpm exec commitlint
# ✖ subject may not be empty [subject-empty]

# Should pass:
echo "feat: add login page" | pnpm exec commitlint
# ✔
```

---

## Layer 2: CI Pipeline

### Workflow Structure

Each check runs as a **separate workflow file** in `.github/workflows/`. This gives:

- Independent pass/fail status per check (visible on PR)
- Parallel execution (all checks run simultaneously)
- Easy to add/remove checks without touching other workflows

**Common triggers (use on all workflows):**

```yaml
on:
  push:
    branches: [main, dev] # Adjust to your protected branches
  pull_request:
    branches: [main, dev]
```

**Common setup steps (DRY template):**

```yaml
jobs:
  check-name:
    runs-on: ubuntu-latest
    timeout-minutes: 10 # Always set a timeout

    steps:
      - uses: actions/checkout@v4

      # For pnpm:
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile

      # For npm:
      # - uses: actions/setup-node@v4
      #   with:
      #     node-version: '20'
      #     cache: 'npm'
      # - run: npm ci

      # For yarn:
      # - uses: actions/setup-node@v4
      #   with:
      #     node-version: '20'
      #     cache: 'yarn'
      # - run: yarn install --frozen-lockfile
```

> **Always use `--frozen-lockfile` / `npm ci` in CI.** This ensures CI installs exactly what's in the lockfile, preventing "works on my machine" drift.

### Build & Type Check

**`.github/workflows/build.yml`:**

```yaml
name: Build

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm exec tsc --noEmit

      - name: Build
        run: pnpm run build
```

**Why both `tsc --noEmit` and `build`?**

- `tsc --noEmit` catches type errors fast (< 30 seconds typically)
- `build` catches runtime build issues (missing env vars, import cycles, etc.)
- If build includes type checking (e.g., Next.js with `typescript.ignoreBuildErrors: false`), you could skip the separate `tsc` step, but explicit type checking is clearer

### ESLint

**`.github/workflows/lint.yml`:**

```yaml
name: Lint

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

jobs:
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint
```

> **Critical:** This is the check most commonly missing from projects. lint-staged only checks staged files — if someone skips hooks (`--no-verify`) or if ESLint rules change after old files were committed, only a full CI lint run catches the drift.

### Prettier Format Check

**`.github/workflows/format.yml`:**

```yaml
name: Format Check

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

jobs:
  format:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile

      - name: Check formatting
        run: pnpm format:check
```

**Required `package.json` script:**

```json
{
  "scripts": {
    "format:check": "prettier --check ."
  }
}
```

### Unit Tests (Vitest)

**`.github/workflows/test.yml`:**

```yaml
name: Test

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test
```

**For coverage enforcement, add to `vitest.config.ts`:**

```ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      thresholds: {
        // Set these based on your current coverage baseline
        lines: 50,
        functions: 60,
        branches: 70,
        statements: 50,
      },
    },
  },
});
```

Then change the test script to include coverage:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:ci": "vitest run --coverage"
  }
}
```

> **Tip:** Start with thresholds slightly below your current coverage. Ratchet them up as you add tests. Never start at 80% if your codebase is at 30% — you'll just disable the check.

### Security Audit

**`.github/workflows/security.yml`:**

```yaml
name: Security Audit

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

jobs:
  audit:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile

      - name: Security audit
        run: pnpm audit --audit-level=high
```

> **Do NOT use `|| true` to soft-fail audits.** If high/critical vulnerabilities are found, the PR should be blocked. If a vulnerability is a false positive or can't be fixed yet, use pnpm's `pnpm.auditConfig.ignoreCves` in `package.json` to allowlist specific CVEs with a comment explaining why.

**Allowlisting known CVEs (when necessary):**

```jsonc
{
  "pnpm": {
    "auditConfig": {
      "ignoreCves": [
        "CVE-2024-XXXXX", // False positive in dev-only dependency
      ],
    },
  },
}
```

### E2E Tests (Playwright)

E2E tests are typically too slow and resource-intensive for every PR. Common strategies:

1. **Run on merge to protected branches only** (not on PRs)
2. **Run on PRs that touch specific paths** (e.g., `src/app/**`)
3. **Run in a separate workflow triggered manually or on schedule**

**`.github/workflows/e2e.yml` (path-filtered example):**

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
    paths:
      - 'src/app/**'
      - 'src/components/**'
      - 'e2e/**'
      - 'playwright.config.ts'

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium

      - name: Build
        run: pnpm build

      - name: Run E2E tests
        run: pnpm test:e2e
        env:
          BASE_URL: http://localhost:3000
          CI: true
```

### Code Review (CodeRabbit)

[CodeRabbit](https://coderabbit.ai/) provides AI-powered code review. Configure via `.coderabbit.yaml` at the project root. Key settings:

```yaml
reviews:
  profile: 'assertive'
  request_changes_workflow: true
  auto_review:
    enabled: true
    base_branches: ['main', 'dev']
    drafts: false
```

With `request_changes_workflow: true`, CodeRabbit Review becomes a required status check that blocks merge until all review threads are resolved.

---

## Layer 3: Branch Protection & Deploy Gates

### Required Status Checks

Configure via GitHub Settings > Branches > Branch protection rules, or use the GitHub API:

```bash
#!/usr/bin/env bash
REPO="your-org/your-repo"

# Set squash-only merges
gh api "repos/${REPO}" \
  --method PATCH \
  --field allow_squash_merge=true \
  --field allow_merge_commit=false \
  --field allow_rebase_merge=false

# Create ruleset with required checks
gh api "repos/${REPO}/rulesets" \
  --method POST \
  --header "Content-Type: application/json" \
  --input - <<'EOF'
{
  "name": "main branch protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "required_approving_review_count": 0,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "required_status_checks": [
          { "context": "build" },
          { "context": "test" },
          { "context": "lint" },
          { "context": "format" },
          { "context": "audit" },
          { "context": "CodeRabbit Review" }
        ],
        "strict_required_status_checks_policy": false
      }
    }
  ]
}
EOF
```

### Squash-Only Merges

Squash merges keep the main branch history clean — one commit per PR. Configure at the repo level:

- GitHub Settings > General > Pull Requests > Allow squash merging (only)
- Or via API as shown above

### Deploy Verification

After merge to main:

- **Vercel/Netlify:** Auto-deploys on push. Add preview deploy checks on PRs.
- **Docker:** Rebuild and deploy on push to protected branches.
- **Custom:** Add a deploy workflow that runs after merge.

---

## Tool-by-Tool Setup

### ESLint v9 (Flat Config)

ESLint v9 uses the flat config format (`eslint.config.mjs`). The old `.eslintrc.*` format is deprecated.

**Install:**

```bash
# For a Next.js project:
pnpm add -wD eslint eslint-config-next eslint-config-prettier

# For a generic React/TypeScript project:
pnpm add -wD eslint @eslint/js typescript-eslint eslint-config-prettier

# For a Node.js server:
pnpm add -wD eslint @eslint/js typescript-eslint eslint-plugin-n eslint-config-prettier
```

**Next.js config (`eslint.config.mjs`):**

```js
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettierConfig from 'eslint-config-prettier';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettierConfig, // Must be LAST to disable conflicting rules
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**']),
]);
```

**Generic TypeScript config (`eslint.config.mjs`):**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  { ignores: ['dist/**', 'build/**', 'coverage/**', 'node_modules/**'] }
);
```

**`package.json` script:**

```json
{
  "scripts": {
    "lint": "eslint"
  }
}
```

> ESLint v9 no longer needs a `.` argument — it uses the flat config's file matching automatically.

### Prettier

**Install:**

```bash
pnpm add -wD prettier eslint-config-prettier
```

**`.prettierrc`:**

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**`.prettierignore`:**

```
node_modules
.next
coverage
build
dist
pnpm-lock.yaml
package-lock.json
yarn.lock
*.min.js
*.min.css
```

**`package.json` scripts:**

```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

### Vitest with Coverage

**Install:**

```bash
# Match the major version of vitest
pnpm add -wD vitest @vitest/coverage-v8
```

**`vitest.config.ts`:**

```ts
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      'e2e/**',
      'node_modules/**',
      '.worktrees/**', // If using git worktrees
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/__tests__/**',
        'src/**/*.stories.{ts,tsx}',
        'src/**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**`package.json` scripts:**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Playwright E2E

**Install:**

```bash
pnpm add -wD @playwright/test
pnpm exec playwright install
```

**`playwright.config.ts` (minimal):**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    headless: true,
  },

  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 14'] } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

---

## Package Manager Notes

| Feature              | npm                       | pnpm                                          | yarn                             |
| -------------------- | ------------------------- | --------------------------------------------- | -------------------------------- |
| CI install           | `npm ci`                  | `pnpm install --frozen-lockfile`              | `yarn install --frozen-lockfile` |
| Workspace flag       | N/A                       | `-w` or `--workspace-root`                    | `-W`                             |
| Run binary           | `npx`                     | `pnpm exec`                                   | `npx`                            |
| Husky hook prefix    | `npx lint-staged`         | `pnpm exec lint-staged`                       | `npx lint-staged`                |
| GitHub Actions setup | `actions/setup-node` only | `pnpm/action-setup@v4` + `actions/setup-node` | `actions/setup-node` only        |

---

## Monorepo Considerations

If your project is a monorepo (multiple packages in `packages/` or `apps/`):

1. **Husky + lint-staged:** Install at the root. lint-staged runs on the root and will lint staged files from any package.

2. **ESLint:** Each package can have its own `eslint.config.mjs`. The root `lint` script can use `--config` or each package can define its own `lint` script, coordinated via the package manager's workspace run:

   ```json
   { "scripts": { "lint": "pnpm -r run lint" } }
   ```

3. **Vitest:** Use a workspace config at the root:

   ```ts
   // vitest.workspace.ts
   export default ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'];
   ```

   Or a single root config if all packages share settings.

4. **Coverage thresholds:** Set per-package in each package's `vitest.config.ts` so that a utility library can have 80% coverage while a UI app has 30%.

---

## Troubleshooting

### Husky hooks not running

```bash
# Verify hooks are installed
ls -la .git/hooks/
# Should show pre-commit -> ../.husky/pre-commit (symlink)

# Re-install
pnpm exec husky
```

### lint-staged hangs on large changesets

Add `--concurrent false` to run linters sequentially:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix --concurrent false", "prettier --write"]
  }
}
```

### ESLint v9 migration from .eslintrc

ESLint v9 dropped support for `.eslintrc.*`. If migrating:

1. Delete `.eslintrc.*` files
2. Create `eslint.config.mjs` (see examples above)
3. Replace `eslint-plugin-*` extends with flat config imports
4. Run `npx @eslint/migrate-config .eslintrc.json` for automated migration

### Vitest picking up files from .worktrees or node_modules

Add to `vitest.config.ts` `exclude` array:

```ts
exclude: ['.worktrees/**', 'node_modules/**', '**/node_modules/**'];
```

### commitlint fails on merge commits

Merge commits don't follow conventional commits format. Add to `commitlint.config.cjs`:

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  ignores: [(commit) => commit.startsWith('Merge')],
};
```

### pnpm audit fails on dev dependencies

If you only want to audit production dependencies:

```bash
pnpm audit --prod --audit-level=high
```

### CI timeout with no output

Always set `timeout-minutes` on every job. Default is 360 minutes (6 hours) which will waste GitHub Actions minutes if something hangs:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15 # Kill after 15 minutes
```

---

## Checklist: Minimum Viable Quality Gates

Use this checklist when setting up a new project or auditing an existing one.

### Layer 1: Pre-Commit (must have)

- [ ] `husky` installed, `prepare` script in `package.json`
- [ ] `.husky/pre-commit` runs `lint-staged` (or equivalent)
- [ ] `lint-staged` config in `package.json` — at minimum runs Prettier
- [ ] `.husky/commit-msg` runs `commitlint` (recommended)
- [ ] `commitlint.config.cjs` extends `@commitlint/config-conventional`

### Layer 2: CI Workflows (must have)

- [ ] **Build** workflow: `tsc --noEmit` + framework build
- [ ] **Lint** workflow: `eslint` on full codebase
- [ ] **Format** workflow: `prettier --check .`
- [ ] **Test** workflow: `vitest run` (or your test runner)
- [ ] **Security** workflow: `pnpm audit --audit-level=high` (hard-fail, not `|| true`)
- [ ] All workflows have `timeout-minutes` set
- [ ] All workflows use `--frozen-lockfile` for installs
- [ ] All workflows trigger on push + PR to protected branches

### Layer 2: CI Workflows (recommended)

- [ ] E2E tests on merge to main (or path-filtered on PRs)
- [ ] CodeRabbit or equivalent AI review tool
- [ ] Coverage thresholds in vitest config
- [ ] Coverage report uploaded as CI artifact

### Layer 3: Branch Protection (must have)

- [ ] PRs required before merging to main
- [ ] All CI checks listed as required status checks
- [ ] Stale review dismissal on new pushes
- [ ] Squash-only merges (keeps history clean)

### Layer 3: Branch Protection (recommended)

- [ ] Required review thread resolution (for CodeRabbit)
- [ ] Branch protection script checked into repo for reproducibility

---

## Reference: trip-planner Project Setup

This is the concrete setup for the `spring-break-2026` trip-planner project, as a reference implementation.

**Package manager:** pnpm 10.x
**Framework:** Next.js 16.x (App Router)
**Test runner:** Vitest 3.x + Playwright 1.x
**Linter:** ESLint 9 (flat config) with `eslint-config-next`

**Pre-commit:**

- `lint-staged` runs ESLint `--fix` + Prettier on `*.{js,jsx,ts,tsx}`, Prettier on `*.{json,css,md}`
- `commitlint` enforces conventional commits

**CI (5 parallel workflows):**

1. `build` — `tsc --noEmit` + `next build` (15 min timeout)
2. `lint` — `eslint` full codebase (10 min timeout)
3. `format` — `prettier --check .` (10 min timeout)
4. `test` — `vitest run` (10 min timeout)
5. `audit` — `pnpm audit --audit-level=high` (10 min timeout, hard-fail)

**Branch protection:**

- Required checks: `build`, `test`, `lint`, `format`, `audit`, `CodeRabbit Review`
- Squash-only merges
- Stale review dismissal
- Required thread resolution
