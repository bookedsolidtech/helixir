/**
 * Audit Cache (M3)
 *
 * Stores codex audit results keyed by `(tagName, contract-surface
 * hash)`. Re-runs against an unchanged surface skip the codex call and
 * return the prior verdict — mandatory for budget control because 81
 * components × routine codex run is otherwise unsustainable.
 *
 * Cache layout:
 *   audits/
 *     <tagName>/
 *       index.json              — { entries: { <surfaceHash>: <date> }, head: <date> }
 *       <date-iso>.md           — human-readable audit
 *       <date-iso>.json         — machine-readable findings
 *
 * Cache-key invariant: surface-hash, NOT commit sha. A CEM regen that
 * produces identical surfaces (cosmetic changes, decl reorder) is a
 * cache hit. A surface change forces a fresh audit even on the same
 * commit.
 *
 * The cache is also content-addressed safety: if a stored audit's
 * surface-hash doesn't match the current surface (manually edited
 * .json file?), the cache treats it as a miss and re-runs.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AuditSeverity = 'P1' | 'P2' | 'P3';
export type AuditVerdict = 'pass' | 'concerns' | 'blocking';

export interface AuditFinding {
  severity: AuditSeverity;
  /** Defect-corpus class id (e.g. "01-token-deprecated-alias") if known. */
  classId: string | null;
  title: string;
  body: string;
  /** Source path (component file) the finding maps to, when available. */
  file: string | null;
  line: number | null;
}

export interface AuditEntry {
  schemaVersion: 1;
  tagName: string;
  surfaceHash: string;
  /** ISO-8601 timestamp when the audit was generated. */
  generatedAt: string;
  verdict: AuditVerdict;
  findings: AuditFinding[];
  /** Free-text codex review summary, optional. */
  reviewText?: string;
  /** How the entry was produced. */
  source: 'codex' | 'manual' | 'cached';
}

interface AuditIndex {
  schemaVersion: 1;
  /** Map of surfaceHash → audit basename (without extension). */
  entries: Record<string, string>;
  /** The most recent audit's basename for quick lookup. */
  head: string | null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Attempt to read a cached audit for `(tagName, surfaceHash)`. Returns
 * null on miss. The cache is content-addressed: if a stored audit's
 * recorded surfaceHash doesn't match the requested one, that's a miss
 * (someone hand-edited a .json file, etc).
 */
export function readCachedAudit(
  auditsRoot: string,
  tagName: string,
  surfaceHash: string,
): AuditEntry | null {
  const indexPath = componentIndexPath(auditsRoot, tagName);
  if (!existsSync(indexPath)) return null;

  let index: AuditIndex;
  try {
    const raw = readFileSync(indexPath, 'utf-8');
    index = JSON.parse(raw) as AuditIndex;
  } catch {
    return null;
  }

  const basename = index.entries[surfaceHash];
  if (!basename) return null;

  const entryPath = join(componentDir(auditsRoot, tagName), `${basename}.json`);
  if (!existsSync(entryPath)) return null;

  try {
    const raw = readFileSync(entryPath, 'utf-8');
    const entry = JSON.parse(raw) as AuditEntry;
    // Content-addressed safety check.
    if (entry.surfaceHash !== surfaceHash || entry.tagName !== tagName) return null;
    return { ...entry, source: 'cached' };
  } catch {
    return null;
  }
}

/**
 * Write an audit entry to the cache. Creates the component directory
 * if it doesn't exist, writes both the .md and .json files for this
 * audit, and updates the index. Returns the basename used (an ISO
 * timestamp safe for filesystem use).
 */
export function writeAudit(auditsRoot: string, entry: AuditEntry): string {
  const dir = componentDir(auditsRoot, entry.tagName);
  mkdirSync(dir, { recursive: true });

  const basename = isoBasename(entry.generatedAt);
  const jsonPath = join(dir, `${basename}.json`);
  const mdPath = join(dir, `${basename}.md`);

  writeFileSync(jsonPath, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
  writeFileSync(mdPath, renderAuditMarkdown(entry) + '\n', 'utf-8');

  // Update index. Preserve prior entries; new entry overwrites if the
  // same surfaceHash was already present (re-running with same input
  // shouldn't accumulate junk).
  const indexPath = componentIndexPath(auditsRoot, entry.tagName);
  const index: AuditIndex = { schemaVersion: 1, entries: {}, head: null };
  if (existsSync(indexPath)) {
    try {
      const raw = readFileSync(indexPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AuditIndex>;
      if (parsed.entries && typeof parsed.entries === 'object') {
        index.entries = parsed.entries;
      }
    } catch {
      // Bad index — start fresh.
    }
  }
  index.entries[entry.surfaceHash] = basename;
  index.head = basename;
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf-8');

  return basename;
}

/**
 * List the surface-hashes audited for a component. Useful for tooling
 * that wants to enumerate audit history.
 */
export function listAuditedSurfaces(auditsRoot: string, tagName: string): string[] {
  const indexPath = componentIndexPath(auditsRoot, tagName);
  if (!existsSync(indexPath)) return [];
  try {
    const raw = readFileSync(indexPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AuditIndex>;
    return Object.keys(parsed.entries ?? {});
  } catch {
    return [];
  }
}

/**
 * List every audited tag name under auditsRoot. Returns [] when the
 * directory doesn't exist.
 */
export function listAuditedComponents(auditsRoot: string): string[] {
  const root = resolve(auditsRoot);
  if (!existsSync(root)) return [];
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

// ─── Internals ──────────────────────────────────────────────────────────────

function componentDir(auditsRoot: string, tagName: string): string {
  // Tag names follow the custom-element spec ([a-z0-9-]) so they're
  // safe as path segments. Resolve against root to avoid traversal.
  return resolve(auditsRoot, tagName);
}

function componentIndexPath(auditsRoot: string, tagName: string): string {
  return join(componentDir(auditsRoot, tagName), 'index.json');
}

function isoBasename(iso: string): string {
  // Filesystem-safe ISO: replace `:` with `-`. Result still parseable.
  return iso.replace(/:/g, '-').replace(/\./g, '-');
}

/**
 * Render an audit entry as Markdown for human review. Mirrors the
 * shape of `bst-cto-kb/Projects/HELiXiR/Audits/defect-corpus/*.md`
 * so consumers see a familiar layout.
 */
function renderAuditMarkdown(entry: AuditEntry): string {
  const lines: string[] = [];
  lines.push(`# Audit — ${entry.tagName} — ${entry.generatedAt}`);
  lines.push('');
  lines.push(`- **Verdict:** ${entry.verdict}`);
  lines.push(`- **Surface hash:** \`${entry.surfaceHash}\``);
  lines.push(`- **Source:** ${entry.source}`);
  lines.push(`- **Findings:** ${entry.findings.length}`);
  lines.push('');
  if (entry.findings.length === 0) {
    lines.push('No findings.');
  } else {
    for (const f of entry.findings) {
      lines.push(`## [${f.severity}] ${f.title}`);
      if (f.classId !== null) lines.push(`- **Defect class:** \`${f.classId}\``);
      if (f.file !== null) {
        lines.push(`- **Location:** ${f.file}${f.line !== null ? ':' + String(f.line) : ''}`);
      }
      lines.push('');
      lines.push(f.body);
      lines.push('');
    }
  }
  if (entry.reviewText) {
    lines.push('---');
    lines.push('');
    lines.push('## Review summary');
    lines.push('');
    lines.push(entry.reviewText);
  }
  return lines.join('\n');
}
