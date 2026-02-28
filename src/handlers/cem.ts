import { resolve } from 'path';
import { z } from 'zod';
import type { McpWcConfig } from '../config.js';
import { SafeFileOperations } from '../shared/file-ops.js';
import { GitOperations } from '../shared/git.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

// --- CEM Zod Schemas ---

const CemMemberSchema = z.object({
  kind: z.string(),
  name: z.string(),
  type: z.object({ text: z.string() }).optional(),
  description: z.string().optional(),
  attribute: z.string().optional(),
  reflects: z.boolean().optional(),
  default: z.string().optional(),
  return: z.object({ type: z.object({ text: z.string() }) }).optional(),
});

const CemEventSchema = z.object({
  name: z.string(),
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

const CemDeclarationSchema = z.object({
  kind: z.string(),
  name: z.string(),
  tagName: z.string().optional(),
  description: z.string().optional(),
  members: z.array(CemMemberSchema).optional(),
  events: z.array(CemEventSchema).optional(),
  slots: z.array(CemSlotSchema).optional(),
  cssParts: z.array(CemCssPartSchema).optional(),
  cssProperties: z.array(CemCssPropertySchema).optional(),
});

const CemModuleSchema = z.object({
  kind: z.string(),
  path: z.string(),
  declarations: z.array(CemDeclarationSchema).optional(),
});

export const CemSchema = z.object({
  schemaVersion: z.string(),
  modules: z.array(CemModuleSchema),
});

type Cem = z.infer<typeof CemSchema>;
type CemDeclaration = z.infer<typeof CemDeclarationSchema>;

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

async function readCem(config: McpWcConfig): Promise<Cem> {
  const fileOps = new SafeFileOperations();
  const cemAbsPath = resolve(config.projectRoot, config.cemPath);
  return fileOps.readJSON(cemAbsPath, CemSchema);
}

// --- Public API ---

export async function parseCem(tagName: string, config: McpWcConfig): Promise<ComponentMetadata> {
  const cem = await readCem(config);
  const decl = findDeclaration(cem, tagName);
  if (!decl) {
    throw new MCPError(`Component "${tagName}" not found in CEM.`, ErrorCategory.NOT_FOUND);
  }
  return mapDeclaration(decl);
}

export async function validateCompleteness(
  tagName: string,
  config: McpWcConfig,
): Promise<CompletenessResult> {
  const cem = await readCem(config);
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

export async function listAllComponents(config: McpWcConfig): Promise<string[]> {
  const cem = await readCem(config);
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
): Promise<DiffResult> {
  // Get current branch component metadata
  const current = await parseCem(tagName, config);

  // Read base branch's CEM inside a git branch switch
  const fileOps = new SafeFileOperations();
  const gitOps = new GitOperations();
  const cemAbsPath = resolve(config.projectRoot, config.cemPath);

  let baseMeta: ComponentMetadata | null = null;

  await gitOps.withBranch(baseBranch, async () => {
    try {
      const baseCem = await fileOps.readJSON(cemAbsPath, CemSchema);
      const baseDecl = findDeclaration(baseCem, tagName);
      if (baseDecl) {
        baseMeta = mapDeclaration(baseDecl);
      }
    } catch {
      // CEM missing or unreadable on base branch — component is new
    }
  });

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
