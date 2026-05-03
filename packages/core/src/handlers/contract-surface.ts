/**
 * Contract Surface Extractor (M3)
 *
 * Reduces a CEM declaration to its public-API contract surface — the
 * shape that consumers depend on and that an audit needs to evaluate
 * against helix's R12-R32 patterns.
 *
 * The extracted surface serves two purposes:
 *   1. Input to the codex audit prompt (M3)
 *   2. Cache key for `audit-cache.ts` — sha256 of stable JSON. Re-runs
 *      with no surface change hit cache and skip the codex call.
 *
 * Why a surface (not the raw CEM declaration)?
 *   - Stable across cosmetic CEM regenerations (line moves, comment
 *     edits) so the audit cache stays warm.
 *   - Strips internal helpers / private members that don't shape the
 *     consumer contract.
 *   - Normalizes ordering (alphabetical) so the hash is deterministic
 *     across CEM tools that emit in different orders.
 *
 * Reused by M5's `verify_extension`: the parent's contract surface IS
 * the contract a subclass must preserve.
 */

import { createHash } from 'node:crypto';
import type { CemDeclaration, CemMember } from './cem.js';

// ─── Contract-surface types ─────────────────────────────────────────────────

export interface ContractSurfaceAttribute {
  name: string;
  type: string | null;
  reflects: boolean;
  default: string | null;
  description: string;
}

export interface ContractSurfaceSlot {
  name: string;
  description: string;
}

export interface ContractSurfaceCssPart {
  name: string;
  description: string;
}

export interface ContractSurfaceCssProperty {
  name: string;
  default: string | null;
  description: string;
}

export interface ContractSurfaceEvent {
  name: string;
  type: string | null;
  description: string;
}

export interface ContractSurfaceMember {
  kind: 'field' | 'method';
  name: string;
  type: string | null;
  description: string;
  inheritedFromName: string | null;
  /** Reflected attribute name when the member is an attribute-bound field. */
  attribute: string | null;
}

/**
 * The public contract surface for a single component. This is the
 * complete set of facts the audit pipeline reasons about — anything
 * not on this surface is by definition not part of the component's
 * consumer contract.
 */
export interface ContractSurface {
  tagName: string;
  className: string;
  description: string;
  superclassName: string | null;
  mixinNames: string[];
  formAssociated: boolean | null;
  /**
   * Attributes derived from `members` with an `attribute` field set.
   * The CEM schema doesn't have a top-level `attributes` array — it's
   * always reflected through fields. We extract them here for
   * convenience and to keep the audit prompt's surface coherent.
   */
  attributes: ContractSurfaceAttribute[];
  slots: ContractSurfaceSlot[];
  cssParts: ContractSurfaceCssPart[];
  cssProperties: ContractSurfaceCssProperty[];
  events: ContractSurfaceEvent[];
  members: ContractSurfaceMember[];
}

// ─── Extraction ─────────────────────────────────────────────────────────────

/** Internal-only members are stripped from the contract surface. */
function isPublicMember(member: CemMember): boolean {
  // The CEM schema doesn't carry a `privacy` field, so we lean on the
  // name convention helix uses: leading `_` or `#` means private.
  // Authors who want stronger guarantees should mark @public/@private
  // in JSDoc and have the CEM tool surface it.
  if (member.name.startsWith('_') || member.name.startsWith('#')) return false;
  return true;
}

function memberKind(kind: string): 'field' | 'method' | null {
  if (kind === 'field') return 'field';
  if (kind === 'method') return 'method';
  return null;
}

function typeText(type: { text?: string } | undefined): string | null {
  if (!type || typeof type.text !== 'string' || type.text.trim() === '') return null;
  return type.text.trim();
}

/**
 * Extract the public contract surface from a CEM declaration. The
 * result is normalized (alphabetical ordering, trimmed strings) so the
 * stable JSON of the surface is identical across cosmetic regenerations.
 */
export function extractContractSurface(decl: CemDeclaration): ContractSurface {
  const sortByName = <T extends { name: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => a.name.localeCompare(b.name));

  // Attributes come from members that declare an `attribute` field.
  // CEM doesn't carry a top-level `attributes` array.
  const attributes: ContractSurfaceAttribute[] = sortByName(
    (decl.members ?? [])
      .filter((m) => m.kind === 'field' && typeof m.attribute === 'string' && m.attribute !== '')
      .map((m) => ({
        name: m.attribute as string,
        type: typeText(m.type),
        reflects: m.reflects ?? false,
        default: m.default !== undefined ? String(m.default) : null,
        description: (m.description ?? '').trim(),
      })),
  );

  const slots: ContractSurfaceSlot[] = sortByName(
    (decl.slots ?? []).map((s) => ({
      name: s.name,
      description: (s.description ?? '').trim(),
    })),
  );

  const cssParts: ContractSurfaceCssPart[] = sortByName(
    (decl.cssParts ?? []).map((p) => ({
      name: p.name,
      description: (p.description ?? '').trim(),
    })),
  );

  const cssProperties: ContractSurfaceCssProperty[] = sortByName(
    (decl.cssProperties ?? []).map((p) => ({
      name: p.name,
      default: p.default !== undefined ? String(p.default) : null,
      description: (p.description ?? '').trim(),
    })),
  );

  const events: ContractSurfaceEvent[] = sortByName(
    (decl.events ?? []).map((e) => ({
      name: e.name,
      type: typeText(e.type),
      description: (e.description ?? '').trim(),
    })),
  );

  const members: ContractSurfaceMember[] = sortByName(
    (decl.members ?? [])
      .filter(isPublicMember)
      .map((m) => {
        const kind = memberKind(m.kind);
        if (kind === null) return null;
        return {
          kind,
          name: m.name,
          type: typeText(m.type),
          description: (m.description ?? '').trim(),
          inheritedFromName: m.inheritedFrom?.name ?? null,
          attribute: typeof m.attribute === 'string' && m.attribute !== '' ? m.attribute : null,
        };
      })
      .filter((m): m is ContractSurfaceMember => m !== null),
  );

  return {
    tagName: decl.tagName ?? '',
    className: decl.name,
    description: (decl.description ?? '').trim(),
    superclassName: decl.superclass?.name ?? null,
    mixinNames: (decl.mixins ?? [])
      .map((m) => m.name)
      .filter((n): n is string => Boolean(n))
      .sort(),
    // formAssociated lives in jsdocTags or as a top-level flag; we
    // surface whichever the CEM tool emits. Null = not declared.
    formAssociated:
      (decl as { formAssociated?: boolean }).formAssociated ??
      ((decl.jsdocTags ?? []).some((t) => (t.name ?? '').toLowerCase() === 'formassociated')
        ? true
        : null),
    attributes,
    slots,
    cssParts,
    cssProperties,
    events,
    members,
  };
}

// ─── Hashing ────────────────────────────────────────────────────────────────

/**
 * Stable JSON stringification — keys sorted at every level so the hash
 * is invariant under property-order shuffles. This is the cache-key
 * input for `audit-cache.ts`.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

/**
 * Returns a stable sha256 hash of a contract surface. Two surfaces that
 * are structurally equal produce the same hash regardless of property
 * ordering. Used as the per-component cache key for codex audits.
 */
export function hashContractSurface(surface: ContractSurface): string {
  return createHash('sha256').update(stableStringify(surface)).digest('hex');
}
