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

## Relationship to Preflight

act-ci is **Gate 7** inside `pnpm run preflight` (`scripts/preflight.sh`).
It runs automatically if `act` is installed and Docker is running.

- Docker + act available → Gate 7 runs, hard fail if it fails
- Docker not running → Gate 7 skips with warning
- `SKIP_ACT=1` → Gate 7 skips explicitly

This means any caller of `pnpm run preflight` gets the Docker CI gate
automatically — git hooks, agents, humans, CI. One command, all gates.

## Requirements

- Docker must be running (`docker info`)
- act must be installed (`brew install act`)
- `.actrc` must exist in repo root (checked in)

## For Agents

Do NOT call `./scripts/act-ci.sh` separately. It runs automatically as Gate 7
inside `pnpm run preflight`, which the pre-push hook calls. Just `git push` —
if Docker is available, the act-ci gate runs. If it fails, fix and retry.

See `agent-push-protocol.md`.
