/**
 * helix-AAA evidence detector — Phase 1 of the dimensional upgrade.
 *
 * Stateless, pure detector that gathers everything the 8 downstream
 * accessibility-dimension scorers need to make their per-dim judgement.
 * This module DOES NOT score. It only collects evidence. Scorers in
 * Phase 2 import the {@link HelixAaaEvidence} contract and choose how
 * to weight what they find — including how to translate
 * `sourceChecks === undefined` into a `confidence: 'unknown'` verdict.
 *
 * Inputs:
 *   - decl: a CEM declaration (may or may not carry the helix-specific
 *     `helixMeta` extension; the public CemDeclaration type intentionally
 *     leaves this as `unknown` to keep the CEM type library-agnostic).
 *   - libraryRoot: optional repo root for the consuming library (e.g.
 *     /path/to/helix). When provided, the detector reads the per-tag
 *     verdicts file at `<libraryRoot>/packages/<pkg>/aaa-verdicts.json`
 *     and probes the component's source/styles files for the AAA contract
 *     regexes encoded by helix commit e54e069ff.
 *
 * Caching:
 *   - aaa-verdicts.json is parsed once per `libraryRoot` and memoised in a
 *     module-scoped Map. The cache is unbounded but keyed on the resolved
 *     absolute path, which is bounded by the number of libraries an MCP
 *     server hosts — typically 1, never more than a handful.
 *
 * Reality-check vs the upgrade plan §2.2:
 *   The plan described aaa-verdicts.json as per-tag with
 *   `{certified, criteria[], auditUrl}` at the tag level. The real file
 *   in helix is shaped `{components: {<tag>: {<sc-code>: {verdict, evidence}}}}`.
 *   The detector derives the snapshot the plan asked for from the actual
 *   shape: `criteria` = SCs whose verdict === "Supports"; `certified` =
 *   `criteria.length >= 9` (the helix component-shippable SC count);
 *   `certifiedDate` and `auditUrl` come from `helixMeta.aaa.*`, which is
 *   the authoritative source for the cert metadata.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { CemDeclaration } from '../cem.js';

// ---------------------------------------------------------------------------
// Public contract — downstream dim scorers import these names verbatim.
// ---------------------------------------------------------------------------

export interface KeyboardContract {
  activate?: string[];
  navigate?: string[];
  dismiss?: string[];
  disabledSuppresses: boolean;
}

export interface HelixAaaMeta {
  aaa?: {
    certified: boolean;
    certifiedDate?: string;
    criteria: string[];
    auditUrl?: string;
  };
  keyboardContract?: KeyboardContract;
  ariaPattern?: string;
  ariaPatternSource?: string;
  formAssociated?: boolean;
  forcedColorsSupported?: boolean;
  priorityTier?: 'P0' | 'P1' | 'P2' | 'Exempt';
  stability?: 'stable' | 'beta' | 'experimental';
}

export type VerdictValue =
  | 'Supports'
  | 'Partially Supports'
  | 'Does Not Support'
  | 'Not Applicable';

export interface VerdictSnapshot {
  certified: boolean;
  certifiedDate?: string;
  /** SC codes where verdict === "Supports". Derived from perCriterion. */
  criteria: string[];
  auditUrl?: string;
  perCriterion: Record<string, { verdict: VerdictValue; evidence?: string }>;
}

export interface SourceChecks {
  hasStaticFormAssociated: boolean;
  hasAttachInternals: boolean;
  hasSetValidityCall: boolean;
  hasFocusVisibleRule: boolean;
  has2pxOutlineRule: boolean;
  hasForcedColorsBlock: boolean;
}

export interface HelixAaaEvidence {
  helixMeta?: HelixAaaMeta;
  verdictSnapshot?: VerdictSnapshot;
  auditMdPath?: string;
  auditMdFresh?: boolean;
  sourceChecks?: SourceChecks;
}

// ---------------------------------------------------------------------------
// Zod runtime parser for `decl.helixMeta`. Lives here, not in cem.ts, so
// the CEM type stays helix-agnostic. Public `HelixAaaMeta` is the inferred
// shape — keep schema and interface aligned.
// ---------------------------------------------------------------------------

