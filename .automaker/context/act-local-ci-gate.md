# Local Docker CI Gate — act

## Overview

This project uses [nektos/act](https://github.com/nektos/act) to run GitHub Actions
workflows locally inside Docker containers before any code is pushed to GitHub.

**This is a MANDATORY quality gate. Code does not push to GitHub until act passes.**

## How It Works

```
Agent commits → ./scripts/act-ci.sh (Docker) → push
```

The act workflow (`.github/workflows/act-ci.yml`) mirrors the core quality gates
from the production CI but uses `corepack` instead of GitHub-specific actions
that don't work in local Docker.

## Jobs in the Local CI

| Job | What it checks | Command |
|-----|---------------|---------|
| lint | ESLint | `pnpm run lint` |
| format | Prettier check | `pnpm run format:check` |
| type-check | TypeScript strict | `pnpm run type-check` |
| build | TypeScript compilation | `pnpm run build` |
| test | Vitest (Node mode) | `pnpm run test` |
| quality-gates | Aggregate — ALL above must pass | — |

## Commands

```bash
./scripts/act-ci.sh              # Run all quality gates
./scripts/act-ci.sh --job lint   # Run a specific job
./scripts/act-ci.sh --job test   # Run tests only
./scripts/act-ci.sh --list       # List available jobs
```

## Requirements

- Docker must be running (`docker info`)
- act must be installed (`brew install act`)
- `.actrc` must exist in repo root (checked in)

## For Agents

Before every `git push`, run `./scripts/act-ci.sh`. If it fails, fix the issue
and re-run. Do NOT push code that fails the local Docker CI gate.

This is not a suggestion. This is a hard gate. See `agent-push-protocol.md`.
