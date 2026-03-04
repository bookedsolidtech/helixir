---
tags: [validation]
summary: validation implementation decisions and patterns
relevantTo: [validation]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 9
  referenced: 7
  successfulFeatures: 7
---
# validation

### Used Zod `.refine()` with `.includes('\0')` string search instead of regex or format-based validation for null byte detection. (2026-03-04)
- **Context:** FilePathSchema uses a refine callback: `.refine((p) => !p.includes('\0'), ...)` rather than a compiled regex pattern or Zod format specifier.
- **Why:** Clarity and directness—null byte checking is a straightforward string operation. Using `.includes()` is more readable than a regex pattern, and the performance cost (O(n) vs. compiled regex) is negligible for typical file paths.
- **Rejected:** Regex approach (`/\0/`) would be less readable for this simple check. Format validators (like Zod's `.url()` or `.email()`) are designed for structured formats, not binary character rejection.
- **Trade-offs:** Simpler code and easier to understand vs. potential microsecond performance loss on very long paths. For file paths (typically <260 chars), refine is the right choice.
- **Breaking if changed:** If validation were changed to rely only on format validators or removed the refine, null bytes would no longer be rejected. The refine is the only enforcement point.