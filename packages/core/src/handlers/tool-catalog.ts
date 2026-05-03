/**
 * Machine-readable tool catalog (M6)
 *
 * The field report finding ("32 tools available, 0 invoked") came down
 * to discoverability: agents can't auto-discover what to call. This
 * module exposes the same registered tool definitions in a flatter,
 * agent-consumable shape:
 *
 *   - name, summary, when-to-call triggers (text patterns)
 *   - input shape (top-level arg names + required flags)
 *   - tags grouping by domain (audit, scaffold, validation, etc.)
 *
 * Consumers (the helixir-tools agent recipe, the rea push-gate
 * adoption telemetry, the docs site) call `buildToolCatalog()` once
 * and get a stable JSON document.
 */

// Each tool definition is shaped { name, description, inputSchema }.
// We intentionally don't import tool-group modules here to keep this
// file dependency-free for build-time generation; callers pass the
// catalog inputs directly.

/**
 * Loose shape — accepts every tool definition emitted by the
 * `*_TOOL_DEFINITIONS` arrays without needing each one to widen its
 * literal types. The catalog only reads, never validates, so unknown
 * keys are tolerated.
 */
export interface ToolCatalogEntryInput {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: readonly string[];
    additionalProperties?: boolean;
  };
}

export interface ToolCatalogEntry {
  name: string;
  summary: string;
  /**
   * Phrases an agent can match against a user request to decide whether
   * this tool is the right call. Derived from the tool description.
   */
  whenToCallTriggers: string[];
  inputs: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  tags: string[];
}

export interface ToolCatalog {
  schemaVersion: 1;
  generatedAt: string;
  toolCount: number;
  tools: ToolCatalogEntry[];
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build the machine-readable catalog from a flat list of tool
 * definitions. Pure function — pass in the union of all
 * `*_TOOL_DEFINITIONS` arrays from the dispatcher.
 */
export function buildToolCatalog(definitions: ToolCatalogEntryInput[]): ToolCatalog {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    toolCount: definitions.length,
    tools: definitions.map((d) => buildEntry(d)).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ─── Internals ──────────────────────────────────────────────────────────────

function buildEntry(def: ToolCatalogEntryInput): ToolCatalogEntry {
  const triggers = extractTriggers(def.description);
  const tags = extractTags(def.name);
  const required = new Set(def.inputSchema.required ?? []);
  const inputs = Object.entries(def.inputSchema.properties ?? {}).map(([name, schema]) => {
    // Schema entries are user-supplied JSON; defensively narrow.
    const s = (schema ?? {}) as { type?: string; description?: string };
    return {
      name,
      type: typeof s.type === 'string' ? s.type : 'unknown',
      required: required.has(name),
      description: typeof s.description === 'string' ? s.description.trim() : '',
    };
  });
  return {
    name: def.name,
    summary: firstSentence(def.description),
    whenToCallTriggers: triggers,
    inputs,
    tags,
  };
}

function firstSentence(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/^(.+?[.!?])(\s|$)/);
  // m[1] is non-undefined when m is non-null (capture group always
  // present). The narrowing isn't visible to TS without a type guard.
  return (m && m[1] !== undefined ? m[1] : trimmed).trim();
}

/**
 * Extract trigger phrases from the description. Heuristic: pull
 * verb+noun phrases that hint at user intents ("audit a component",
 * "scaffold", "validate", "check for breaking changes"). The
 * helixir-tools agent matches these against user requests.
 */
function extractTriggers(description: string): string[] {
  const triggers = new Set<string>();
  const lower = description.toLowerCase();

  // Common audit / verify / scaffold / generate / list / find vocabulary.
  const verbPatterns = [
    /\b(audit|verify|validate|check|inspect)\s+([a-z][a-z\s-]{2,40})/g,
    /\b(scaffold|generate|create)\s+([a-z][a-z\s-]{2,40})/g,
    /\b(list|find|get|search)\s+([a-z][a-z\s-]{2,40})/g,
    /\b(extend|migrate|upgrade)\s+([a-z][a-z\s-]{2,40})/g,
  ];
  for (const pattern of verbPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(lower)) !== null) {
      const phrase = `${m[1] ?? ''} ${(m[2] ?? '').replace(/\s+/g, ' ').trim()}`.trim();
      if (phrase.length >= 4 && phrase.length <= 60) triggers.add(phrase);
    }
  }
  return [...triggers].slice(0, 8);
}

/**
 * Tag a tool by its name prefix / suffix. The tag set is small and
 * stable so agent recipes can filter by tag (e.g. "show me audit tools").
 */
function extractTags(name: string): string[] {
  const tags: string[] = [];
  if (name.startsWith('audit_') || name.includes('_audit')) tags.push('audit');
  if (name.startsWith('verify_')) tags.push('verify');
  if (name.startsWith('analyze_')) tags.push('analyze');
  if (name.startsWith('list_') || name.startsWith('find_')) tags.push('discovery');
  if (name.startsWith('get_')) tags.push('read');
  if (name.startsWith('score_') || name.includes('health')) tags.push('scoring');
  if (name.startsWith('scaffold_') || name === 'extend_component') tags.push('scaffold');
  if (name === 'validate_usage' || name.startsWith('check_')) tags.push('validation');
  if (name.includes('token') || name.includes('css') || name.includes('theme')) tags.push('tokens');
  if (
    name.includes('extend') ||
    name === 'verify_extension' ||
    name === 'verify_token_inheritance'
  ) {
    tags.push('extension');
  }
  return [...new Set(tags)];
}
