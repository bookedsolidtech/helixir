---
tags: [performance]
summary: performance implementation decisions and patterns
relevantTo: [performance]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 8
  referenced: 3
  successfulFeatures: 3
---
# performance

#### [Gotcha] Algorithm complexity bounds must explicitly match input bounds - static code inspection cannot surface quadratic DoS from obvious operations (2026-03-04)
- **Situation:** validate_usage accepted unbounded html strings and used them in Levenshtein distance computation (O(n×m) complexity), causing 747ms execution for 5000 characters. This wasn't caught by static analysis because the operation looks benign
- **Root cause:** Levenshtein matching is inherently quadratic but the cost is non-obvious from reading the code. Without an explicit max() bound on input, the feature becomes a DoS vector despite looking safe
- **How to avoid:** Adding z.string().max(50_000) + LEVENSHTEIN_MAX check in code means two places to maintain bounds, but splitting them catches different attack vectors: max() prevents huge inputs, loop bound prevents algorithmic explosion on edge cases

### Converted readPackageJsonDeps and detectFramework from sync (readFileSync) to async (readFile from node:fs/promises) (2026-03-12)
- **Context:** Framework detection requires reading package.json from disk; sync I/O blocks the Node.js event loop during handler execution
- **Why:** Async file I/O prevents blocking the event loop, allowing other requests/tasks to proceed while waiting for disk reads — critical in server/handler contexts where throughput matters
- **Rejected:** readFileSync is simpler and requires no async/await propagation through the call stack, but it blocks all concurrent operations on the thread during I/O wait
- **Trade-offs:** Async requires await propagation up the entire call chain (all callers must also be async), adding boilerplate; gains non-blocking I/O and better concurrency under load
- **Breaking if changed:** If any caller of detectFramework or readPackageJsonDeps is not async-aware and drops the await, it will receive a Promise object instead of the resolved value, silently producing incorrect framework detection results

#### [Pattern] Hoist repeated array transformations (map/filter) to shared scope when the same derived array is consumed in multiple downstream computations within the same function (2026-03-21)
- **Problem solved:** In the CSS architecture analyzer, cssProperties.map(p => p.name.toLowerCase()) was called twice in the same function — once inside the theming score block and again for the coveredCategoryNames derivation.
- **Why this works:** Both computations depended on identical lowercased property names. Shared derivation is a single-responsibility principle application: the transformation is defined once and consumed where needed, avoiding divergence risk if the transformation logic changes.
- **Trade-offs:** Hoisting to outer scope means propertyNames is computed even if cssProperties is empty (the if-block would have skipped it). This is acceptable since map() on an empty array is O(0) and the outer-scope variable is still used by coveredCategoryNames regardless.