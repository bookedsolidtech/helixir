/**
 * Tests for the @helixui/mcp public API surface.
 * Imports from the package source to verify all exports resolve correctly.
 *
 * Run from packages/mcp directory: pnpm test
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// Import through the package source entry point.
// helixir/core is aliased to ../../core/src/index.ts via packages/mcp/vitest.config.ts
import {
  CemSchema,
  parseCem,
  validateCompleteness,
  listAllComponents,
  listAllEvents,
  listAllSlots,
  listAllCssParts,
  getInheritanceChain,
  getDeclarationSourcePath,
  mergeCems,
  clearCemStore,
  listLibraries,
  removeLibrary,
  getMergedCem,
  parseTokens,
  findComponentsUsingToken,
  loadConfig,
  MCPError,
  ErrorCategory,
  handleToolError,
} from '../src/index.js';

import type {
  Cem,
  CemDeclaration,
  ComponentMetadata,
  CompletenessResult,
  DesignToken,
  McpWcConfig,
  FrontendFramework,
} from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CEM = resolve(__dirname, '../../../tests/__fixtures__/custom-elements.json');

function loadFixtureCem(): Cem {
  const raw = JSON.parse(readFileSync(FIXTURE_CEM, 'utf-8'));
  return CemSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// CEM Reader — CemSchema
// ---------------------------------------------------------------------------

describe('CemSchema', () => {
  it('parses a valid CEM fixture', () => {
    const cem = loadFixtureCem();
    expect(cem.schemaVersion).toBe('1.0.0');
    expect(Array.isArray(cem.modules)).toBe(true);
  });

  it('rejects null input', () => {
    expect(() => CemSchema.parse(null)).toThrow();
  });

  it('rejects a CEM missing schemaVersion', () => {
    expect(() => CemSchema.parse({ modules: [] })).toThrow();
  });

  it('accepts a minimal valid CEM with empty modules', () => {
    const result = CemSchema.parse({ schemaVersion: '1.0.0', modules: [] });
    expect(result.modules).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CEM Reader — parseCem
// ---------------------------------------------------------------------------

describe('parseCem', () => {
  it('returns ComponentMetadata for a known tag name', () => {
    const cem = loadFixtureCem();
    const meta: ComponentMetadata = parseCem('my-button', cem);
    expect(meta.tagName).toBe('my-button');
  });

  it('includes a non-empty members array', () => {
    const cem = loadFixtureCem();
    const meta = parseCem('my-button', cem);
    expect(meta.members.length).toBeGreaterThan(0);
  });

  it('throws for an unknown tag name', () => {
    const cem = loadFixtureCem();
    expect(() => parseCem('nonexistent-xyz-abc', cem)).toThrow();
  });

  it('returns a non-empty description for documented components', () => {
    const cem = loadFixtureCem();
    const meta = parseCem('my-button', cem);
    expect(meta.description.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CEM Reader — validateCompleteness
// ---------------------------------------------------------------------------

describe('validateCompleteness', () => {
  it('returns a numeric score between 0 and 100', () => {
    const cem = loadFixtureCem();
    const result: CompletenessResult = validateCompleteness('my-button', cem);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns an array in the issues field', () => {
    const cem = loadFixtureCem();
    const result = validateCompleteness('my-button', cem);
    expect(Array.isArray(result.issues)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CEM Reader — listAllComponents
// ---------------------------------------------------------------------------

describe('listAllComponents', () => {
  it('returns an array of tag name strings', () => {
    const cem = loadFixtureCem();
    expect(listAllComponents(cem).length).toBeGreaterThan(0);
  });

  it('includes my-button from the fixture', () => {
    const cem = loadFixtureCem();
    expect(listAllComponents(cem)).toContain('my-button');
  });

  it('returns empty array for a CEM with no modules', () => {
    const empty = CemSchema.parse({ schemaVersion: '1.0.0', modules: [] });
    expect(listAllComponents(empty)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CEM Reader — listAllEvents / listAllSlots / listAllCssParts
// ---------------------------------------------------------------------------

describe('listAllEvents', () => {
  it('returns an array for the fixture CEM', () => {
    const cem = loadFixtureCem();
    expect(Array.isArray(listAllEvents(cem))).toBe(true);
  });

  it('filtered events all have the requested tagName', () => {
    const cem = loadFixtureCem();
    listAllEvents(cem, 'my-button').forEach((row) => expect(row.tagName).toBe('my-button'));
  });
});

describe('listAllSlots', () => {
  it('returns an array for the fixture CEM', () => {
    const cem = loadFixtureCem();
    expect(Array.isArray(listAllSlots(cem))).toBe(true);
  });
});

describe('listAllCssParts', () => {
  it('returns an array for the fixture CEM', () => {
    const cem = loadFixtureCem();
    expect(Array.isArray(listAllCssParts(cem))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CEM Reader — getInheritanceChain / getDeclarationSourcePath
// ---------------------------------------------------------------------------

describe('getInheritanceChain', () => {
  it('returns an array for a component declaration', () => {
    const cem = loadFixtureCem();
    const module = cem.modules.find((m) => m.declarations?.some((d) => d.tagName === 'my-button'));
    const decl = module?.declarations?.find((d): d is CemDeclaration => d.tagName === 'my-button');
    if (decl) {
      expect(Array.isArray(getInheritanceChain(decl))).toBe(true);
    }
  });
});

describe('getDeclarationSourcePath', () => {
  it('returns string or null for a known component', () => {
    const cem = loadFixtureCem();
    const path = getDeclarationSourcePath(cem, 'my-button');
    expect(path === null || typeof path === 'string').toBe(true);
  });

  it('returns null for a component that does not exist', () => {
    const cem = loadFixtureCem();
    expect(getDeclarationSourcePath(cem, 'does-not-exist')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CEM Reader — mergeCems / clearCemStore / listLibraries / removeLibrary
// ---------------------------------------------------------------------------

describe('mergeCems', () => {
  it('merges two empty CEM packages without error', () => {
    const a = CemSchema.parse({ schemaVersion: '1.0.0', modules: [] });
    const b = CemSchema.parse({ schemaVersion: '1.0.0', modules: [] });
    const merged = mergeCems([
      { packageName: 'pkg-a', cem: a },
      { packageName: 'pkg-b', cem: b },
    ]);
    expect(Array.isArray(merged.modules)).toBe(true);
  });
});

describe('CEM store — clearCemStore / listLibraries / removeLibrary', () => {
  it('listLibraries is empty after clearCemStore', () => {
    clearCemStore();
    expect(listLibraries()).toHaveLength(0);
  });

  it('removeLibrary returns false for a non-existent id', () => {
    expect(removeLibrary('does-not-exist-xyz')).toBe(false);
  });
});

describe('getMergedCem', () => {
  it('returns a Cem with modules when given the fixture CEM', () => {
    clearCemStore();
    const cem = loadFixtureCem();
    const merged = getMergedCem(cem);
    expect(Array.isArray(merged.modules)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Token Parser — parseTokens
// ---------------------------------------------------------------------------

describe('parseTokens', () => {
  it('rejects a path to a non-existent file', async () => {
    await expect(parseTokens('/tmp/no-such-tokens-xyz-123.json')).rejects.toThrow();
  });

  it('parses a valid W3C DTCG token file', async () => {
    const tmpPath = join(tmpdir(), `tokens-${Date.now()}.json`);
    const dtcg = {
      color: {
        primary: { $value: '#0066cc', $type: 'color', $description: 'Primary' },
        secondary: { $value: '#ff6600', $type: 'color' },
      },
    };
    await writeFile(tmpPath, JSON.stringify(dtcg), 'utf-8');
    try {
      const tokens: DesignToken[] = await parseTokens(tmpPath);
      expect(tokens.length).toBeGreaterThan(0);
      const primary = tokens.find((t) => t.name.includes('primary'));
      expect(primary?.value).toBe('#0066cc');
    } finally {
      await unlink(tmpPath).catch(() => undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// Token Parser — findComponentsUsingToken
// ---------------------------------------------------------------------------

describe('findComponentsUsingToken', () => {
  it('returns an object without throwing', () => {
    const cem = loadFixtureCem();
    const result = findComponentsUsingToken(cem, '--color-primary');
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// Config — loadConfig
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
  it('returns a McpWcConfig with required string fields', () => {
    const config: McpWcConfig = loadConfig();
    expect(typeof config.cemPath).toBe('string');
    expect(typeof config.projectRoot).toBe('string');
    expect(typeof config.componentPrefix).toBe('string');
    expect(typeof config.healthHistoryDir).toBe('string');
    expect(typeof config.tsconfigPath).toBe('string');
  });

  it('respects MCP_WC_COMPONENT_PREFIX env var', () => {
    const saved = process.env['MCP_WC_COMPONENT_PREFIX'];
    process.env['MCP_WC_COMPONENT_PREFIX'] = 'test-prefix-';
    const config = loadConfig();
    expect(config.componentPrefix).toBe('test-prefix-');
    if (saved !== undefined) {
      process.env['MCP_WC_COMPONENT_PREFIX'] = saved;
    } else {
      delete process.env['MCP_WC_COMPONENT_PREFIX'];
    }
  });
});

// ---------------------------------------------------------------------------
// Error Utilities — MCPError / ErrorCategory / handleToolError
// ---------------------------------------------------------------------------

describe('MCPError', () => {
  it('is an instance of Error and MCPError', () => {
    const err = new MCPError('test', ErrorCategory.NOT_FOUND);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MCPError);
  });

  it('stores the provided message', () => {
    expect(new MCPError('msg', ErrorCategory.UNKNOWN).message).toBe('msg');
  });

  it('stores the provided category', () => {
    const err = new MCPError('x', ErrorCategory.INVALID_INPUT);
    expect(err.category).toBe(ErrorCategory.INVALID_INPUT);
  });
});

describe('ErrorCategory', () => {
  it('exposes NOT_FOUND', () => expect(ErrorCategory.NOT_FOUND).toBeDefined());
  it('exposes INVALID_INPUT', () => expect(ErrorCategory.INVALID_INPUT).toBeDefined());
  it('exposes UNKNOWN', () => expect(ErrorCategory.UNKNOWN).toBeDefined());
});

describe('handleToolError', () => {
  it('returns the same MCPError instance unchanged', () => {
    const orig = new MCPError('original', ErrorCategory.UNKNOWN);
    expect(handleToolError(orig)).toBe(orig);
  });

  it('wraps a standard Error into MCPError', () => {
    const result = handleToolError(new Error('plain'));
    expect(result).toBeInstanceOf(MCPError);
    expect(result.message).toContain('plain');
  });

  it('wraps a thrown string into MCPError', () => {
    expect(handleToolError('oops')).toBeInstanceOf(MCPError);
  });
});

// ---------------------------------------------------------------------------
// Type exports — shape validation at runtime
// ---------------------------------------------------------------------------

describe('Type exports — runtime shape validation', () => {
  it('FrontendFramework values are valid strings', () => {
    const frameworks: FrontendFramework[] = ['react', 'vue', 'svelte', 'angular', 'html'];
    frameworks.forEach((f) => expect(typeof f).toBe('string'));
  });

  it('DesignToken has the expected shape', () => {
    const token: DesignToken = {
      name: 'spacing.sm',
      value: '8px',
      category: 'spacing',
      description: 'Small spacing',
    };
    expect(token.name).toBe('spacing.sm');
    expect(token.value).toBe('8px');
  });
});
