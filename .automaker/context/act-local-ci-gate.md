# Local Docker CI Gate — act

## Overview

This project uses [nektos/act](https://github.com/nektos/act) to run GitHub Actions
workflows locally inside Docker containers before any code is pushed to GitHub.

**This is a MANDATORY quality gate. Code does not push to GitHub until act passes.**

## How It Works

```
Agent commits → ./scripts/act-ci.sh (Docker) → push
```

The act workflow (`.github/workflows/act-ci.yml`) runs all quality gates sequentially
in a single Docker container using `corepack` instead of GitHub-specific actions
that don't work in local Docker.

## Gates (run sequentially in one job)

| Gate | What it checks | Command |
|------|---------------|---------|
| lint | ESLint | `pnpm run lint` |
| format | Prettier check | `pnpm run format:check` |
| type-check | TypeScript strict | `pnpm run type-check` |
| build | TypeScript compilation | `pnpm run build` |
| test | Vitest (Node mode) | `pnpm run test` |

## Commands

```bash
./scripts/act-ci.sh                 # Run all quality gates
./scripts/act-ci.sh --native        # Use ARM64 (recommended on Apple Silicon)
./scripts/act-ci.sh --clean         # Remove stale containers first
./scripts/act-ci.sh --list          # List available jobs
```

**Apple Silicon:** Always use `--native` to avoid Rosetta emulation overhead and
Docker RWLayer corruption bugs with amd64 containers.

## Relationship to Pre-Push Hook

The pre-push git hook runs `pnpm run preflight` automatically on every push.
This is the **primary** quality gate — it runs natively without Docker.

act-ci is the **secondary** gate — it runs the same checks inside Docker
containers matching the GitHub Actions environment. Use act-ci for:
- Extra confidence before pushing critical changes
- Debugging CI-specific failures (environment differences)
- Verifying the Docker-based pipeline still works

For most pushes, the pre-push hook is sufficient. act-ci adds ~15s but
guarantees exact GitHub Actions parity.

## Requirements

- Docker must be running (`docker info`)
- act must be installed (`brew install act`)
- `.actrc` must exist in repo root (checked in)

## For Agents

Before every `git push`, run `./scripts/act-ci.sh --native`. If it fails, fix the
issue and re-run. Do NOT push code that fails the local Docker CI gate.

This is not a suggestion. This is a hard gate. See `agent-push-protocol.md`.
