import { z } from 'zod';
import type { McpWcConfig } from '../config.js';
import { GitOperations } from '../shared/git.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

// --- CEM Zod Schemas ---

const CemInheritedFromSchema = z.object({
  name: z.string(),
  module: z.string().optional(),
  package: z.string().optional(),
});

const CemMemberSchema = z.object({
  kind: z.string(),
  name: z.string(),
  type: z.object({ text: z.string() }).optional(),
  description: z.string().optional(),
  attribute: z.string().optional(),
  reflects: z.boolean().optional(),
  default: z.string().optional(),
  return: z.object({ type: z.object({ text: z.string() }) }).optional(),
  inheritedFrom: CemInheritedFromSchema.optional(),
});

const CemEventSchema = z.object({
  name: z.string().default(''),
  type: z.object({ text: z.string() }).optional(),
  description: z.string().optional(),
});

const CemSlotSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

const CemCssPartSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

const CemCssPropertySchema = z.object({
  name: z.string(),
  default: z.string().optional(),
  description: z.string().optional(),
});

const CemReferenceSchema = z.object({
  name: z.string(),
  package: z.string().optional(),
  module: z.string().optional(),
});

const CemJsdocTagSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

const CemSuperclassSchema = z.object({
  name: z.string().default(''),
  package: z.string().optional(),
  module: z.string().optional(),
});

const CemMixinSchema = z.object({
  name: z.string().default(''),
  package: z.string().optional(),
  module: z.string().optional(),
});

const CemDeclarationSchema = z.object({
  kind: z.string(),
  name: z.string(),
  tagName: z
    .string()
    .optional()
    .transform((v) => (v && /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(v) ? v : undefined)),
  description: z.string().optional(),
  superclass: CemSuperclassSchema.optional(),
  mixins: z.array(CemMixinSchema).optional(),
  members: z.array(CemMemberSchema).optional(),
  events: z.array(CemEventSchema).optional(),
  slots: z.array(CemSlotSchema).optional(),
  cssParts: z.array(CemCssPartSchema).optional(),
  cssProperties: z.array(CemCssPropertySchema).optional(),
  references: z.array(CemReferenceSchema).optional(),
  packageName: z.string().optional(),
  jsdocTags: z.array(CemJsdocTagSchema).optional(),
});

const CemModuleSchema = z.object({
  kind: z.string(),
  path: z.string(),
  declarations: z.array(CemDeclarationSchema).optional(),
  references: z.array(CemReferenceSchema).optional(),
});

export const CemSchema = z.object({
  schemaVersion: z.string(),
  modules: z.array(CemModuleSchema),
});

export type Cem = z.infer<typeof CemSchema>;
export type CemMember = z.infer<typeof CemMemberSchema>;
export type CemEvent = z.infer<typeof CemEventSchema>;
export type CemSlot = z.infer<typeof CemSlotSchema>;
export type CemCssPart = z.infer<typeof CemCssPartSchema>;
export type CemDeclaration = z.infer<typeof CemDeclarationSchema>;
export type CemJsdocTag = z.infer<typeof CemJsdocTagSchema>;
export type CemSuperclass = z.infer<typeof CemSuperclassSchema>;
export type CemMixin = z.infer<typeof CemMixinSchema>;
export type CemInheritedFrom = z.infer<typeof CemInheritedFromSchema>;

// --- Public types ---

export interface ComponentMetadata {
  tagName: string;
  name: string;
  description: string;
  members: Array<{ name: string; kind: string; type: string; description: string }>;
  events: Array<{ name: string; type: string; description: string }>;
  slots: Array<{ name: string; description: string }>;
  cssProperties: Array<{ name: string; description: string }>;
  cssParts: Array<{ name: string; description: string }>;
}

export interface CompletenessResult {
  score: number;
  issues: string[];
}

export interface DiffResult {
  isNew: boolean;
  breaking: string[];
  additions: string[];
}

// --- Source path helpers ---

/**
 * Returns the module path for a declaration with the given tagName.
 * CEM modules have `path` (e.g., "src/components/my-button.js").
 * This helper finds the module containing the declaration and returns its path.
 */
