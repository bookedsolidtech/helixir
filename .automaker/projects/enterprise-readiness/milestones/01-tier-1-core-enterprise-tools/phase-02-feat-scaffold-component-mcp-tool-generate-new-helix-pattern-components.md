# Phase 2: feat: scaffold_component MCP tool — generate new Helix-pattern components

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

New MCP tool that generates a complete Helix-pattern component: Lit class with decorators, CEM annotations, test stub, Storybook story, CSS part/slot structure, and TypeScript declarations. Follows existing library conventions detected from CEM analysis. Must use template engine from @helixui/mcp core.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/core/src/handlers/scaffold.ts`
- [ ] `packages/core/src/tools.ts`

### Verification
- [ ] scaffold_component handler registered and callable via MCP
- [ ] Generates: component class, test file, story file, CSS structure
- [ ] Output follows conventions detected from the target library's CEM
- [ ] Supports options: tag name, base class, slots, CSS parts, events, properties
- [ ] Tests verify generated output compiles and matches expected patterns

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 2 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 3
