---
tags: [performance]
summary: performance implementation decisions and patterns
relevantTo: [performance]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 3
  referenced: 3
  successfulFeatures: 3
---
# performance

#### [Gotcha] Algorithm complexity bounds must explicitly match input bounds - static code inspection cannot surface quadratic DoS from obvious operations (2026-03-04)
- **Situation:** validate_usage accepted unbounded html strings and used them in Levenshtein distance computation (O(n×m) complexity), causing 747ms execution for 5000 characters. This wasn't caught by static analysis because the operation looks benign
- **Root cause:** Levenshtein matching is inherently quadratic but the cost is non-obvious from reading the code. Without an explicit max() bound on input, the feature becomes a DoS vector despite looking safe
- **How to avoid:** Adding z.string().max(50_000) + LEVENSHTEIN_MAX check in code means two places to maintain bounds, but splitting them catches different attack vectors: max() prevents huge inputs, loop bound prevents algorithmic explosion on edge cases