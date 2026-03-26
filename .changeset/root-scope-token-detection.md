---
'@anthropic/helixir-core': minor
---

Add :root scope token detection to shadow DOM checker and suggest-fix pipeline

Detects component CSS custom properties set on :root (which have no effect through Shadow DOM)
and suggests moving them to the host element. Wired into both styling_preflight and
css-file-validator inline fix generation.