export function getDeclarationSourcePath(cem: Cem, tagName: string): string | null {
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tagName) {
        return mod.path;
      }
    }
  }
  return null;
}

/**
 * Returns the inheritance chain paths for a declaration: superclass + all mixins.
 * These paths come from the CEM's `superclass.module`/`superclass.package` and
 * `mixins[].module`/`mixins[].package` fields.
 *
 * Paths may be:
 *   - Relative module paths: "/packages/accordion/src/vaadin-accordion-mixin.js"
 *   - Package paths: "@vaadin/a11y-base/src/active-mixin.js"
 *   - Undefined (no path info in CEM)
 *
 * Returns: Array of { name, modulePath } for all superclasses and mixins.
 */
export interface InheritanceEntry {
  name: string;
  modulePath: string | null;
  type: 'superclass' | 'mixin';
}

export function getInheritanceChain(decl: CemDeclaration): InheritanceEntry[] {
  const chain: InheritanceEntry[] = [];

  // Add superclass (if not a platform class like HTMLElement, LitElement)
  if (decl.superclass) {
    const sc = decl.superclass;
    const isFrameworkBase =
      /^(HTMLElement|LitElement|FASTElement|PolymerElement|ReactiveElement)$/.test(sc.name);
    if (!isFrameworkBase) {
      chain.push({
        name: sc.name,
        modulePath: sc.module ?? sc.package ?? null,
        type: 'superclass',
      });
    }
  }

  // Add all mixins
  for (const mixin of decl.mixins ?? []) {
    chain.push({
      name: mixin.name,
      modulePath: mixin.module ?? mixin.package ?? null,
      type: 'mixin',
    });
  }

  return chain;
}

// --- Private helpers ---

function findDeclaration(cem: Cem, tagName: string): CemDeclaration | undefined {
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tagName) {
        return decl;
      }
    }
  }
  return undefined;
}

function mapDeclaration(decl: CemDeclaration): ComponentMetadata {
  return {
    tagName: decl.tagName ?? '',
    name: decl.name,
    description: decl.description ?? '',
    members: (decl.members ?? []).map((m) => ({
      name: m.name,
      kind: m.kind,
      type: m.type?.text ?? '',
      description: m.description ?? '',
    })),
    events: (decl.events ?? []).map((e) => ({
      name: e.name,
      type: e.type?.text ?? '',
      description: e.description ?? '',
    })),
    slots: (decl.slots ?? []).map((s) => ({
      name: s.name,
      description: s.description ?? '',
    })),
    cssProperties: (decl.cssProperties ?? []).map((p) => ({
      name: p.name,
      description: p.description ?? '',
    })),
    cssParts: (decl.cssParts ?? []).map((p) => ({
      name: p.name,
      description: p.description ?? '',
    })),
  };
}

// --- Public API ---

/**
 * Parses a Custom Elements Manifest and extracts component metadata for a given tag name.
 * @param tagName - The custom element tag name to look up (e.g. "my-button")
 * @param cem - The parsed Custom Elements Manifest
 * @returns The component's full metadata including members, events, slots, and CSS API
 */
export function parseCem(tagName: string, cem: Cem): ComponentMetadata {
  const decl = findDeclaration(cem, tagName);
  if (!decl) {
    throw new MCPError(`Component "${tagName}" not found in CEM.`, ErrorCategory.NOT_FOUND);
  }
  return mapDeclaration(decl);
}

/**
 * Checks whether a component's CEM entry has sufficient documentation coverage.
 * Inspects descriptions on the component itself, its properties, events, slots, CSS properties, and CSS parts.
 * @param tagName - The custom element tag name to validate
 * @param cem - The parsed Custom Elements Manifest
 * @returns A completeness score (0–100) and a list of missing-documentation issues
 */
