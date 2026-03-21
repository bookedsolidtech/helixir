---
'@anthropic/helixir-core': minor
---

Add `resolve_css_api` MCP tool — resolves every `::part()`, CSS custom property, and slot reference against actual component CEM data. Catches hallucinated part names, invalid token names, and unknown slot names with fuzzy match suggestions.
