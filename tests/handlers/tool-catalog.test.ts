/**
 * M6 Tool catalog tests
 *
 * The catalog has to be deterministic, derive triggers + tags from the
 * existing tool definitions (no hand-maintained list), and survive
 * additions to the tool surface without code changes.
 */

import { describe, it, expect } from 'vitest';
import { buildToolCatalog } from '../../packages/core/src/handlers/tool-catalog.js';
import type { ToolCatalogEntryInput } from '../../packages/core/src/handlers/tool-catalog.js';

const SAMPLE_DEFS: ToolCatalogEntryInput[] = [
  {
    name: 'audit_component_with_codex',
    description:
      'Run a structured codex adversarial audit against one component. Caches results by contract-surface hash so unchanged surfaces hit cache instantly.',
    inputSchema: {
      type: 'object',
      properties: {
        tagName: { type: 'string', description: 'Custom element tag name' },
        force: { type: 'boolean', description: 'Skip cache' },
      },
      required: ['tagName'],
    },
  },
  {
    name: 'verify_token_inheritance',
    description:
      'Audit a component for token-related defects across helix R8/R11/R14/R32 alias renames.',
    inputSchema: {
      type: 'object',
      properties: {
        tagName: { type: 'string', description: 'Tag name' },
      },
      required: ['tagName'],
    },
  },
  {
    name: 'list_components',
    description: 'List all custom element components registered in the Custom Elements Manifest.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'scaffold_component',
    description: 'Generate a new helix-pattern component scaffold (Lit + tests + story).',
    inputSchema: {
      type: 'object',
      properties: {
        tagName: { type: 'string' },
      },
      required: ['tagName'],
    },
  },
];

describe('buildToolCatalog', () => {
  it('returns a stable schema with toolCount', () => {
    const cat = buildToolCatalog(SAMPLE_DEFS);
    expect(cat.schemaVersion).toBe(1);
    expect(cat.toolCount).toBe(SAMPLE_DEFS.length);
    expect(cat.tools.length).toBe(SAMPLE_DEFS.length);
  });

  it('sorts tools alphabetically by name (stable iteration order for agents)', () => {
    const cat = buildToolCatalog(SAMPLE_DEFS);
    const names = cat.tools.map((t) => t.name);
    expect(names).toEqual([...names].sort());
  });

  it('extracts the first sentence as the summary', () => {
    const cat = buildToolCatalog(SAMPLE_DEFS);
    const audit = cat.tools.find((t) => t.name === 'audit_component_with_codex');
    expect(audit?.summary).toBe('Run a structured codex adversarial audit against one component.');
  });

  it('marks required vs optional inputs', () => {
    const cat = buildToolCatalog(SAMPLE_DEFS);
    const audit = cat.tools.find((t) => t.name === 'audit_component_with_codex');
    const tagInput = audit?.inputs.find((i) => i.name === 'tagName');
    const forceInput = audit?.inputs.find((i) => i.name === 'force');
    expect(tagInput?.required).toBe(true);
    expect(forceInput?.required).toBe(false);
  });

  it('tags audit tools with "audit"', () => {
    const cat = buildToolCatalog(SAMPLE_DEFS);
    const audit = cat.tools.find((t) => t.name === 'audit_component_with_codex');
    expect(audit?.tags).toContain('audit');
  });

  it('tags verify_token_inheritance with verify, tokens, and extension', () => {
    const cat = buildToolCatalog(SAMPLE_DEFS);
    const verify = cat.tools.find((t) => t.name === 'verify_token_inheritance');
    expect(verify?.tags).toContain('verify');
    expect(verify?.tags).toContain('tokens');
    expect(verify?.tags).toContain('extension');
  });

  it('tags scaffold_component with "scaffold"', () => {
    const cat = buildToolCatalog(SAMPLE_DEFS);
    const scaffold = cat.tools.find((t) => t.name === 'scaffold_component');
    expect(scaffold?.tags).toContain('scaffold');
  });

  it('tags list_components with "discovery"', () => {
    const cat = buildToolCatalog(SAMPLE_DEFS);
    const list = cat.tools.find((t) => t.name === 'list_components');
    expect(list?.tags).toContain('discovery');
  });

  it('extracts whenToCallTriggers from verb+noun phrases in descriptions', () => {
    const cat = buildToolCatalog(SAMPLE_DEFS);
    const list = cat.tools.find((t) => t.name === 'list_components');
    expect(list?.whenToCallTriggers.some((t) => t.includes('list'))).toBe(true);
  });

  it('handles tools with no input properties', () => {
    const cat = buildToolCatalog([
      {
        name: 'rea_status',
        description: 'Print rea status.',
        inputSchema: { type: 'object' },
      },
    ]);
    expect(cat.tools[0]?.inputs).toEqual([]);
  });

  it('emits a generatedAt ISO timestamp', () => {
    const cat = buildToolCatalog(SAMPLE_DEFS);
    expect(() => new Date(cat.generatedAt)).not.toThrow();
    expect(cat.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