export function validateCompleteness(tagName: string, cem: Cem): CompletenessResult {
  const decl = findDeclaration(cem, tagName);
  if (!decl) {
    throw new MCPError(`Component "${tagName}" not found in CEM.`, ErrorCategory.NOT_FOUND);
  }

  const issues: string[] = [];
  let total = 0;
  let missing = 0;

  // Component description
  total++;
  if (!decl.description) {
    issues.push('Component is missing a description');
    missing++;
  }

  // Field members only (skip methods)
  const fields = (decl.members ?? []).filter((m) => m.kind === 'field');
  for (const field of fields) {
    total++;
    if (!field.description) {
      issues.push(`Property "${field.name}" is missing a description`);
      missing++;
    }
  }

  // Events — check description and type separately
  for (const event of decl.events ?? []) {
    total++;
    if (!event.description) {
      issues.push(`Event "${event.name}" is missing a description`);
      missing++;
    }
    total++;
    if (!event.type?.text) {
      issues.push(`Event "${event.name}" is missing a type annotation`);
      missing++;
    }
  }

  // Slots
  for (const slot of decl.slots ?? []) {
    total++;
    if (!slot.description) {
      issues.push(`Slot "${slot.name || '(default)'}" is missing a description`);
      missing++;
    }
  }

  // CSS properties
  for (const prop of decl.cssProperties ?? []) {
    total++;
    if (!prop.description) {
      issues.push(`CSS property "${prop.name}" is missing a description`);
      missing++;
    }
  }

  // CSS parts
  for (const part of decl.cssParts ?? []) {
    total++;
    if (!part.description) {
      issues.push(`CSS part "${part.name}" is missing a description`);
      missing++;
    }
  }

  const score = total === 0 ? 100 : Math.round(((total - missing) / total) * 100);
  return { score, issues };
}

// --- Cross-component aggregation types ---

export interface EventRow {
  eventName: string;
  tagName: string;
  description: string;
  type: string;
}

export interface SlotRow {
  slotName: string;
  tagName: string;
  description: string;
  isDefault: boolean;
}

export interface CssPartRow {
  partName: string;
  tagName: string;
  description: string;
}

// --- Cross-component aggregation functions ---

/**
 * Lists all custom events declared across components in the CEM.
 * @param cem - The parsed Custom Elements Manifest
 * @param tagName - Optional tag name to filter results to a single component
 * @returns An array of event rows with the event name, owning tag, description, and type
 */
export function listAllEvents(cem: Cem, tagName?: string): EventRow[] {
  const rows: EventRow[] = [];
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue;
      if (tagName && decl.tagName !== tagName) continue;
      for (const event of decl.events ?? []) {
        rows.push({
          eventName: event.name,
          tagName: decl.tagName,
          description: event.description ?? '',
          type: event.type?.text ?? '',
        });
      }
    }
  }
  return rows;
}

export function listAllSlots(cem: Cem, tagName?: string): SlotRow[] {
  const rows: SlotRow[] = [];
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue;
      if (tagName && decl.tagName !== tagName) continue;
      for (const slot of decl.slots ?? []) {
        rows.push({
          slotName: slot.name,
          tagName: decl.tagName,
          description: slot.description ?? '',
          isDefault: slot.name === '',
        });
      }
    }
  }
  return rows;
}

export function listAllCssParts(cem: Cem, tagName?: string): CssPartRow[] {
  const rows: CssPartRow[] = [];
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue;
      if (tagName && decl.tagName !== tagName) continue;
      for (const part of decl.cssParts ?? []) {
        rows.push({
          partName: part.name,
          tagName: decl.tagName,
          description: part.description ?? '',
        });
      }
    }
  }
  return rows;
}

export function listAllComponents(cem: Cem): string[] {
  const tagNames: string[] = [];
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName) {
        tagNames.push(decl.tagName);
      }
    }
  }
  return tagNames;
}