const KeyboardContractSchema = z.object({
  activate: z.array(z.string()).optional(),
  navigate: z.array(z.string()).optional(),
  dismiss: z.array(z.string()).optional(),
  disabledSuppresses: z.boolean(),
});

const AaaCertSchema = z.object({
  certified: z.boolean(),
  certifiedDate: z.string().optional(),
  criteria: z.array(z.string()),
  auditUrl: z.string().optional(),
});

const HelixAaaMetaSchema = z
  .object({
    aaa: AaaCertSchema.optional(),
    keyboardContract: KeyboardContractSchema.optional(),
    ariaPattern: z.string().optional(),
    ariaPatternSource: z.string().optional(),
    formAssociated: z.boolean().optional(),
    forcedColorsSupported: z.boolean().optional(),
    priorityTier: z.enum(['P0', 'P1', 'P2', 'Exempt']).optional(),
    stability: z.enum(['stable', 'beta', 'experimental']).optional(),
  })
  .passthrough();

const VerdictEntrySchema = z.object({
  verdict: z.enum(['Supports', 'Partially Supports', 'Does Not Support', 'Not Applicable']),
  evidence: z.string().optional(),
});

const VerdictsFileSchema = z.object({
  components: z.record(z.string(), z.record(z.string(), VerdictEntrySchema)),
});

// ---------------------------------------------------------------------------
// Module-scoped caches. Keyed by absolute resolved path so two configs
// pointing at the same root share state.
// ---------------------------------------------------------------------------

interface VerdictsCacheEntry {
  /** Map of tagName → per-SC verdict block. `null` means file unreadable. */
  byTag: Record<string, Record<string, { verdict: VerdictValue; evidence?: string }>> | null;
  /** mtime fingerprint of the verdicts files at parse time. */
  fingerprint: string;
}

const verdictsCache = new Map<string, VerdictsCacheEntry>();

/**
 * Manifest discovery cache. Maps absolute libraryRoot to an array of
 * `{packageRoot, tagToPath}` entries scanned from
 * `<root>/packages/<pkg>/custom-elements.json`.
 * Empty array means the scan ran but found no manifests; `null` means
 * the scan errored (e.g. unreadable packages dir).
 *
 * Each cache slot carries a fingerprint of the source files'
 * mtime — long-lived MCP servers (watch mode) would otherwise miss
 * regenerated artifacts for the process lifetime (codex push-gate P2
 * round 8, 2026-05-10).
 */
interface ManifestIndex {
  packageRoot: string;
  /** map of tagName → absolute source path (resolved against packageRoot) */
  tagToSourcePath: Map<string, string>;
}
interface ManifestIndexCacheEntry {
  indices: ManifestIndex[] | null;
  fingerprint: string;
}
const manifestIndexCache = new Map<string, ManifestIndexCacheEntry>();

/**
 * Compute a stable fingerprint from candidate file paths' mtimes.
 * Missing files contribute "missing"; readable files contribute their
 * mtime in ms. The fingerprint stays stable across runs until any
 * watched artifact changes, at which point the cache slot is rebuilt.
 */
function fingerprintFiles(paths: readonly string[]): string {
  const parts: string[] = [];
  for (const p of paths) {
    try {
      parts.push(`${p}:${statSync(p).mtime.getTime()}`);
    } catch {
      parts.push(`${p}:missing`);
    }
  }
  return parts.join('|');
}

/**
 * Clears all module-scoped caches. Intended for tests.
 */
export function _resetHelixAaaEvidenceCache(): void {
  verdictsCache.clear();
  manifestIndexCache.clear();
}

// ---------------------------------------------------------------------------
// Source-check regex constants. These encode helix's fixed AAA contract
// from commit e54e069ff. The strict 2px regex matches helix's specific
// `--hx-focus-ring-width` / `--hx-(.+-)?focus-ring-color` shape; the loose
// regex catches generic `:focus-visible { outline: ... }` so dim scorers
// can tell "wrong shape" apart from "no rule at all".
// ---------------------------------------------------------------------------

