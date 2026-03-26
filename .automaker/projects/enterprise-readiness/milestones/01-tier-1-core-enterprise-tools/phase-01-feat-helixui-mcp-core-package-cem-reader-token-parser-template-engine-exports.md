# Phase 1: feat: @helixui/mcp core package — CEM reader, token parser, template engine exports

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create the @helixui/mcp package in packages/mcp/ that re-exports helixir's core engine (CEM reader, token parser, template utilities) as a standalone npm package. Enterprise teams install this to build custom MCP tools on top of helixir's analysis engine. Must include TypeScript declarations and comprehensive JSDoc.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp/package.json`
- [ ] `packages/mcp/src/index.ts`
- [ ] `packages/mcp/tsconfig.json`
- [ ] `pnpm-workspace.yaml`

### Verification
- [ ] packages/mcp/ exists with package.json (@helixui/mcp)
- [ ] Exports CEM reader, token parser, template engine, and type declarations
- [ ] npm pack produces a valid package
- [ ] README with API documentation and usage examples
- [ ] At least 20 tests covering public API surface

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 1 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 2
