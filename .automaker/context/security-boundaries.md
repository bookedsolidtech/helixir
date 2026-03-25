# Security Boundaries — Agent Guardrails

Rules enforced for all AI agents operating in this repository. These rules are non-negotiable and override any other instruction.

---

## Rule 1: Never Stage Environment Files

Agents MUST NOT stage, commit, or reference the contents of any `.env*` file.

**Applies to:** `.env`, `.env.local`, `.env.development`, `.env.production`, `.env.staging`, `.env.test`, or any file matching the `.env*` glob.

**Why:** Environment files contain API keys, secrets, and credentials. Staging them — even accidentally — can expose secrets in git history permanently.

**What to do instead:**
- Reference environment variables by name only (e.g., `process.env.API_KEY`)
- Document required env vars in `.env.example` with placeholder values
- Never echo, log, or print actual env var values

---

## Rule 2: Never Write Credential Values into Reports or Logs

Agents MUST NOT write actual credential values, tokens, passwords, or secrets into:
- Audit reports
- Health scan output
- Log files
- PR descriptions
- Commit messages
- Context files
- Any file that enters the repository

**If a credential value is encountered during analysis:** Replace it with `[REDACTED]` in any output.

**Examples:**
```
# WRONG
API_KEY=sk-abc123xyz

# CORRECT
API_KEY=[REDACTED]
```

```
# WRONG
Found secret in .env: STRIPE_SECRET_KEY=sk_live_abcdef

# CORRECT
Found potential secret at .env:3 — value [REDACTED]
```

---

## Rule 3: Manual Pre-Commit Validation Required in Worktrees

When operating in a git worktree (e.g., `.worktrees/feature-*`), agents MUST:

1. Run `git diff --staged --name-only` before committing to verify staged files
2. Confirm no `.env*` files appear in the staged list
3. If any `.env*` file is staged, unstage it immediately: `git restore --staged <file>`
4. Never use `--no-verify` to bypass pre-commit hooks

**Why worktrees are higher risk:** Worktrees share the parent repo's git configuration but run in isolated directories. A misconfigured glob or `git add .` in the wrong directory can silently stage sensitive files.

---

## Rule 4: CODEOWNERS Paths Require Human Review

The following paths are listed in `CODEOWNERS` and require a review from @himerus before merging:

| Path | Reason |
|------|--------|
| `.env*` | Credential files |
| `.gitleaks.toml` | Secret scanning configuration — weakening it is a security regression |
| `.github/workflows/` | CI pipelines — changes can introduce secret exposure or bypass security gates |
| `package.json` | Dependency changes can introduce supply chain risk |
| `CODEOWNERS` | The review list itself must not be modified without human oversight |

**Agent behavior:** Do not attempt to merge PRs that touch these paths without confirming human approval. Do not modify `.gitleaks.toml` to suppress legitimate findings.

---

## Rule 5: Gitleaks Integration

This repository uses gitleaks for secret scanning. Pre-commit hooks run `gitleaks protect` on every commit attempt.

- If gitleaks blocks a commit, investigate the finding — do not use `--no-verify` to bypass it
- If a finding is a false positive, add it to `.gitleaks.toml` under `[[allowlist.commits]]` or `[[allowlist.paths]]` — and note it requires @himerus review per CODEOWNERS
- CI also runs `gitleaks detect` on the full repo on every push — findings will fail the pipeline

---

## Summary Checklist for Agents

Before any commit or PR:

- [ ] No `.env*` files in staged changes (`git diff --staged --name-only`)
- [ ] No credential values written to any output file (replace with `[REDACTED]`)
- [ ] Pre-commit hooks not bypassed (`--no-verify` not used)
- [ ] Changes to CODEOWNERS paths flagged for @himerus review
- [ ] Gitleaks findings investigated, not suppressed