const STATIC_FORM_ASSOCIATED_RE = /static\s+(override\s+)?formAssociated\s*=\s*true/;
const ATTACH_INTERNALS_RE = /\.attachInternals\s*\(\s*\)/;
const SET_VALIDITY_RE = /\.setValidity\s*\(/;
// DEVIATION from spec: the literal regex `outline:\s*(?:var\(--hx-focus-ring-width|2px)\s+solid\s+var\(...)` can never match real helix CSS, because
// helix writes `outline: var(--hx-focus-ring-width, 2px) solid var(--hx-focus-ring-color, ...)` — the closing `)` of the first var() call must
// appear between `--hx-focus-ring-width` and the trailing ` solid `. We widen the alternation arms to permit the optional `, fallback)` closure,
// which matches both the canonical helix form and a literal `2px solid` shorthand.
const FOCUS_VISIBLE_2PX_RE =
  /:focus-visible[\s\S]{0,200}outline:\s*(?:var\(--hx-focus-ring-width(?:[^)]*\))?|2px)\s+solid\s+var\(--hx-(?:[\w-]*-)?focus-ring-color/;
// LOOSE matcher requires an outline declaration that's NOT degraded
// (none / 0 / unset / initial / revert). A `:focus-visible { outline: none; }`
// rule is a regression, not evidence of a focus indicator — defect class 17
// reproduces this exact pattern and the scorer must treat it as no-rule
// (codex push-gate P1 round 5, 2026-05-10).
const FOCUS_VISIBLE_LOOSE_RE =
  /:focus-visible[\s\S]{0,200}outline:\s*(?!(?:none|0|unset|initial|revert)\b)[^;}]+/;
const FORCED_COLORS_RE = /@media\s*\(\s*forced-colors\s*:\s*active\s*\)/;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Collect every piece of AAA evidence available for a CEM declaration.
 * Pure: same inputs → same output (modulo cache fill).
 */
export function detectHelixAaaEvidence(
  decl: CemDeclaration,
  libraryRoot?: string,
): HelixAaaEvidence {
  const evidence: HelixAaaEvidence = {};

  // ── helixMeta — runtime-narrow the `unknown` field via Zod ────────────
  const helixMeta = parseHelixMeta((decl as { helixMeta?: unknown }).helixMeta);
  if (helixMeta) {
    evidence.helixMeta = helixMeta;
  }

  // ── Below here: everything depends on a resolvable libraryRoot ────────
  if (!libraryRoot || !decl.tagName) {
    return evidence;
  }

  const absRoot = isAbsolute(libraryRoot) ? libraryRoot : resolve(libraryRoot);
  // mergeCems() rewrites colliding tags to `packageName:tagName` and stamps
  // every declaration with a `packageName` field (cem.ts:732). The bare
  // tag (without prefix) is what's keyed in verdicts/manifests, BUT in a
  // multi-package monorepo with collisions, stripping the prefix and
  // searching across all packages picks whichever manifest indexes the
  // bare tag first — wrong source/verdicts for the new accessibility
  // dimensions (codex push-gate P1 round 7, 2026-05-10).
  //
  // Resolution: scope evidence resolution to the declaration's specific
  // package when `packageName` is set, falling back to library-wide
  // search only when no package scope is available (single-package CEM).
  const bareTagName = decl.tagName.includes(':')
    ? (decl.tagName.split(':').pop() ?? decl.tagName)
    : decl.tagName;
  const packageName = (decl as { packageName?: unknown }).packageName;
  const scopedRoot =
    typeof packageName === 'string' && packageName.length > 0
      ? resolve(absRoot, 'packages', packageName)
      : null;

  // ── verdictSnapshot ───────────────────────────────────────────────────
  // Once a package scope is requested (declaration carries packageName),
  // ONLY consult that package. Falling back to a library-wide search
  // when the scoped package has no verdict file leaks evidence across
  // packages — `pkg-b:x-foo` would silently resolve to `pkg-a:x-foo`'s
  // verdicts if pkg-b had none of its own (codex push-gate P1 round 9,
  // 2026-05-10).
  const verdictSnapshot = scopedRoot
    ? buildVerdictSnapshot(scopedRoot, bareTagName, helixMeta)
    : buildVerdictSnapshot(absRoot, bareTagName, helixMeta);
  if (verdictSnapshot) {
    evidence.verdictSnapshot = verdictSnapshot;
  }

  // ── Locate component source file via package-manifest index ──────────
  const sourcePath = scopedRoot
    ? resolveComponentSourcePath(scopedRoot, bareTagName)
    : resolveComponentSourcePath(absRoot, bareTagName);
  if (!sourcePath) {
    return evidence;
  }

  // ── sourceChecks (only if source file actually readable) ──────────────
  const sourceChecks = runSourceChecks(sourcePath);
  if (sourceChecks) {
    evidence.sourceChecks = sourceChecks;
  }

  // ── AAA-AUDIT.md sidecar ──────────────────────────────────────────────
  const auditInfo = checkAuditMarkdown(sourcePath);
  if (auditInfo) {
    evidence.auditMdPath = auditInfo.path;
    evidence.auditMdFresh = auditInfo.fresh;
  }

  return evidence;
}

