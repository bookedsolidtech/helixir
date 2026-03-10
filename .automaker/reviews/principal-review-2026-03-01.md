# Principal Engineer OSS Readiness Review — wc-mcp

**Reviewer:** Principal Engineer (OSS Adoption Perspective)
**Date:** 2026-03-01
**Package:** `wc-mcp` v0.1.0
**Repo:** Public-facing open source

---

## Executive Summary

**Overall Rating: GOOD — with 5–6 critical fixes away from EXCELLENT**

This project solves a real, painful problem (AI hallucinating web component APIs) and demonstrates it convincingly with a before/after in the README. The technical implementation is solid — 28 tools, 565 tests, proper CI, strong CONTRIBUTING.md. The developer who finds this on npm will understand the value within 15 seconds thanks to the hallucination comparison.

However, there are several adoption friction points that will cost you 30–50% of interested developers before they ever run `npx wc-mcp init`. Every one of them is fixable in a day.

---

## 1. The 90-Second First Impression

### Rating: GOOD

**Strengths:**
- The tagline "Give AI agents full situational awareness of any web component library" is clear and compelling
- The before/after comparison (hallucinated vs. accurate) is the single best thing in this README — it sells the product in 10 seconds
- Quick Start is prominently placed and promises under 60 seconds
- The framework setup table is comprehensive — 12 frameworks with status
- Badges are present (npm, downloads, license, node, CI)

**Problems:**

1. **The CI badge URL is broken.** Line 9: `https://github.com/your-org/wc-mcp/actions` — `your-org` is a placeholder. This is the first thing a developer's eye hits. A broken badge screams "abandoned side project." Fix this before publish or remove the badge entirely.

2. **CONTRIBUTING.md also has `your-org` placeholder** (line 8): `https://github.com/your-org/wc-mcp.git`. Same problem — communicates that nobody actually reads this file.

3. **The HTML comment on line 11–13 about recording a demo** is fine for internal notes, but verify it doesn't render oddly in npm's markdown parser. Consider moving it to a TODO issue instead.

4. **No live output example.** The README shows what Claude says, but never shows what the *server* returns. A developer evaluating the tool wants to see: "Here's the raw JSON response from `get_component`." This validates that the tool actually works and shows them what their AI agent receives.

5. **Missing the "why should I care" sentence.** The opener assumes you know what MCP is. For the 80% of web component developers who don't know what MCP stands for, add one sentence: "wc-mcp connects your AI coding assistant (Claude, Cursor, Copilot) to your actual component library documentation, eliminating hallucinated APIs."

6. **No mention of the 28 tools or 12+ frameworks in the hero section.** The numbers create trust. "28 tools across 6 categories, supporting 12+ component libraries out of the box" should be above the fold.

---

## 2. npm Package Metadata

### Rating: NEEDS WORK

**`description`** — "MCP server that gives AI agents full situational awareness of any web component library" — GOOD. Clear, search-friendly, contains key terms.

**`keywords`** — Present but incomplete. Current list:
```json
["mcp", "model-context-protocol", "web-components", "custom-elements", "lit", "design-system", "claude", "ai", "developer-tools"]
```

**Missing keywords that developers will search for:**
- `cursor` (Cursor IDE users searching for MCP servers)
- `copilot` (generic AI coding assistant search term)
- `shoelace`
- `stencil`
- `fast-element`
- `custom-elements-manifest`
- `cem`
- `component-library`
- `code-assistant`
- `llm`

npm search is keyword-heavy. Every missing keyword is a missed discovery.

**`repository` field** — MISSING. This is critical for npm linking to GitHub. Add:
```json
"repository": {
  "type": "git",
  "url": "https://github.com/AdrianaSaty/wc-mcp.git"
}
```
(Replace with actual org/repo.)

**`homepage` field** — MISSING. Should point to the GitHub repo or a docs site.

**`bugs` field** — MISSING. Add:
```json
"bugs": {
  "url": "https://github.com/your-org/wc-mcp/issues"
}
```

**`author` field** — MISSING. The README says "MIT © Jake Strawn" but `package.json` has no `author`. Add:
```json
"author": "Jake Strawn"
```

**`files` array** — `["build", "README.md", "CHANGELOG.md"]`. This is mostly correct but:
- Missing `LICENSE` — the LICENSE file should be included in the npm package. Most developers check for it.
- Missing `mcpwc.config.json.example` — referenced in the README but not shipped.
- The `build/` directory is correct.

**`engines`** — `"node": ">=20.0.0", "pnpm": ">=9"` — The `pnpm` engine constraint is wrong for npm users. A developer running `npm install -g wc-mcp` will get an engine warning about pnpm. The pnpm constraint should only apply to development. Remove `"pnpm": ">=9"` from `engines` and document it in CONTRIBUTING.md only.

**`customElements` field** — Line 81: `"customElements": "custom-elements.json"` — This is metadata for the CEM spec, indicating this package *itself* has a CEM. But wc-mcp is a tool, not a component library. This field is misleading and should be removed unless wc-mcp actually ships custom elements.

