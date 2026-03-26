# Phase 3: feat: extend_component MCP tool — subclass existing components with proper inheritance

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

New MCP tool that takes an existing Helix component and generates a properly subclassed version with correct inheritance chain, CEM entries, type declarations, and Shadow DOM style forwarding. Prevents common extension anti-patterns.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/core/src/handlers/extend.ts`
- [ ] `packages/core/src/tools.ts`

### Verification
- [ ] extend_component handler registered and callable via MCP
- [ ] Generates subclass with correct extends, CEM @customElement annotation
- [ ] Preserves parent CSS parts and slots, adds extension points
- [ ] Includes warnings about Shadow DOM style encapsulation implications
- [ ] Tests verify inheritance chain and generated type declarations

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