// ---------------------------------------------------------------------------
// helixMeta parsing
// ---------------------------------------------------------------------------

function parseHelixMeta(raw: unknown): HelixAaaMeta | undefined {
  if (raw === undefined || raw === null) return undefined;
  const result = HelixAaaMetaSchema.safeParse(raw);
  if (!result.success) return undefined;
  // Drop unknown passthrough keys for the typed view — re-shape to the
  // declared interface explicitly so consumers don't see noise.
  const parsed = result.data;
  const shaped: HelixAaaMeta = {};
  if (parsed.aaa) shaped.aaa = parsed.aaa;
  if (parsed.keyboardContract) shaped.keyboardContract = parsed.keyboardContract;
  if (parsed.ariaPattern !== undefined) shaped.ariaPattern = parsed.ariaPattern;
  if (parsed.ariaPatternSource !== undefined) shaped.ariaPatternSource = parsed.ariaPatternSource;
  if (parsed.formAssociated !== undefined) shaped.formAssociated = parsed.formAssociated;
  if (parsed.forcedColorsSupported !== undefined)
    shaped.forcedColorsSupported = parsed.forcedColorsSupported;
  if (parsed.priorityTier !== undefined) shaped.priorityTier = parsed.priorityTier;
  if (parsed.stability !== undefined) shaped.stability = parsed.stability;
  return shaped;
}

// ---------------------------------------------------------------------------
// Verdicts file loading + snapshot derivation
// ---------------------------------------------------------------------------

const HELIX_CERT_THRESHOLD = 9;

// WCAG SC key shape: 1+ digit, dot, 1+ digit, optional dot + digits. Helix's
// verdicts file mixes real SCs (1.4.6, 2.4.13) with helper rows (forced-colors,
// apg-keyboard) — those helpers are NOT SCs and must not count toward the
// 9-criterion certification threshold. Otherwise a component with 5 real SCs
// + 4 helper rows looks certified (codex push-gate P1 round 4, 2026-05-10).
const SC_KEY_RE = /^\d+\.\d+(?:\.\d+)?$/;

function buildVerdictSnapshot(
  libraryRoot: string,
  tagName: string,
  helixMeta: HelixAaaMeta | undefined,
): VerdictSnapshot | undefined {
  const perTag = loadVerdictsForRoot(libraryRoot);
  const perCriterion = perTag?.[tagName];
  if (!perCriterion) return undefined;

  const criteria = Object.entries(perCriterion)
    .filter(([sc, entry]) => entry.verdict === 'Supports' && SC_KEY_RE.test(sc))
    .map(([sc]) => sc);

  const snapshot: VerdictSnapshot = {
    certified: criteria.length >= HELIX_CERT_THRESHOLD,
    criteria,
    perCriterion,
  };
  if (helixMeta?.aaa?.certifiedDate) {
    snapshot.certifiedDate = helixMeta.aaa.certifiedDate;
  }
  if (helixMeta?.aaa?.auditUrl) {
    snapshot.auditUrl = helixMeta.aaa.auditUrl;
  }
  return snapshot;
}

