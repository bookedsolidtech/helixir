I'll start by reading the key source files to understand the current accessibility analyzer implementation.

🔧 Tool: Agent
Input: {
  "description": "Explore accessibility analyzer codebase",
  "subagent_type": "Explore",
  "prompt": "Thoroughly explore the HELiXiR codebase to find all accessibility-related code. I need:\n\n1. The accessibility analyzer source code - look for files matching patterns like:\n   - src/analyzers/accessibility-analyzer.ts\n   - src/**/accessibility*.ts\n   - src/**/a11y*.ts\n   - Any file containing \"accessibility\" in src/\n\n2. The MCP tools related to accessibility scoring:\n   - src/mcp/tools/score-component.ts or similar\n   - src/mcp/tools/analyze-accessibility.ts or similar\n   - Any file in src/tools/ or src/mcp/ related to accessibility or scoring\n\n3. The health scoring/weight configuration:\n   - Look for where dimension weights are defined (accessibility weight of 10 or 20)\n   - src/scoring/ or src/health/ directories\n   - Any config files with weight definitions\n\n4. Component analysis patterns - how does the analyzer detect the 8 signals (disabled field, label support, focus method, accessibility description, form association, ARIA role, ARIA attributes, keyboard events)?\n\nWorking directory: /Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension\n\nSearch very thoroughly - check all naming conventions and directory structures."
}

🔧 Tool: Glob
Input: {
  "pattern": "src/**/accessibility*.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "src/**/a11y*.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "src/analyzers/**/*.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "src/mcp/tools/**/*.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "src/tools/**/*.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "src/scoring/**/*.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "src/health/**/*.ts"
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension -type f -name \"*.ts\" -o -name \"*.tsx\" -o -name \"*.js\" | head -50",
  "description": "List TypeScript and JavaScript files to understand the structure"
}

🔧 Tool: Bash
Input: {
  "command": "ls -la /Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/",
  "description": "List root directory contents"
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/src -type d | sort",
  "description": "List all directories in src"
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/src -type f -name \"*.ts\" | sort",
  "description": "List all TypeScript files in src"
}

🔧 Tool: Grep
Input: {
  "pattern": "accessibility",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/src",
  "output_mode": "files_with_matches"
}

🔧 Tool: Grep
Input: {
  "pattern": "a11y",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/src",
  "output_mode": "files_with_matches"
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/src -type f \\( -name \"*.ts\" -o -name \"*.json\" \\) | xargs ls -la | head -80",
  "description": "List all source files"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/src/index.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/src/mcp/index.ts"
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension -type f -name \"*.ts\" -path \"*/packages/*\" | head -20",
  "description": "Find TypeScript files in packages directory"
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src -type f -name \"*.ts\" | sort",
  "description": "List all TypeScript files in packages/core/src"
}

🔧 Tool: Grep
Input: {
  "pattern": "accessibility|a11y",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src",
  "output_mode": "files_with_matches"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/accessibility.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/analyzers/source-accessibility.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/tools/health.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/health.ts",
  "limit": 150
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/dimensions.ts",
  "limit": 200
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/tools/component.ts",
  "limit": 150
}

🔧 Tool: Bash
Input: {
  "command": "grep -r \"disabled\\|label\\|focus\\|keyboard\\|aria\" /Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/accessibility.ts | head -20",
  "description": "Show accessibility patterns"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/analyzers/index.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/health.ts",
  "offset": 150,
  "limit": 300
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/health.ts",
  "offset": 550,
  "limit": 300
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/health.ts",
  "offset": 850,
  "limit": 350
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/dimensions.ts",
  "offset": 200,
  "limit": 150
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/tests -name \"*accessibility*\" -o -name \"*health*\" | sort",
  "description": "Find test files related to accessibility and health"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/tests/handlers/accessibility.test.ts",
  "limit": 200
}

🔧 Tool: Bash
Input: {
  "command": "git log --oneline -20",
  "description": "Show recent git commits"
}

🔧 Tool: Bash
Input: {
  "command": "git log --oneline --grep=\"accessibility\" -10",
  "description": "Search for accessibility-related commits"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/planning.md",
  "limit": 300
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src -type f -name \"*.ts\" | wc -l",
  "description": "Count total TypeScript files"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/dimensions.ts",
  "offset": 40,
  "limit": 100
}
Excellent. Now let me read the key source files directly to get precise details for the proposal.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/accessibility.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/analyzers/source-accessibility.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/dimensions.ts"
}
Now let me check how the accessibility scoring is integrated in the health handler and verify the `.automaker/context` directory exists.

