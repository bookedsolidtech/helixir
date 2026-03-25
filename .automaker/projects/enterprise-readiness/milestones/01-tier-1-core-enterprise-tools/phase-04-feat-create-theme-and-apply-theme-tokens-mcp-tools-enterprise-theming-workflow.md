# Phase 4: feat: create_theme and apply_theme_tokens MCP tools — enterprise theming workflow

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Two new MCP tools: create_theme scaffolds a complete enterprise theme (design tokens file, dark mode variant, color-scheme declarations) following patterns that detect_theme_support already analyzes. apply_theme_tokens takes a theme definition and shows how to apply it to specific components with correct CSS custom property overrides.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/core/src/handlers/theme.ts`
- [ ] `packages/core/src/tools.ts`

### Verification
- [ ] create_theme generates a complete theme scaffold with token variables
- [ ] apply_theme_tokens shows per-component token application
- [ ] Both tools leverage detect_theme_support analysis patterns
- [ ] Generated themes include light/dark mode, color-scheme, and prefers-color-scheme
- [ ] Tests verify theme output and token application correctness

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 4 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 5