function loadVerdictsForRoot(
  libraryRoot: string,
): Record<string, Record<string, { verdict: VerdictValue; evidence?: string }>> | null {
  // Verdicts can live either under packages/<pkg>/aaa-verdicts.json
  // (monorepo, helix shape) OR at libraryRoot/aaa-verdicts.json
  // (single-package consumer). Both layouts are accepted per the
  // detector contract (codex push-gate P2 round 4, 2026-05-10).
  const candidatePaths: string[] = [];
  const packagesDir = resolve(libraryRoot, 'packages');
  try {
    const pkgs = readdirSync(packagesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const pkg of pkgs) {
      candidatePaths.push(resolve(packagesDir, pkg, 'aaa-verdicts.json'));
    }
  } catch {
    // packages/ may not exist
  }
  candidatePaths.push(resolve(libraryRoot, 'aaa-verdicts.json'));

  // Fingerprint includes mtimes of every candidate path. Regenerating
  // aaa-verdicts.json in watch mode now correctly invalidates the cache
  // (codex push-gate P2 round 8, 2026-05-10).
  const fingerprint = fingerprintFiles(candidatePaths);
  const cached = verdictsCache.get(libraryRoot);
  if (cached !== undefined && cached.fingerprint === fingerprint) {
    return cached.byTag;
  }

  const merged: Record<string, Record<string, { verdict: VerdictValue; evidence?: string }>> = {};
  let foundAny = false;
  for (const verdictsPath of candidatePaths) {
    try {
      const raw = readFileSync(verdictsPath, 'utf-8');
      const parsed = VerdictsFileSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) continue;
      foundAny = true;
      for (const [tag, scMap] of Object.entries(parsed.data.components)) {
        merged[tag] = { ...(merged[tag] ?? {}), ...scMap };
      }
    } catch {
      // ignore — file may not exist at every candidate
    }
  }

  const result = foundAny ? merged : null;
  verdictsCache.set(libraryRoot, { byTag: result, fingerprint });
  return result;
}

// ---------------------------------------------------------------------------
// Component source path resolution
// ---------------------------------------------------------------------------

function resolveComponentSourcePath(libraryRoot: string, tagName: string): string | undefined {
  const index = loadManifestIndex(libraryRoot);
  if (!index) return undefined;
  for (const entry of index) {
    const hit = entry.tagToSourcePath.get(tagName);
    if (hit) return hit;
  }
  return undefined;
}

function loadManifestIndex(libraryRoot: string): ManifestIndex[] | null {
  // Discovery covers two layouts: (a) monorepo with packages/<pkg>/
  // custom-elements.json, AND (b) single-package repos with the manifest
  // directly at the libraryRoot. The plan documented libraryRoot as "the
  // consuming library root" without committing to either layout, so the
  // detector accepts both. Without the root fallback, single-package
  // consumers silently return no evidence (codex push-gate P2 round 4,
  // 2026-05-10).
  const candidatePackageRoots: string[] = [];
  const packagesDir = resolve(libraryRoot, 'packages');
  try {
    const pkgs = readdirSync(packagesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const pkg of pkgs) candidatePackageRoots.push(resolve(packagesDir, pkg));
  } catch {
    // packages/ may not exist — fall through to root-level fallback.
  }
  // Always consider libraryRoot itself; it's harmless if absent.
  candidatePackageRoots.push(libraryRoot);

  // Fingerprint over every candidate manifest path so watch-mode picks
  // up new components without restart (codex push-gate P2 round 8,
  // 2026-05-10).
  const candidateManifests = candidatePackageRoots.map((p) => resolve(p, 'custom-elements.json'));
  const fingerprint = fingerprintFiles(candidateManifests);
  const cached = manifestIndexCache.get(libraryRoot);
  if (cached !== undefined && cached.fingerprint === fingerprint) {
    return cached.indices;
  }

  const indices: ManifestIndex[] = [];
  for (const packageRoot of candidatePackageRoots) {
    const manifestPath = resolve(packageRoot, 'custom-elements.json');
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch {
      continue;
    }
    const tagToSourcePath = new Map<string, string>();
    // Walk the manifest defensively — we do not parse with the full Zod
    // CemSchema here to keep this detector independent of the canonical
    // parser. Shape: { modules: [{ path, declarations: [{ tagName, ... }] }] }.
    const modules =
      parsed && typeof parsed === 'object' && 'modules' in parsed
        ? (parsed as { modules?: unknown }).modules
        : undefined;
    if (!Array.isArray(modules)) continue;
    for (const mod of modules) {
      if (!mod || typeof mod !== 'object') continue;
      const m = mod as { path?: unknown; declarations?: unknown };
      const modPath = typeof m.path === 'string' ? m.path : null;
      if (!modPath) continue;
      const decls = Array.isArray(m.declarations) ? m.declarations : [];
      for (const d of decls) {
        if (!d || typeof d !== 'object') continue;
        const dd = d as { tagName?: unknown };
        if (typeof dd.tagName !== 'string') continue;
        // Module path is package-relative.
        tagToSourcePath.set(dd.tagName, resolve(packageRoot, modPath));
      }
    }
    if (tagToSourcePath.size > 0) {
      indices.push({ packageRoot, tagToSourcePath });
    }
  }

  manifestIndexCache.set(libraryRoot, { indices, fingerprint });
  return indices;
}