export async function diffCem(
  tagName: string,
  baseBranch: string,
  config: McpWcConfig,
  cem: Cem,
): Promise<DiffResult> {
  // Get current branch component metadata from cached CEM
  const current = parseCem(tagName, cem);

  // Read base branch's CEM via git show — no stash, no checkout, no working-tree mutation
  const gitOps = new GitOperations();

  let baseMeta: ComponentMetadata | null = null;

  try {
    const cemContent = await gitOps.gitShow(baseBranch, config.cemPath);
    const rawJson: unknown = JSON.parse(cemContent);
    const baseCem = CemSchema.parse(rawJson);
    const baseDecl = findDeclaration(baseCem, tagName);
    if (baseDecl) {
      baseMeta = mapDeclaration(baseDecl);
    }
  } catch {
    // CEM missing or unreadable on base branch — component is new
  }

  if (!baseMeta) {
    return { isNew: true, breaking: [], additions: [] };
  }

  const breaking: string[] = [];
  const additions: string[] = [];

  // Compare field members
  const baseFields = (baseMeta as ComponentMetadata).members.filter((m) => m.kind === 'field');
  const currentFields = current.members.filter((m) => m.kind === 'field');
  const baseFieldMap = new Map(baseFields.map((f) => [f.name, f]));
  const currentFieldMap = new Map(currentFields.map((f) => [f.name, f]));

  for (const [name, baseField] of baseFieldMap) {
    const currentField = currentFieldMap.get(name);
    if (!currentField) {
      breaking.push(`Property removed: ${name}`);
    } else if (baseField.type && currentField.type && baseField.type !== currentField.type) {
      breaking.push(`Property type changed: ${name} (${baseField.type} → ${currentField.type})`);
    }
  }

  for (const [name] of currentFieldMap) {
    if (!baseFieldMap.has(name)) {
      additions.push(`Property added: ${name}`);
    }
  }

  // Compare events
  const baseEventMap = new Map((baseMeta as ComponentMetadata).events.map((e) => [e.name, e]));
  const currentEventMap = new Map(current.events.map((e) => [e.name, e]));

  for (const [name] of baseEventMap) {
    if (!currentEventMap.has(name)) {
      breaking.push(`Event removed: ${name}`);
    }
  }

  for (const [name] of currentEventMap) {
    if (!baseEventMap.has(name)) {
      additions.push(`Event added: ${name}`);
    }
  }

  return { isNew: false, breaking, additions };
}

// --- Monorepo / multi-package support ---

export interface PackagedCem {
  cem: Cem;
  packageName: string;
}

/**
 * Merges multiple packaged CEMs into a single CEM.
 * Tag names that collide across packages are namespaced as `packageName:tagName`.
 * Sets `packageName` on every declaration for provenance tracking.
 */
export function mergeCems(packages: PackagedCem[]): Cem {
  if (packages.length === 0) {
    return { schemaVersion: '1.0.0', modules: [] };
  }

  // Count occurrences of each tagName across all packages
  const tagCounts = new Map<string, number>();
  for (const { cem } of packages) {
    for (const mod of cem.modules) {
      for (const decl of mod.declarations ?? []) {
        if (decl.tagName) {
          tagCounts.set(decl.tagName, (tagCounts.get(decl.tagName) ?? 0) + 1);
        }
      }
    }
  }

  const mergedModules: Cem['modules'] = [];

  for (const { cem, packageName } of packages) {
    for (const mod of cem.modules) {
      const newDecls = (mod.declarations ?? []).map((decl) => {
        const collides = decl.tagName !== undefined && (tagCounts.get(decl.tagName) ?? 0) > 1;
        return {
          ...decl,
          tagName: collides ? `${packageName}:${decl.tagName}` : decl.tagName,
          packageName,
        };
      });
      mergedModules.push({ ...mod, declarations: newDecls });
    }
  }

  return {
    schemaVersion: (packages[0] as PackagedCem).cem.schemaVersion,
    modules: mergedModules,
  };
}

// --- Namespaced CEM Store ---

export type CemSourceType = 'config' | 'local' | 'cdn';

export interface CemStoreEntry {
  cem: Cem;
  sourceType: CemSourceType;
  componentCount: number;
}

const cemStore = new Map<string, CemStoreEntry>();

/**
 * Loads a CEM into the namespaced store under the given libraryId.
 * The "default" library is loaded from config at startup.
 */
export function loadLibrary(
  libraryId: string,
  cem: Cem,
  sourceType: CemSourceType = 'local',
): void {
  const componentCount = cem.modules
    .flatMap((m) => m.declarations ?? [])
    .filter((d) => d.tagName).length;
  cemStore.set(libraryId, { cem, sourceType, componentCount });
}

/**
 * Returns the CEM for a given libraryId, or undefined if not loaded.
 */
export function getLibrary(libraryId: string): Cem | undefined {
  return cemStore.get(libraryId)?.cem;
}

/**
 * Returns all loaded library IDs with component counts and source types.
 */
