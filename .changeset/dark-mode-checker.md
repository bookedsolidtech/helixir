---
'helixir': minor
'@helixir/core': minor
---

Add check_dark_mode_patterns tool — detects dark mode styling anti-patterns specific to Shadow DOM: theme-scoped selectors setting standard CSS properties on web component hosts (won't reach internals), @media prefers-color-scheme blocks with shadow DOM piercing, and descendant selectors inside theme scopes. Integrated into validate_component_code, styling_preflight, and validate_css_file.