🔧 Tool: Grep
Input: {
  "pattern": "Accessibility|analyzeAccessibility|analyzeSourceAccessibility",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/health.ts",
  "output_mode": "content",
  "-n": true
}

🔧 Tool: Bash
Input: {
  "command": "ls /Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/.automaker/context/ 2>/dev/null || echo \"Directory does not exist\"",
  "description": "Check .automaker/context directory"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/packages/core/src/handlers/health.ts",
  "offset": 855,
  "limit": 60
}
I now have a complete picture. Let me create the enhancement proposal document.

🔧 Tool: Write
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-expert-audit-accessibility-dimension/.automaker/context/accessibility-enhancement-proposal.md",
  "content": "# Accessibility Dimension Enhancement Proposal\n\n**Author:** accessibility-engineer agent\n**Date:** 2026-03-19\n**Status:** Proposal\n**Dimension:** Accessibility (weight: 10, tier: Critical)\n\n---\n\n## Executive Summary\n\nHELiXiR's accessibility scoring is more mature than the feature description suggests. The system already has **two analysis layers**: CEM-level heuristic analysis (8 signals) and source-level regex scanning (7 markers), blended at 30/70 weight. However, significant gaps remain against WCAG 2.1 AA requirements, the dimension weight undervalues its Critical tier importance, and the confidence level is permanently stuck at `heuristic` with no path to `verified`. This proposal recommends 5 concrete improvements ranked by impact.\n\n---\n\n## 1. Current State Assessment\n\n### Layer 1: CEM Heuristic Analysis (`accessibility.ts`)\n\n8 signals scored against CEM metadata. Total: 100 points.\n\n| Signal | Weight | Detection Method | Known Issues |\n|--------|--------|------------------|--------------|\n| `hasDisabled` | 25 | Field named `disabled` | **False negative:** Components using `inert` or custom disabled patterns missed |\n| `hasLabelSupport` | 20 | Slot or member named `label` | **False negative:** Components using `aria-label`/`aria-labelledby` instead of a `label` slot score 0 |\n| `hasFocusMethod` | 20 | Method with \"focus\" in name | **False positive:** `unfocus()`, `focusOnInit()` match but aren't a11y patterns |\n| `accessibilityDescription` | 10 | Description mentions a11y terms | **Fragile:** Depends on documentation quality, not implementation |\n| `hasFormAssociation` | 10 | `formAssociated`, `internals`, name+value+disabled triple | Reasonably robust |\n| `hasAriaRole` | 5 | CSS prop named \"role\", description, or tag-name suffix | **False positive:** Tag-name inference (`-button` suffix) assumes role without verifying |\n| `hasAriaAttributes` | 5 | Members starting with `aria-` | Only detects documented attributes; misses runtime bindings |\n| `hasKeyboardEvents` | 5 | Events named key*/focus/blur | Only detects documented events; misses source-level handlers |\n\n**CEM-layer limitations:**\n- Binary pass/fail per signal — no partial credit (e.g., having 1 ARIA attribute scores the same as having 10)\n- No component-type awareness — a button is scored identically to a dialog\n- Tag-name role inference has no validation against actual role assignment\n- Weight distribution is heavily biased toward `disabled` (25%) and `label` (20%), underweighting ARIA patterns\n\n### Layer 2: Source-Level Analysis (`source-accessibility.ts`)\n\n7 markers scored via regex pattern matching against component source files. Total: 100 points.\n\n| Marker | Weight | Patterns Detected | Known Issues |\n|--------|--------|-------------------|--------------|\n| `ariaBindings` | 25 | `aria-*=`, `.aria*`, `setAttribute('aria-` | Detects presence but not correctness of ARIA usage |\n| `keyboardHandling` | 20 | `@keydown=`, `addEventListener('key`, key name literals | Detects handlers but not which keys — can't verify expected interaction patterns |\n| `roleAssignments` | 15 | `role=`, `setAttribute('role'` | Detects assignment but not correct role for component type |\n| `focusManagement` | 15 | `.focus(`, `tabindex`, `aria-activedescendant`, trap patterns | Good coverage of focus patterns |\n| `formInternals` | 10 | `attachInternals()`, `setFormValue()`, `setValidity()` | Robust — uses specific APIs |\n| `liveRegions` | 10 | `aria-live=`, `role=\"alert\"/\"status\"`, `aria-atomic` | Good coverage |\n| `screenReaderSupport` | 5 | `aria-hidden`, `.sr-only`, `aria-labelledby`, `aria-describedby` | Detects CSS classes and attributes |\n\n**Source-layer limitations:**\n- Regex-only — cannot understand AST structure or control flow\n- Detects presence of patterns, not correctness (e.g., `role=\"button\"` on a div vs. on a native button)\n- No component-type-specific validation (dialog needs different patterns than checkbox)\n- Deep scan (Phase 3) follows inheritance but still regex-based\n- Confidence hardcoded to `heuristic` even when blended\n\n### Blending Strategy (health.ts lines 863-890)\n\n- When source available: `blendedScore = CEM * 0.3 + Source * 0.7`\n- Fallback: CEM-only score\n- Presentational components return `null` (excluded from scoring)\n- Confidence always `heuristic`, even for CEM-only path (incorrectly marked `heuristic` in both branches)\n\n---\n\n## 2. WCAG 2.1 AA Gap Analysis\n\n### Covered by Current Signals\n\n| WCAG SC | Requirement | Covered By |\n|---------|-------------|------------|\n| 1.3.1 Info & Relationships | Semantic structure, ARIA roles | `hasAriaRole`, `ariaBindings`, `roleAssignments` (partial) |\n| 2.1.1 Keyboard | All functionality keyboard-operable | `hasKeyboardEvents`, `keyboardHandling` (presence only) |\n| 2.4.7 Focus Visible | Focus indicator visible | `hasFocusMethod`, `focusManagement` (indirect) |\n| 4.1.2 Name, Role, Value | Accessible name, role, state | `hasAriaAttributes`, `hasLabelSupport`, `hasAriaRole` (partial) |\n\n### NOT Covered — Critical Gaps\n\n| WCAG SC | Requirement | Gap Description |\n|---------|-------------|-----------------|\n| **1.3.1** Info & Relationships | **ARIA pattern completeness** — A dialog must have `role=\"dialog\"` + `aria-modal` + `aria-labelledby`. Current scoring gives credit for ANY role, not the CORRECT role with required companion attributes. | Missing: component-type-aware ARIA validation |\n| **1.4.3** Contrast (Minimum) | Color contrast ratios ≥ 4.5:1 for text | Missing entirely — would require design token analysis or runtime rendering |\n| **2.1.1** Keyboard | **Expected key handlers** — A combobox needs ArrowUp/Down, Enter, Escape. A dialog needs Escape. Current scoring detects any keyboard handler, not the expected ones. | Missing: component-type interaction pattern validation |\n| **2.1.2** No Keyboard Trap | Focus must not be trapped except intentionally (modals) | Missing: focus trap detection for overlay components; no validation that trap can be escaped |\n| **2.4.3** Focus Order | Logical tab sequence | Missing entirely — would require DOM analysis |\n| **2.4.6** Headings & Labels | Descriptive labels for form inputs | `hasLabelSupport` is too narrow — only checks for slot/member named `label` |\n| **3.2.1** On Focus | No context change on focus | Missing entirely — would require runtime analysis |\n| **4.1.3** Status Messages | `aria-live` for dynamic status | `liveRegions` partially covers this at source level but not at CEM level |\n\n### Coverage Summary\n\n- **Partially covered:** 4 of 50 WCAG 2.1 AA success criteria\n- **Not covered:** 46 success criteria (most require runtime analysis outside HELiXiR's scope)\n- **Feasible to add with static analysis:** ~6 additional criteria (focus trap, ARIA pattern completeness, keyboard interaction coverage, live regions, heading structure, label association)\n\n---\n\n## 3. New Sub-Metric Definitions\n\n### Sub-Metric 1: ARIA Pattern Completeness\n\n**What it measures:** Whether a component implements the correct ARIA pattern for its type, including all required companion attributes.\n\n**Component-type ARIA requirements:**\n\n| Component Type | Required ARIA Pattern |\n|---------------|----------------------|\n| Dialog/Modal | `role=\"dialog\"`, `aria-modal=\"true\"`, `aria-labelledby` |\n| Alert | `role=\"alert\"` or `aria-live=\"assertive\"` |\n| Combobox | `role=\"combobox\"`, `aria-expanded`, `aria-controls`, `aria-activedescendant` |\n| Menu | `role=\"menu\"`, items have `role=\"menuitem\"` |\n| Tab | `role=\"tablist\"`, tabs have `role=\"tab\"`, panels have `role=\"tabpanel\"`, `aria-selected` |\n| Checkbox | `role=\"checkbox\"`, `aria-checked` |\n| Switch | `role=\"switch\"`, `aria-checked` |\n| Slider | `role=\"slider\"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |\n\n**Scoring rules:**\n- Identify component type from tag name (existing `ARIA_ROLE_TAG_PATTERNS`)\n- Check source for each required attribute in the pattern\n- Score = (attributes found / attributes required) * max_points\n- Partial credit: 0-15 points based on completeness ratio\n- Components not matching any known pattern: skip (don't penalize)\n\n**Implementation approach:**\n- Extend `source-accessibility.ts` with a `COMPONENT_ARIA_PATTERNS` registry\n- After `scanSourceForA11yPatterns()`, run pattern-specific checks\n- Return granular sub-metrics per ARIA attribute found/missing\n\n### Sub-Metric 2: Keyboard Interaction Coverage\n\n**What it measures:** Whether a component handles the expected keyboard interactions for its type per WAI-ARIA Authoring Practices.\n\n**Component-type keyboard requirements:**\n\n| Component Type | Required Keys |\n|---------------|---------------|\n| Button | Enter, Space |\n| Dialog/Modal | Escape (close), Tab (focus trap cycling) |\n| Combobox | ArrowUp, ArrowDown, Enter (select), Escape (close) |\n| Menu | ArrowUp, ArrowDown, Enter, Escape, Home, End |\n| Tab | ArrowLeft, ArrowRight (or Up/Down for vertical) |\n| Checkbox | Space |\n| Slider | ArrowLeft, ArrowRight, Home, End |\n| Tree | ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Enter |\n\n**Scoring rules:**\n- Identify component type from tag name\n- Search source for key name literals matching required keys\n- Score = (keys found / keys required) * max_points\n- Partial credit: 0-15 points based on coverage ratio\n- Bonus: +2 for `aria-keyshortcuts` documentation\n\n**Implementation approach:**\n- Add `COMPONENT_KEYBOARD_PATTERNS` registry mapping component types to required key names\n- Scan source for string literals matching key names within keyboard handler context\n- Could leverage existing `keyboardHandling` marker as a prerequisite gate\n\n### Sub-Metric 3: Focus Trap Detection\n\n**What it measures:** Whether overlay/modal components implement proper focus trapping and restoration.\n\n**Requirements for overlay components:**\n1. Focus moves into the overlay on open\n2. Tab cycling stays within the overlay (focus trap)\n3. Focus returns to trigger element on close\n4. Escape key dismisses the overlay\n\n**Detection patterns (source-level):**\n```\n// Focus trap indicators\n/(?:trap|contain|constrain).*focus/i\n/firstFocusable|lastFocusable|focusableElements/\n/document\\.activeElement/  (save/restore trigger)\n/sentinel|focus-trap|focus-guard/\n/inert/  (background inertness)\n```\n\n**Scoring rules:**\n- Only applies to components matching `/-dialog|-modal|-drawer|-overlay|-popover|-dropdown/i`\n- Check for: focus move (3 pts), trap cycling (4 pts), focus restore (4 pts), escape dismiss (4 pts)\n- Non-overlay components: skip\n- Maximum: 15 points for overlay components, redistributed proportionally for non-overlay\n\n### Sub-Metric 4: Screen Reader Announcements\n\n**What it measures:** Whether components that change state dynamically provide screen reader announcements via live regions.\n\n**Applicable components:**\n- Toast/snackbar: must announce content\n- Form validation: must announce errors\n- Loading indicators: must announce state changes\n- Auto-complete: must announce result count\n- Inline editing: must announce mode changes\n\n**Detection patterns:**\n```\n/aria-live\\s*=\\s*[\"'](?:polite|assertive)[\"']/\n/role\\s*=\\s*[\"'](?:alert|status|log|timer|marquee)[\"']/\n/aria-atomic\\s*=\\s*[\"']true[\"']/\n/aria-relevant/\n```\n\n**Scoring rules:**\n- Components with dynamic content changes (detected via state updates in render) should have live regions\n- Score: 0-10 points\n- Currently partially covered by `liveRegions` marker but not component-type-aware\n\n---\n\n## 4. Weight Rebalancing Recommendation\n\n### Current Weight Distribution\n\n| Dimension | Weight | Tier |\n|-----------|--------|------|\n| CEM Completeness | 15 | Critical |\n| Accessibility | **10** | Critical |\n| Type Coverage | 10 | Critical |\n| Test Coverage | 10 | Critical |\n| CEM-Source Fidelity | 10 | Critical |\n| API Surface Quality | 10 | Important |\n| CSS Architecture | 5 | Important |\n| Event Architecture | 5 | Important |\n| Slot Architecture | 5 | Important |\n| Bundle Size | 5 | Important |\n| Story Coverage | 5 | Important |\n| Naming Consistency | 5 | Important |\n| Performance | 5 | Advanced |\n| Drupal Readiness | 5 | Advanced |\n| **Total** | **105** | |\n\n### Recommendation: Increase Accessibility from 10 to 15\n\n**Justification:**\n\n1. **Critical tier parity:** All other Critical tier dimensions except CEM-Source Fidelity weight 10+. CEM Completeness is 15. Accessibility should not be the lowest-weighted Critical dimension when it is arguably the most user-impacting.\n\n2. **Legal and compliance risk:** Accessibility failures create legal liability (ADA, Section 508, EAA). No other dimension carries this regulatory weight. A component library with perfect CEM docs but poor accessibility is objectively worse than the reverse.\n\n3. **Enterprise adoption gating:** Enterprise customers increasingly require VPAT/HECVAT documentation. Poor accessibility blocks adoption regardless of other quality metrics.\n\n4. **Scoring discrimination:** With weight 10, a component scoring 0% on accessibility only loses 10 points from the weighted score — easily compensated by high scores elsewhere. At weight 15, this penalty better reflects the real-world impact.\n\n5. **Precedent:** The health-scanning-audit-workflow.md lists Accessibility at 20% weight, while dimensions.ts has it at 10. This inconsistency suggests the weight was intentionally set lower during initial implementation with plans to increase.\n\n### Impact Analysis\n\nMoving Accessibility from 10 to 15 (and adjusting total to 110 or reducing another dimension by 5):\n\n**Option A: Increase total to 110** (simplest)\n- `computeWeightedScore()` normalizes by measured weight, so total sum doesn't matter for grade calculation\n- No other dimension affected\n- Score impact: components with low accessibility scores see ~5% decrease in weighted score\n\n**Option B: Reduce Naming Consistency from 5 to 0** (remove dimension)\n- Naming Consistency is Important tier, lowest priority\n- Keeps total at 105\n- More disruptive change\n\n**Recommended: Option A** — increase to 15, accept total weight of 110. The normalization in `computeWeightedScore()` handles this correctly since it divides by measured weight sum.\n\n---\n\n## 5. Confidence Upgrade Path\n\n### Current State\n\nBoth analysis paths return `confidence: 'heuristic'`:\n- CEM-only: should be `'heuristic'` (inferred from metadata)\n- CEM + Source blend: also `'heuristic'` (regex-based detection)\n\nThe `ConfidenceLevel` type supports `'verified' | 'heuristic' | 'untested'` but accessibility never reaches `'verified'`.\n\n### Requirements for `verified` Confidence\n\n**Phase 1: Source-verified (achievable now)**\n- When source-level analysis detects ALL expected patterns for a component's type\n- AND the ARIA pattern completeness sub-metric scores ≥ 80%\n- AND keyboard interaction coverage sub-metric scores ≥ 80%\n- Mark as `confidence: 'verified'` with note \"Source-verified: ARIA and keyboard patterns confirmed\"\n- This doesn't mean the component is accessible — it means we've verified the presence of expected patterns\n\n**Phase 2: Test-verified (future)**\n- Integration with accessibility test results (axe-core, Playwright accessibility audit)\n- If a component has passing a11y tests, confidence = `'verified'`\n- Requires external data pipeline (Test Coverage dimension model)\n\n**Phase 3: Runtime-verified (aspirational)**\n- Puppeteer/Playwright-based runtime accessibility scan\n- Renders component, runs axe-core, captures results\n- Highest confidence level\n- Significant infrastructure requirement — new MCP tool or CI integration\n\n### Recommended Phase 1 Implementation\n\n```typescript\n// In health.ts, Accessibility case:\nif (sourceA11y) {\n  const blendedScore = Math.round(a11y.score * 0.3 + sourceA11y.score * 0.7);\n  const subMetrics = [...cemSubMetrics, ...sourceA11y.subMetrics];\n\n  // Upgrade confidence when source analysis is comprehensive\n  const confidence: ConfidenceLevel =\n    sourceA11y.score >= 80 ? 'verified' : 'heuristic';\n\n  return { score: blendedScore, confidence, subMetrics };\n}\n```\n\nThis is a pragmatic first step. Source analysis at ≥80% means the component has most expected accessibility patterns present in code. It doesn't guarantee runtime correctness but provides significantly higher confidence than CEM-only inference.\n\n---\n\n## 6. Ranked Improvements\n\n### Improvement 1: Component-Type-Aware ARIA Pattern Validation\n\n**Description:** Add a pattern registry mapping component types (from tag name) to required ARIA attributes. Score components on whether they implement the correct ARIA pattern, not just whether they have any ARIA attributes.\n\n**Impact:** HIGH — Directly addresses the largest false positive/negative gap. Currently, a dialog with `role=\"button\"` scores the same as one with `role=\"dialog\"` + `aria-modal` + `aria-labelledby`.\n\n**Feasibility:** EASY — Extends existing `source-accessibility.ts` with a lookup table. No new dependencies. No architectural changes.\n\n**Implementation steps:**\n1. Create `COMPONENT_ARIA_PATTERNS` registry in `source-accessibility.ts`\n2. Add `analyzeAriaPatternCompleteness(tagName: string, source: string): SubMetric` function\n3. Call from `scoreSourceMarkers()` to add pattern-specific sub-metrics\n4. Add unit tests with fixtures for dialog, combobox, tab, checkbox patterns\n\n**Effort:** 1-2 days\n**Dependencies:** None\n\n---\n\n### Improvement 2: Keyboard Interaction Coverage Validation\n\n**Description:** Add expected keyboard interaction patterns per component type. Score whether the component handles the keys that WAI-ARIA Authoring Practices specifies for its role.\n\n**Impact:** HIGH — Keyboard accessibility is the #1 WCAG failure for component libraries. Currently, any keyboard handler scores full points regardless of completeness.\n\n**Feasibility:** MEDIUM — Requires careful mapping of component types to expected key handlers. The regex detection may have false positives on key name strings used in non-handler contexts.\n\n**Implementation steps:**\n1. Create `COMPONENT_KEYBOARD_PATTERNS` registry mapping component types to required keys\n2. Add `analyzeKeyboardCoverage(tagName: string, source: string): SubMetric` function\n3. Search for key name string literals within keyboard handler blocks\n4. Return coverage ratio as sub-metric score\n5. Add unit tests with component source fixtures\n\n**Effort:** 2-3 days\n**Dependencies:** None (but benefits from Improvement 1 for component type detection)\n\n---\n\n### Improvement 3: Focus Trap Detection for Overlay Components\n\n**Description:** Detect whether modal/dialog/drawer components implement proper focus trapping, including focus containment, sentinel elements, and focus restoration on close.\n\n**Impact:** MEDIUM — Affects only overlay components (~5-10% of a library) but those components have the highest a11y failure rate. Missing focus traps are critical WCAG 2.1.2 violations.\n\n**Feasibility:** MEDIUM — Focus trap patterns vary widely across implementations (sentinel divs, `inert`, `MutationObserver`, third-party libraries like `focus-trap`). Regex detection needs broad pattern coverage.\n\n**Implementation steps:**\n1. Add `OVERLAY_TAG_PATTERNS` to identify overlay components\n2. Create `analyzeFocusTrap(tagName: string, source: string): SubMetric | null`\n3. Returns null for non-overlay components (no penalty)\n4. Detect: focus move, trap cycling, focus restore, escape dismiss\n5. Add unit tests with modal/dialog source fixtures\n\n**Effort:** 2-3 days\n**Dependencies:** None\n\n---\n\n### Improvement 4: Confidence Level Upgrade Logic\n\n**Description:** Allow the accessibility dimension to reach `'verified'` confidence when source-level analysis covers ≥80% of expected patterns. Currently hardcoded to `'heuristic'`.\n\n**Impact:** MEDIUM — Improves grade algorithm accuracy. Components with verified accessibility won't be penalized by untested-critical gates. Enables enterprise customers to distinguish between \"we checked and it's accessible\" vs. \"we inferred from metadata.\"\n\n**Feasibility:** EASY — Single conditional in `health.ts` Accessibility case. The `ConfidenceLevel` type already supports `'verified'`.\n\n**Implementation steps:**\n1. In `health.ts` line 881, change confidence from hardcoded `'heuristic'` to conditional\n2. Threshold: source score ≥ 80 → `'verified'`, otherwise `'heuristic'`\n3. Update unit tests in `multi-dimensional-health.test.ts`\n4. Update CEM-only path to explicitly note `'heuristic'` reason\n\n**Effort:** < 1 day\n**Dependencies:** None (but most valuable after Improvements 1-2 increase source analysis depth)\n\n---\n\n### Improvement 5: Weight Increase from 10 to 15\n\n**Description:** Increase the Accessibility dimension weight from 10 to 15 to match its Critical tier importance and align with the audit workflow documentation (which lists 20%).\n\n**Impact:** MEDIUM — Better scoring discrimination for accessibility. Components with poor accessibility will see meaningful score decreases rather than being masked by strong performance in other dimensions.\n\n**Feasibility:** EASY — Single number change in `DIMENSION_REGISTRY`. The `computeWeightedScore()` function normalizes by measured weight, so the total sum changing from 105 to 110 has no algorithmic impact.\n\n**Implementation steps:**\n1. Change `weight: 10` to `weight: 15` in `DIMENSION_REGISTRY` for Accessibility\n2. Update `health-scanning-audit-workflow.md` weight table to match (currently shows 20%)\n3. Run calibration: score reference library before/after, document score distribution impact\n4. Update unit test assertions for weighted score calculations\n\n**Effort:** < 1 day\n**Dependencies:** Requires `vp-engineering` approval per `scoring-calibration-workflow.md`\n\n---\n\n## 7. Implementation Roadmap\n\n### Phase 1: Quick Wins (< 1 week)\n\n1. **Confidence upgrade logic** (Improvement 4) — < 1 day\n2. **Weight increase to 15** (Improvement 5) — < 1 day, requires approval\n\n### Phase 2: Pattern Validation (1-2 weeks)\n\n3. **ARIA pattern completeness** (Improvement 1) — 1-2 days\n4. **Keyboard interaction coverage** (Improvement 2) — 2-3 days\n\n### Phase 3: Specialized Detection (1 week)\n\n5. **Focus trap detection** (Improvement 3) — 2-3 days\n\n### Phase 4: Future (backlog)\n\n6. **Runtime accessibility testing** (axe-core integration) — requires infrastructure work\n7. **Color contrast analysis** (design token integration) — requires token system\n8. **Focus order validation** (DOM analysis) — requires rendering capability\n\n---\n\n## 8. Appendix: Current Scoring Flow\n\n```\nscoreComponentMultiDimensional()\n  └─ case 'Accessibility':\n       ├─ analyzeAccessibility(decl)          → CEM 8-signal score (0-100)\n       │    └─ Binary pass/fail per signal\n       ├─ analyzeSourceAccessibility(config, cem, decl)  → Source 7-marker score (0-100)\n       │    ├─ resolveComponentSourceFilePath() → find .ts file\n       │    ├─ scanSourceForA11yPatterns()     → regex scan\n       │    ├─ isInteractiveComponent()        → skip presentational\n       │    └─ scoreSourceMarkers()            → weighted sum\n       └─ Blending: CEM * 0.3 + Source * 0.7 (if source available)\n            └─ Always returns confidence: 'heuristic'\n```\n\n### Score Distribution Concern\n\nThe current CEM-layer weights heavily favor `hasDisabled` (25) and `hasLabelSupport` (20). A component with just these two signals scores 45/100 — nearly passing — even with zero ARIA support, zero keyboard handling, and zero focus management. This weight distribution should be revisited when implementing the new sub-metrics, potentially flattening CEM weights and adding more granularity through the source-level sub-metrics.\n"
}
Now let me run the verification commands.

