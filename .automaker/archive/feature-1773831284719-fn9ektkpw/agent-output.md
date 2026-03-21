
🔧 Tool: Glob
Input: {
  "pattern": ".github/workflows/*.yml"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-exempt-promotion-prs-from-changeset/.github/workflows/changeset.yml"
}
The fix is straightforward — add a condition to skip the job when the PR targets `staging` or `main` (promotion PRs).

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-exempt-promotion-prs-from-changeset/.github/workflows/changeset.yml",
  "old_string": "jobs:\n  changeset:\n    name: Changeset Required\n    runs-on: ubuntu-latest\n    timeout-minutes: 2\n    steps:",
  "new_string": "jobs:\n  changeset:\n    name: Changeset Required\n    runs-on: ubuntu-latest\n    timeout-minutes: 2\n    # Skip changeset check on promotion PRs (dev→staging, staging→main)\n    if: |\n      github.event.pull_request.base.ref != 'staging' &&\n      github.event.pull_request.base.ref != 'main'\n    steps:"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-exempt-promotion-prs-from-changeset/.github/workflows/changeset.yml"
}

🔧 Tool: Bash
Input: {
  "command": "git diff --stat",
  "description": "Check diff"
}
Only the one intended file changed. The Playwright verification requirement doesn't apply here — this is a GitHub Actions workflow file with no runtime to test locally. The logic is purely declarative YAML.

<summary>
## Summary: Fix Exempt Promotion PRs from Changeset

### Changes Implemented
- Added a job-level `if` condition to `.github/workflows/changeset.yml` that skips the "Changeset Required" check when the PR targets `staging` or `main` (promotion PRs: dev→staging, staging→main)

### Files Modified
- `.github/workflows/changeset.yml` — 4 lines added

### Risks/Blockers Encountered
- None. The fix is minimal and targeted.

### Learnings
- Using a job-level `if` condition with `github.event.pull_request.base.ref` is the cleanest approach — the job is skipped entirely (reports as skipped, not failed), so it won't block auto-merge
- The existing `skip-changeset` label bypass is preserved for feature PRs that don't need a changeset

### Notes for Developer
- Playwright verification skipped — this is a GitHub Actions YAML workflow; there is no local runtime to test. Logic correctness can be verified by reading the condition.
- Feature PRs targeting `dev` still require changesets as before — only PRs with `base.ref == 'staging'` or `base.ref == 'main'` are exempt.
- The workflow still triggers on pushes to all three branches per the `on.pull_request.branches` list; the skip is at the job level, not the trigger level.

### Verification Status
- Confirmed only 1 file changed (`git diff --stat`)
- Logic reviewed against all 3 acceptance criteria: ✅ promotion PRs skip check, ✅ feature PRs to `dev` still require changesets, ✅ auto-merge no longer blocked by stale check on promotion PRs
</summary>