export function listLibraries(): Array<{
  libraryId: string;
  componentCount: number;
  sourceType: CemSourceType;
}> {
  return Array.from(cemStore.entries()).map(([libraryId, entry]) => ({
    libraryId,
    componentCount: entry.componentCount,
    sourceType: entry.sourceType,
  }));
}

/**
 * Removes a library from the store. Cannot remove the "default" library.
 * Returns true if the library was removed, false if it was not found.
 */
export function removeLibrary(libraryId: string): boolean {
  if (libraryId === 'default') return false;
  return cemStore.delete(libraryId);
}

/**
 * Clears all non-default libraries from the store. Intended for use in tests.
 */
export function clearCemStore(): void {
  const defaultEntry = cemStore.get('default');
  cemStore.clear();
  if (defaultEntry) cemStore.set('default', defaultEntry);
}

/**
 * Clears ALL libraries from the store, including default. Intended for use in tests.
 */
export function resetCemStore(): void {
  cemStore.clear();
}

// --- Backward-compatible CDN aliases ---

/**
 * Loads a CDN-resolved CEM into the store under the given libraryId.
 * @deprecated Use loadLibrary(libraryId, cem, 'cdn') instead.
 */
export function loadCdnCem(libraryId: string, cem: Cem): void {
  loadLibrary(libraryId, cem, 'cdn');
}

/**
 * Clears all non-default libraries from the store. Intended for use in tests.
 * @deprecated Use clearCemStore() instead.
 */
export function clearCdnCemCache(): void {
  clearCemStore();
}

/**
 * Returns a merged CEM combining the local CEM with all non-default loaded CEMs.
 * If no additional CEMs have been loaded, returns the local CEM unchanged.
 * Tag names that collide across packages are namespaced as `libraryId:tagName`.
 */
export function getMergedCem(localCem: Cem): Cem {
  // Collect all non-default libraries
  const additionalLibs = Array.from(cemStore.entries()).filter(([id]) => id !== 'default');
  if (additionalLibs.length === 0) return localCem;

  const packages: PackagedCem[] = [
    { cem: localCem, packageName: 'local' },
    ...additionalLibs.map(([id, entry]) => ({ cem: entry.cem, packageName: id })),
  ];

  return mergeCems(packages);
}

/**
 * Resolves which CEM to use based on an optional libraryId parameter.
 * If libraryId is provided and found, returns that library's CEM.
 * If libraryId is omitted or "default", returns the merged CEM (backward compat).
 * Throws if a specific libraryId is requested but not found.
 */
export function resolveCem(libraryId: string | undefined, defaultCem: Cem): Cem {
  if (!libraryId || libraryId === 'default') {
    return getMergedCem(defaultCem);
  }
  const entry = cemStore.get(libraryId);
  if (!entry) {
    throw new MCPError(
      `Library "${libraryId}" not found. Use list_libraries to see loaded libraries.`,
      ErrorCategory.NOT_FOUND,
    );
  }
  return entry.cem;
}

// --- Token-component lookup ---

export interface TokenComponentMatch {
  tagName: string;
  tokenDescription: string;
  defaultValue: string;
}

export interface FindComponentsByTokenResult {
  token: string;
  totalMatches: number;
  components: TokenComponentMatch[];
}

/**
 * Finds all components that reference a given CSS custom property token.
 * @param token - The CSS custom property name (must start with "--")
 * @param partialMatch - When true, matches any token containing `token` as a substring
 * @param cem - The parsed Custom Elements Manifest
 */
export function findComponentsByToken(
  token: string,
  partialMatch: boolean,
  cem: Cem,
): FindComponentsByTokenResult {
  if (!token.startsWith('--')) {
    throw new Error(`CSS custom property name must start with "--": "${token}"`);
  }

  const components: TokenComponentMatch[] = [];

  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue;
      for (const prop of decl.cssProperties ?? []) {
        const matches = partialMatch ? prop.name.includes(token) : prop.name === token;
        if (matches) {
          components.push({
            tagName: decl.tagName,
            tokenDescription: prop.description ?? '',
            defaultValue: prop.default ?? '',
          });
        }
      }
    }
  }

  return { token, totalMatches: components.length, components };
}