---

## 3. Community Health Files

### Rating: NEEDS WORK

| File | Status | Quality |
|------|--------|---------|
| `CONTRIBUTING.md` | Present | GOOD — thorough, includes project structure, how to add tools, testing guidelines, PR checklist. Has `your-org` placeholder on line 8. |
| `CODE_OF_CONDUCT.md` | **MISSING** | Required for any project accepting contributions. Use Contributor Covenant 2.1. |
| `CHANGELOG.md` | Present | GOOD — follows Keep a Changelog format, machine-readable. Lists all tools added in 0.1.0. |
| `SECURITY.md` | **MISSING** | **CRITICAL for an MCP server.** This tool runs as a subprocess with file system access. Developers need to know: What's the threat model? Does it phone home? What file system access does it require? How to report vulnerabilities? |
| `LICENSE` | Present at root | Confirmed MIT — matches README. But NOT included in the `files` array in package.json (won't ship to npm). |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Present | GOOD — asks for CEM excerpt, wc-mcp version, framework, config. Well-structured. References `get_component_api` (line 53) — should be `get_component` to match actual tool name. |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Present | Not reviewed in detail. |
| `.github/ISSUE_TEMPLATE/framework_support.yml` | Present | Good — dedicated template for new framework requests. |
| `.github/pull_request_template.md` | Present | GOOD — includes checklist matching CI gates. |

**Critical gaps:**
1. No `CODE_OF_CONDUCT.md` — table stakes for OSS in 2026
2. No `SECURITY.md` — unacceptable for an MCP server that reads the file system
3. `LICENSE` not in npm `files` array

---

## 4. Documentation Completeness

### Rating: NEEDS WORK

**`docs/` directory** — Contains only `docs/e2e-validation.md`. This is an internal validation doc, not user-facing documentation.

**Tool documentation** — The README has a tools reference table with tool names, descriptions, and required args. This is good for discoverability but:
- No example output for any tool. A developer wants to see: "When I call `get_component` with `tagName: 'sl-button'`, here's the JSON I get back."
- No documentation of optional arguments (only required args shown)
- No error response documentation ("What happens when the component doesn't exist?")

**Getting Started** — The Quick Start section is good, but:
- Assumes `custom-elements.json` already exists. Many developers won't have this file and won't know how to generate it. The Framework Setup section helps, but it's too far down the page.
- No "verify it's working" step. After configuring Claude Desktop, how do I know wc-mcp is actually running? There's no `wc-mcp --test` or `wc-mcp --dry-run` command.

**Config documentation** — GOOD. The environment variable table and config file table are comprehensive. The priority order (env > file > defaults) is clearly stated.

**Examples directory** — Contains 13 framework example configs. This is excellent and unusual for a v0.1.0 — shows real commitment to DX. However, these examples are not linked from the README.

**Watch mode** — Mentioned in the code (`--watch` flag, `config.watch`) but NOT documented in the README at all. Users won't discover this feature.

---

## 5. Developer Experience (DX) Audit

### Rating: GOOD

**`npx wc-mcp init`** — EXISTS. The CLI scaffolds a config file. This is above average for v0.1.0 MCP servers.

**Error messages** — The fatal error when CEM is missing (line 92–93 of index.ts) is actionable: tells you the path it checked and suggests two fixes (env var or config file). GOOD.

**Zero-config experience** — Partially works. If you have `custom-elements.json` in your CWD and point `MCP_WC_PROJECT_ROOT` at it, the server starts with sensible defaults. But "zero config" requires your library to already have a CEM, which is a pre-condition most developers need help with.

**Verification without Claude** — There is NO way to verify the server works without an MCP client. Missing a `wc-mcp test` or `wc-mcp doctor` command that:
1. Checks that the CEM file exists and is valid
2. Reports how many components were found
3. Runs a sample tool call and shows the output
4. Exits with a success/failure code

This is a significant gap. When something doesn't work, the developer has no debugging tool other than reading stderr.

**Sharp edges:**
1. **`wc-mcp` package name vs `helixir` server identity** — The npm package is `wc-mcp`, but `src/index.ts` line 79 registers the server as `name: 'helixir'`. Claude Desktop shows "helixir" in the MCP server list. The README Quick Start uses `"helixir"` as the config key. This dual naming will confuse every single user. Pick ONE name and use it everywhere.
2. **The pnpm engine constraint** — A developer doing `npm install -g wc-mcp` gets a warning about pnpm not being installed. Confusing for npm/yarn users.

---

## 6. Competitive Differentiation

### Rating: GOOD

**What makes this better than raw CEM JSON?**
- CEM JSON is huge, verbose, and nested. wc-mcp pre-processes it into tool-specific responses optimized for LLM consumption.
- Health scoring, accessibility analysis, and breaking change detection are value-adds not available from raw JSON.
- The semantic search (`find_component`) is genuinely useful — developers often know what they want ("a date picker") but not the tag name.

**What makes this better than other MCP servers?**
- Most MCP servers for code are generic (file reading, grep). wc-mcp is domain-specific to web components, which means better tool descriptions and more relevant output.
- The framework coverage (12+ libraries) is a moat.

**Positioning** — Clear: "If you use AI coding assistants AND web component libraries, this eliminates hallucinated APIs." The target user is specific enough.

**Missing one-liner** — The README opener is good but could be sharper. See Priority Action List.

---

## 7. Adoption Blockers

### Rating: Critical issues listed

1. **Broken CI badge URL** — `your-org` placeholder. First thing developers see. Communicates "not production ready."

2. **No `SECURITY.md`** — MCP servers run as subprocesses with file system access. Security-conscious organizations (the kind that use enterprise design systems like Carbon and Patternfly) will not adopt without a security policy.

3. **No `CODE_OF_CONDUCT.md`** — Signals "I haven't thought about community."

4. **Missing `repository`, `homepage`, `bugs`, `author` in package.json** — npm page will look empty and untrustworthy. These fields populate the npm sidebar.

5. **`wc-mcp` vs `helixir` naming confusion** — Two names for one product = cognitive overhead on every setup.

6. **No verification command** — Developer can't confirm it's working without a full AI client setup.

7. **pnpm engine constraint in package.json** — Alienates npm and yarn users.

8. **No example output for any tool** — Developer has to install, configure, and run the full stack just to see what a tool response looks like.

9. **Watch mode undocumented** — Feature exists but is invisible.

10. **`customElements` field in package.json** — Misleading for a tool package.

11. **CHANGELOG only covers current version** — Fine for v0.1.0, but ensure the `[Unreleased]` section is present for ongoing work.

---

## 8. The Roadmap Signal

### Rating: POOR

There is no `ROADMAP.md`, no GitHub Discussions enabled, no "What's Next" section in the README. For a v0.1.0 project, developers want to know:

- Is this actively maintained?
- What's coming in 0.2.0?
- Will my framework be supported?
- Is there a path to stability?

**Recommendation:** Add a "Roadmap" section to the README (5–10 lines) with planned features:
- SSE transport support (beyond stdio)
- Resource protocol support (MCP resources)
- Monorepo multi-CEM support
- Additional AI client configurations
- Coverage badge once CI is green

Consider enabling GitHub Discussions for questions that don't fit as issues.

---

## Priority Action List

**Top 10 fixes ranked by adoption impact (do all before first publish):**

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | **Fix `your-org` placeholders** everywhere (README badge, CONTRIBUTING.md clone URL) with actual GitHub org/repo | CRITICAL — broken badges = abandoned project | 5 min |
| 2 | **Add `repository`, `homepage`, `bugs`, `author` to package.json** | CRITICAL — npm sidebar will be empty without these | 5 min |
| 3 | **Add `SECURITY.md`** covering: threat model, file system access scope, no telemetry declaration, vulnerability reporting process | HIGH — enterprise adopters require this | 30 min |
| 4 | **Add `LICENSE` to the `files` array in package.json** | HIGH — legal compliance for enterprise adopters | 1 min |
| 5 | **Remove `"pnpm": ">=9"` from `engines`** and `"customElements"` field from package.json | MEDIUM — confuses npm/yarn users | 2 min |
| 6 | **Add `CODE_OF_CONDUCT.md`** (Contributor Covenant 2.1) | MEDIUM — community standard | 5 min |
| 7 | **Add a "Verify Installation" section to README** showing `wc-mcp --help` or stderr output on successful startup, plus a Roadmap note about a future `wc-mcp doctor` command | MEDIUM — reduces first-run frustration | 20 min |
| 8 | **Add 2–3 example tool outputs** to the README (raw JSON for `list_components`, `get_component`, `score_component`) | MEDIUM — builds trust without requiring install | 30 min |
| 9 | **Expand `keywords` in package.json** with: `cursor`, `copilot`, `shoelace`, `stencil`, `custom-elements-manifest`, `cem`, `llm`, `code-assistant` | MEDIUM — npm discoverability | 2 min |
| 10 | **Document `--watch` mode** in the README Configuration section | LOW — feature discoverability | 10 min |

**Honorable mentions (do soon after publish):**
- Resolve `wc-mcp` vs `helixir` naming (pick one, alias the other)
- Fix bug_report.yml reference to `get_component_api` → `get_component`
- Add an `[Unreleased]` section to CHANGELOG.md
- Add a brief Roadmap section to README
- Link to `examples/` directory from the README framework setup sections

---

## The One-Liner

The README opener should be:

> **Stop your AI from hallucinating web component APIs.** wc-mcp gives Claude, Cursor, and Copilot accurate knowledge of every property, event, slot, and token in your component library — sourced directly from your Custom Elements Manifest.

This one-liner:
1. Leads with the pain point (hallucination)
2. Names the AI tools developers actually use
3. Lists the specific things it knows (properties, events, slots, tokens)
4. Credits the source (CEM) for trust

---

*Review generated 2026-03-01. This review assesses open-source readiness and developer adoption friction — not internal code quality (see senior-review-2026-03-01.md for that).*
