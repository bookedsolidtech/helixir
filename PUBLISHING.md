# Publishing Guide — HELiXiR & @helixir/\* Packages

This document captures everything learned while shipping `@helixui/library` and `@helixui/tokens`
through a production npm pipeline — including every bug hit, how it was fixed, and the specific
commits/PRs where it landed. If you're publishing `@helixir/*` packages (or any future OSS
packages from this org), read this first.

---

## TL;DR — The Two Models

| Project                  | Tool              | How it works                                                   |
| ------------------------ | ----------------- | -------------------------------------------------------------- |
| **HELiX** (`@helixui/*`) | `@changesets/cli` | Explicit per-PR changeset files → version PR → merge → publish |
| **HELiXiR** (`helixir`)  | `@changesets/cli` | Explicit per-PR changeset files → version PR → merge → publish |

Both are valid. This doc covers **both**, with the hard-won lessons from HELiX applied to HELiXiR.

---

## Part 1 — How Changesets Work (HELiX Model)

### The Two-Step Dance

Publishing with `@changesets/cli` is **not** one step. It is always two pushes to `main`:

```text
Step 1: Feature merges to main (with .changeset/*.md file)
         ↓
         publish.yml fires → sees pending changeset
         → creates "chore: version packages" PR on changeset-release/main
         → does NOT publish yet

Step 2: Merge the version PR
         ↓
         publish.yml fires again → no changeset files remain
         → runs `changeset publish`
         → packages go to npm
         → git tag created
```

**This trips everyone up the first time.** After merging your feature, a new PR appears. You have
to merge that PR too. Only then does npm get updated.

### Changeset File Format

Create `.changeset/descriptive-name.md`:

```markdown
---
'@helixir/core': minor
'@helixir/github-action': patch
---

Brief description of what changed and why.
```

Bump types:

- `patch` — bug fix, internal refactor, no new API surface (`0.2.0 → 0.2.1`)
- `minor` — new feature, new export, new option, additive change (`0.2.0 → 0.3.0`)
- `major` — breaking change: removed export, renamed param, changed return type (`0.2.0 → 1.0.0`)

Run `npx changeset` for the interactive prompt instead of writing the file by hand.

### Linked Packages

If you want `@helixir/core` and `@helixir/github-action` to always publish at the same version
(simplifies consumer dependency management), add to `.changeset/config.json`:

```json
{
  "linked": [["@helixir/core", "@helixir/github-action"]]
}
```

**Critical caveat:** `linked` only co-versions packages that **both have changesets in the same
batch**. If only one package has a changeset, only that one bumps. If your packages get out of
sync, you must create a catch-up changeset explicitly:

```markdown
---
'@helixir/core': patch
---

Sync version to match @helixir/github-action (linked packages).
```

