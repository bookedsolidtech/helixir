---
'helixir': patch
'@helixir/core': patch
---

Add antiPatterns array to get_component_quick_ref output — returns component-specific "don't do this" examples (shadow DOM piercing, ::part() chaining, :root scope, hardcoded colors, invalid slots) using the component's actual tag name, part names, and token names