🔧 Tool: Bash
Input: {
  "command": "find .automaker/context -name '*accessibility*' -o -name '*enhancement*' | wc -l",
  "description": "Verify enhancement proposal file exists"
}

🔧 Tool: Bash
Input: {
  "command": "grep -l 'sub-metric\\|keyboard.*interaction\\|focus.*trap' .automaker/context/*.md 2>/dev/null",
  "description": "Verify sub-metric content"
}

🔧 Tool: Bash
Input: {
  "command": "grep -l 'weight.*rebalancing\\|weight.*15\\|Critical.*tier' .automaker/context/*.md",
  "description": "Verify weight rebalancing content"
}

🔧 Tool: Bash
Input: {
  "command": "grep -c '^##.*Improvement\\|^###.*Impact' .automaker/context/accessibility-enhancement-proposal.md",
  "description": "Count improvement sections"
}
All verification commands pass. Now let me verify the build still works and check git status.

🔧 Tool: Bash
Input: {
  "command": "npm run build:server 2>&1 | tail -5",
  "description": "Verify build succeeds"
}

🔧 Tool: Bash
Input: {
  "command": "git diff --stat",
  "description": "Check changed files"
}

🔧 Tool: Bash
Input: {
  "command": "pnpm run build 2>&1 | tail -10",
  "description": "Build with pnpm"
}

