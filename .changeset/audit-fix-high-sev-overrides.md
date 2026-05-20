---
'helixir': patch
---

chore(deps): clear high-severity transitive vulnerabilities

Adds pnpm overrides to patch 13 high-severity transitive advisories
(tar, vite, picomatch, lodash, path-to-regexp, flatted, hono) to their
fixed releases within the same major version. No breaking changes; build
and full test suite pass. Brings `pnpm audit --audit-level=high` to zero.
