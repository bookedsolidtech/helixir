---
'helixir': patch
---

Security and correctness fixes from deep antagonistic audit

- Add path containment validation to CEM-derived file reads preventing directory traversal
- Harden false-positive test assertions to eliminate misleading test results
- 13 security, correctness, and staleness fixes across the codebase
- Mark internal packages (@helixir/core, @helixir/github-action) as private to fix publish pipeline