🔧 Tool: Bash
Input: {
  "command": "git diff --stat",
  "description": "Check changed files"
}
Build succeeds. The `git diff --stat` shows no output because the new file is untracked. Let me verify:

🔧 Tool: Bash
Input: {
  "command": "git status",
  "description": "Show working tree status"
}
Only the intended file was created. This is a documentation-only feature (no code changes, no Playwright verification applicable). Build passes cleanly.

<summary>
## Summary: Accessibility Dimension Enhancement Proposal

### Changes Implemented
- Created comprehensive enhancement proposal document auditing the full accessibility scoring pipeline
- Documented both analysis layers: CEM heuristic (8 signals) and source-level regex (7 markers) with known false positives/negatives for each
- Mapped current signals against WCAG 2.1 AA — identified 4 partially covered and 46 uncovered success criteria
- Defined 4 new sub-metrics: ARIA pattern completeness, keyboard interaction coverage, focus trap detection, screen reader announcements
- Recommended weight increase from 10 to 15 with quantified justification
- Documented confidence upgrade path from `heuristic` to `verified`
- Ranked 5 concrete improvements by impact and feasibility with implementation steps and effort estimates

### Files Modified
- `.automaker/context/accessibility-enhancement-proposal.md` (NEW — 380+ lines)

### Risks/Blockers Encountered
- Feature description mentioned only 8 CEM signals, but the codebase already has a second source-level analysis layer with 7 additional markers. The proposal accounts for both layers and identifies gaps in each.
- The `health-scanning-audit-workflow.md` lists Accessibility at 20% weight while `dimensions.ts` has it at 10% — this inconsistency is flagged in the proposal.

### Learnings
- The accessibility scoring is more mature than initially described — two-layer analysis with CEM/source blending already exists
- The main gap is not "we don't scan source" but rather "we don't validate correctness" — detecting `role=` is different from detecting the RIGHT role with all companion attributes
- Confidence is permanently stuck at `heuristic` despite having source verification — easy quick win

### Notes for Developer
- Improvements 4 and 5 (confidence upgrade, weight increase) are < 1 day each and can ship immediately
- Improvements 1-3 (ARIA patterns, keyboard coverage, focus traps) are the high-impact work requiring pattern registries
- Weight change requires `vp-engineering` approval per `scoring-calibration-workflow.md`

### Verification Status
- Build: `pnpm run build` passes (exit 0)
- Only 1 untracked file created (the proposal document)
- No code changes — Playwright verification not applicable for documentation-only feature
- All 4 verification grep commands pass successfully
</summary>