// ---------------------------------------------------------------------------
// Source-content regex checks
// ---------------------------------------------------------------------------

function runSourceChecks(componentSourcePath: string): SourceChecks | undefined {
  let tsContent: string;
  try {
    tsContent = readFileSync(componentSourcePath, 'utf-8');
  } catch {
    return undefined;
  }

  // Styles sidecar convention: `<basename>.styles.<ext>` next to the
  // component. Supports .ts, .tsx, .js, .jsx, .mts, .cts module entries —
  // the replace must match the actual source extension or stylesContent
  // silently fuses with the component file itself, producing false
  // focus-ring / forced-colors evidence (codex push-gate P2 round 7,
  // 2026-05-10).
  const stylesPath = componentSourcePath.replace(
    /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/,
    '.styles.$1',
  );
  let stylesContent = '';
  if (stylesPath !== componentSourcePath) {
    try {
      stylesContent = readFileSync(stylesPath, 'utf-8');
    } catch {
      stylesContent = '';
    }
  }

  // Strip comments before matching. Otherwise commented-out lines like
  // `// this.attachInternals()` or `/* @media (forced-colors: active) */`
  // register as real signals and silently inflate the source-check
  // positives (codex push-gate P2 round 4, 2026-05-10).
  const tsStripped = stripComments(tsContent);
  const stylesStripped = stripComments(stylesContent);

  return {
    hasStaticFormAssociated: STATIC_FORM_ASSOCIATED_RE.test(tsStripped),
    hasAttachInternals: ATTACH_INTERNALS_RE.test(tsStripped),
    hasSetValidityCall: SET_VALIDITY_RE.test(tsStripped),
    hasFocusVisibleRule:
      FOCUS_VISIBLE_2PX_RE.test(stylesStripped) || FOCUS_VISIBLE_LOOSE_RE.test(stylesStripped),
    has2pxOutlineRule: FOCUS_VISIBLE_2PX_RE.test(stylesStripped),
    hasForcedColorsBlock: FORCED_COLORS_RE.test(stylesStripped),
  };
}

/**
 * Remove TS/JS/CSS line and block comments before regex matching.
 * Preserves source character offsets is NOT required — the consumers
 * only check `.test()` presence, not capture positions. The replacement
 * uses single spaces to keep token boundaries (so `setValidity//(`
 * doesn't fuse with neighbour tokens after stripping).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

// ---------------------------------------------------------------------------
// AAA-AUDIT.md sidecar freshness check
// ---------------------------------------------------------------------------

function checkAuditMarkdown(
  componentSourcePath: string,
): { path: string; fresh: boolean } | undefined {
  const auditPath = resolve(dirname(componentSourcePath), 'AAA-AUDIT.md');
  let auditStat;
  let sourceStat;
  try {
    auditStat = statSync(auditPath);
    sourceStat = statSync(componentSourcePath);
  } catch {
    return undefined;
  }
  // Freshness must compare against the LATEST mtime across both the .ts
  // source AND the sibling .styles.ts — accessibility changes (focus-ring,
  // forced-colors, color-contrast) commonly land in the stylesheet and
  // would otherwise leave a stale audit reading as fresh (codex push-gate
  // P2, 2026-05-10).
  let latestSourceMtime = sourceStat.mtime.getTime();
  const stylesPath = componentSourcePath.replace(
    /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/,
    '.styles.$1',
  );
  if (stylesPath !== componentSourcePath) {
    try {
      const stylesStat = statSync(stylesPath);
      latestSourceMtime = Math.max(latestSourceMtime, stylesStat.mtime.getTime());
    } catch {
      // styles sidecar absent — fine, fall back to .ts only
    }
  }
  return {
    path: auditPath,
    fresh: auditStat.mtime.getTime() >= latestSourceMtime,
  };
}
