# Phase 4: feat: validation CI action — @helixir/github-action ready for enterprise CI pipelines

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Prepare the @helixir/github-action package for enterprise use. The action should run CEM validation + health scoring on every PR, with configurable grade thresholds. Enterprise teams drop this into their CI to gate component quality.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/github-action/action.yml`
- [ ] `packages/github-action/src/index.ts`

### Verification
- [ ] packages/github-action/ has working action.yml
- [ ] Runs CEM validation and health scoring on PR diff
- [ ] Configurable: grade threshold, dimensions to check, fail-on-warning
- [ ] README with usage examples for GitHub Actions workflows
- [ ] Tested against sample component PR

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
