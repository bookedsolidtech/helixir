# Changesets

This directory contains changeset files that track unreleased changes across helixir's packages.

## How to add a changeset

When making changes that should result in a version bump, run:

```bash
npx changeset
```

This will prompt you to:

1. Select the affected packages (`helixir`, `@helixir/core`, `@helixir/github-action`)
2. Choose the bump type (`patch`, `minor`, or `major`)
3. Write a summary of the change

Commit the generated `.changeset/*.md` file along with your code changes.

## Bump type guide

- **patch** — bug fixes, docs, minor tweaks (0.0.x)
- **minor** — new features, backwards-compatible additions (0.x.0)
- **major** — breaking changes (x.0.0)

## How publishing works (two-step)

1. Your PR merges to `main` with a `.changeset/*.md` file → the publish workflow creates a "chore: version packages" PR
2. Merging that version PR → packages are published to npm and git tags are created

For infra/CI-only PRs that don't need a version bump, add the `skip-changeset` label to bypass the changeset gate.