This happened in HELiX: `@helixui/tokens` was left at `0.2.0` when `@helixui/library` shipped
`0.3.0`. Required a manual sync changeset pushed directly to `main`.
→ **Fix commit:** [`5e4d1970`](https://github.com/bookedsolidtech/helix/commit/5e4d1970)

### Enforcing Changesets in CI

Every PR that touches package source should require a changeset. Add this to your CI:

```yaml
# .github/workflows/ci.yml
changeset:
  name: Changeset Required
  needs: changes
  if: >
    github.event_name == 'pull_request' &&
    needs.changes.outputs.source == 'true'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - name: Check for changeset
      run: |
        LABELS='${{ toJson(github.event.pull_request.labels.*.name) }}'
        if echo "$LABELS" | grep -q "skip-changeset"; then
          echo "Bypassed via label."
          exit 0
        fi
        CHANGED=$(git diff --name-only "origin/${{ github.base_ref }}...HEAD" \
          | grep '^\.changeset/.*\.md$' | grep -v 'README\.md' || true)
        if [ -z "$CHANGED" ]; then
          echo "::error::No changeset found. Run: npx changeset"
          exit 1
        fi
```

Also enforce at push time via pre-push hook. See HELiX
[`scripts/pre-push-check.sh`](https://github.com/bookedsolidtech/helix/blob/main/scripts/pre-push-check.sh)
Gate 4 for the exact implementation.
→ **CI gate added:** [`632a68b8`](https://github.com/bookedsolidtech/helix/commit/632a68b8)

---

## Part 2 — How Semantic-Release Worked (Legacy — HELiXiR Migrated to Changesets)

> **Note:** HELiXiR has migrated from semantic-release to `@changesets/cli` (completed in PR #44, March 2026).
> The workflow below is preserved for historical reference. For the current publish process, see Part 1 above.
> Active config: `.changeset/config.json`, scripts `changeset:version` / `changeset:publish` in `package.json`,
> workflow `.github/workflows/publish.yml`.

HELiXiR uses `semantic-release`. No changeset files — version is derived entirely from conventional
commit messages on `main`.

### Commit → Version Mapping (from `.releaserc.json`)

| Commit type                                           | npm bump | Example                                       |
| ----------------------------------------------------- | -------- | --------------------------------------------- |
| `feat:`                                               | `minor`  | `feat: add threshold option to audit command` |
| `fix:`                                                | `patch`  | `fix: correct exit code on zero violations`   |
| `perf:`                                               | `patch`  | `perf: cache handler registry on startup`     |
| `refactor:`                                           | `patch`  | `refactor: extract violation formatter`       |
| `docs:`, `style:`, `test:`, `build:`, `ci:`, `chore:` | none     | no release triggered                          |
| `BREAKING CHANGE:` in footer                          | `major`  | any type + `BREAKING CHANGE:` footer          |

### The Release Flow

```text
Push to main → release.yml fires
              → semantic-release analyzes commits since last tag
              → if releasable commits exist:
                  bumps version in package.json
                  updates CHANGELOG.md
                  publishes to npm
                  creates GitHub Release + git tag
                  commits back: "chore(release): X.Y.Z [skip ci]"
              → if no releasable commits:
                  exits cleanly, nothing published
```

The `[skip ci]` in the release commit prevents an infinite loop.

### Monorepo Caveat — This Is Not Set Up Yet

`semantic-release` publishes **the root package** by default. Your root `package.json` is `helixir`
(the CLI), not the workspace packages. `@helixir/core` and `@helixir/github-action` in
`packages/` will **not** be published by the current config.

To publish workspace packages you need one of:

1. **`multi-semantic-release`** — runs semantic-release for each workspace package independently
2. **Switch to `@changesets/cli`** — explicit per-package control, better for monorepos
3. **Separate release.yml per package** — most explicit but most maintenance

For the near term, if `@helixir/core` and `@helixir/github-action` need independent versioning,
changesets is the better fit. If they always ship together and one version is fine, multi-semantic-release works.

---

## Part 3 — The npm Auth Setup (Both Models)

### Secrets Required

| Secret         | Purpose                                                      |
| -------------- | ------------------------------------------------------------ |
| `NPM_TOKEN`    | npm automation token — set in GitHub repo Settings → Secrets |
| `GITHUB_TOKEN` | auto-provided by Actions                                     |

### Getting the npm Token

1. Log in to npmjs.com
2. Account → Access Tokens → Generate New Token → **Automation** type
3. Add to GitHub: repo Settings → Secrets and variables → Actions → New repository secret → `NPM_TOKEN`

### The `NODE_AUTH_TOKEN` Pattern

In your workflow, `actions/setup-node` writes an `.npmrc` that uses `NODE_AUTH_TOKEN`. You must
pass your npm token as that env var:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    registry-url: 'https://registry.npmjs.org'

- name: Publish
  run: npm publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Without `registry-url` in `setup-node`, the `.npmrc` isn't written and `NODE_AUTH_TOKEN` is
ignored. This is silent — no error, just 401.

### npm Provenance (OIDC)

Add this to publish jobs for supply-chain attestation (free, recommended):

```yaml
permissions:
  id-token: write   # required for OIDC provenance

- name: Publish
  env:
    NPM_CONFIG_PROVENANCE: 'true'
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

→ **HELiX implementation:** [`publish.yml`](https://github.com/bookedsolidtech/helix/blob/main/.github/workflows/publish.yml)

---

## Part 4 — Bugs Hit in Production (Don't Repeat These)

### Bug 1 — Husky blocks CI git operations

**Symptom:** Version bump commit in CI fails. Hook runs inside Actions and tries to execute
local tooling that doesn't exist in CI environment.

**Fix:** Set `HUSKY: '0'` in the publish job env. This tells husky to skip all hooks for that
process. Do NOT use `--no-verify` on individual commands — the env var is cleaner and covers
all git operations in the job.

```yaml
env:
  HUSKY: '0'
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

→ **Fix commit:** [`100c5907`](https://github.com/bookedsolidtech/helix/commit/100c5907)
→ **PR:** [#850](https://github.com/bookedsolidtech/helix/pull/850)

---

### Bug 2 — Linked packages version mismatch

**Symptom:** After a release, one linked package is at `0.3.0` on npm, the other is still at
`0.2.0`. The publish log says:

```text
🦋  warn @helixui/tokens is not being published because version 0.2.0 is already published on npm
```

**Root cause:** The changeset only listed one package. The `linked` config does not auto-include
the other package unless it also has a changeset entry in the same batch.

**Fix:** Create a sync changeset:

```markdown
---
'@helixir/core': patch
---

Sync version to match @helixir/github-action (linked packages).
```

**Prevention:** Always include both linked packages in every changeset. The `npx changeset`
interactive prompt makes it easy — hit spacebar on both packages before confirming.

→ **Fix commit:** [`5e4d1970`](https://github.com/bookedsolidtech/helix/commit/5e4d1970)

---

### Bug 3 — Wrong homepage URL in published package

**Symptom:** npmjs.com package page shows a 404 link. The `package.json` `homepage` field
has the wrong domain.

**Fix:** Verify `homepage`, `repository`, and `bugs` fields in every `package.json` before
first publish. These are baked into the published tarball and visible on the npm page.

Correct format for this org:

```json
{
  "homepage": "https://helix.bookedsolid.tech",
  "repository": {
    "type": "git",
    "url": "https://github.com/bookedsolidtech/helix.git"
  },
  "bugs": "https://github.com/bookedsolidtech/helix/issues"
}
```

**There is no `.com` domain. It is always `.tech`.**

→ **Fix commit:** [`819759fa`](https://github.com/bookedsolidtech/helix/commit/819759fa)
→ **Shipped in:** `@helixui/library@0.3.1`, `@helixui/tokens@0.3.1`

---

### Bug 4 — Changeset job not evaluated in quality-gates

**Symptom:** The `changeset` CI job passes or fails but the aggregate `quality-gates` job
doesn't catch it — a PR can merge even if the changeset gate failed.

**Root cause:** The `quality-gates` job `needs` array included `changeset`, but the shell
script checking results only looped over hard gates (`lint`, `format`, `type-check`, `build`,
`audit`). Changeset was never evaluated.

**Fix:** Add `changeset` to the optional gates loop (skipped/cancelled = ok, failure = block):

```yaml
for gate in test vrt changeset; do
  case "$gate" in
    test)      result="${{ needs.test.result }}" ;;
    vrt)       result="${{ needs.vrt.result }}" ;;
    changeset) result="${{ needs.changeset.result }}" ;;
  esac
  if [[ "$result" != "success" && "$result" != "skipped" && "$result" != "cancelled" ]]; then
    echo "::error::Gate '$gate' did not succeed: $result"
    FAIL=1
  fi
done
```

→ **Fix commit:** [`270b05e5`](https://github.com/bookedsolidtech/helix/commit/270b05e5)
→ **PR:** [#850](https://github.com/bookedsolidtech/helix/pull/850) (CodeRabbit caught this)

---

### Bug 5 — CHANGELOG content wrong for linked package

**Symptom:** `@helixui/tokens` CHANGELOG showed detailed component-level changes under
`### Patch Changes` — but tokens is a design-token package and has no components. The content
belonged in `@helixui/library`.

**Root cause:** The changeset description was copied verbatim to both packages' CHANGELOGs
because they are linked. The changeset text should have been scoped to what actually changed
in that package.

**Fix:** When writing changeset descriptions, write from the perspective of what the **consumer
of that specific package** would care about. For a version-sync changeset on a linked package,
just say so:

```markdown
---
'@helixui/tokens': minor
---

Version bump to stay in sync with @helixui/library@0.2.0 (linked packages).
No token value changes in this release.
```

→ **Fix commit:** [`2372a514`](https://github.com/bookedsolidtech/helix/commit/2372a514)

---

### Bug 6 — Pushing to `staging` after HITL PR is open creates conflicts

**Symptom:** staging→main PR shows `CONFLICTING` / `DIRTY` on GitHub after a direct push
to `staging`.

**Root cause:** Once a PR from `staging → main` is open, any direct push to `staging` that
diverges from what `main` expects creates a merge conflict. This is standard git — but it's
easy to forget when making a hotfix.

**Fix:** Use `git merge main` on staging and resolve, then push the merge commit. Never
force-push staging.

**Prevention:** Once a HITL PR is open, do not push directly to `staging`. If a fix is needed,
commit it to a branch, get it merged to `dev`, then re-promote.

→ **Resolution:** [`fde8a1dd`](https://github.com/bookedsolidtech/helix/commit/fde8a1dd)

---

## Part 5 — Pre-Push Hook Gotcha

The pre-push hook uses `git remote show origin` to detect the default branch for changeset
diffing. This makes a **network call on every push** — slow and fragile in offline/slow
environments.

Better approach (no network call):

```bash
BASE_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null \
  | sed 's|refs/remotes/origin/||' \
  || git rev-parse --abbrev-ref origin/HEAD 2>/dev/null \
  | sed 's|origin/||' \
  || echo "main")
```

→ **Fix commit:** [`2372a514`](https://github.com/bookedsolidtech/helix/commit/2372a514)

---

## Part 6 — Checklist Before First Publish

Run through this before merging anything that will trigger a release:

- [ ] `package.json` `name` matches npm scope (`@helixir/core`, not `helixir-core`)
- [ ] `package.json` `version` is set (changesets will manage it after; semantic-release will overwrite it)
- [ ] `homepage` is `https://helix.bookedsolid.tech` (not `.com`)
- [ ] `repository.url` points to correct GitHub repo
- [ ] `files` array in `package.json` includes only what consumers need (not `src/`, tests, etc.)
- [ ] `exports` map is correct — test with `npm pack --dry-run`
- [ ] `NPM_TOKEN` secret is set in GitHub repo Settings
- [ ] `HUSKY: '0'` is in the publish job env
- [ ] `id-token: write` permission is on the publish job (for provenance)
- [ ] `NPM_CONFIG_PROVENANCE: 'true'` is in the publish job env
- [ ] For changesets: `.changeset/config.json` has correct package names in `linked` array
- [ ] For changesets: `ignore` list excludes non-publishable packages (Storybook, docs, admin apps)

---

## Part 7 — Key Files Reference (HELiX, copy what you need)

| File                                                                                                        | What it does                                 |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [`publish.yml`](https://github.com/bookedsolidtech/helix/blob/main/.github/workflows/publish.yml)           | Full publish pipeline with OIDC provenance   |
| [`ci.yml`](https://github.com/bookedsolidtech/helix/blob/main/.github/workflows/ci.yml)                     | Changeset gate + quality-gates aggregate job |
| [`.changeset/config.json`](https://github.com/bookedsolidtech/helix/blob/main/.changeset/config.json)       | Linked packages, ignored packages            |
| [`scripts/pre-push-check.sh`](https://github.com/bookedsolidtech/helix/blob/main/scripts/pre-push-check.sh) | Gate 4: changeset enforcement at push time   |

---

## Part 8 — npm Scope

The org npm scope is `@helixui` for HELiX packages and `@helixir` for HELiXiR packages.

**`@helix` is taken by an unrelated party on npmjs.com. Never use it.**

The npm org is owned by `himerus`. To publish under `@helixir`, that scope must be registered
and the publishing token must belong to an account with write access to it.

---

_Last updated: 2026-03-12 — reflects HELiX publish pipeline through `@helixui/library@0.3.1` / `@helixui/tokens@0.3.1`_
