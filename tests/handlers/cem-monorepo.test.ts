import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { CemSchema, mergeCems, listAllComponents } from '../../src/handlers/cem.js';
import type { Cem, PackagedCem } from '../../src/handlers/cem.js';
import { resolveGlobCemPaths } from '../../src/shared/discovery.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(__dirname, '../__fixtures__/monorepo');

function loadCem(path: string): Cem {
  return CemSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
}

// ---------------------------------------------------------------------------
// resolveGlobCemPaths
// ---------------------------------------------------------------------------

describe('resolveGlobCemPaths', () => {
  it('resolves wildcard pattern to matching package CEM files', () => {
    const paths = resolveGlobCemPaths(['packages/*/custom-elements.json'], MONOREPO_ROOT);
    expect(paths).toHaveLength(2);
    expect(paths).toContain('packages/pkg-a/custom-elements.json');
    expect(paths).toContain('packages/pkg-b/custom-elements.json');
  });

  it('returns static path when it exists', () => {
    const paths = resolveGlobCemPaths(['packages/pkg-a/custom-elements.json'], MONOREPO_ROOT);
    expect(paths).toEqual(['packages/pkg-a/custom-elements.json']);
  });

  it('skips static path when it does not exist', () => {
    const paths = resolveGlobCemPaths(['packages/nonexistent/custom-elements.json'], MONOREPO_ROOT);
    expect(paths).toHaveLength(0);
  });

  it('handles multiple patterns', () => {
    const paths = resolveGlobCemPaths(
      ['packages/pkg-a/custom-elements.json', 'packages/pkg-b/custom-elements.json'],
      MONOREPO_ROOT,
    );
    expect(paths).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// mergeCems
// ---------------------------------------------------------------------------

describe('mergeCems', () => {
  const pkgA: PackagedCem = {
    cem: loadCem(resolve(MONOREPO_ROOT, 'packages/pkg-a/custom-elements.json')),
    packageName: 'pkg-a',
  };
  const pkgB: PackagedCem = {
    cem: loadCem(resolve(MONOREPO_ROOT, 'packages/pkg-b/custom-elements.json')),
    packageName: 'pkg-b',
  };

  it('returns all 4 components across 2 packages (listAllComponents)', () => {
    const merged = mergeCems([pkgA, pkgB]);
    const components = listAllComponents(merged);
    // my-input (pkg-a only), my-card (pkg-b only)
    // my-button exists in both → becomes pkg-a:my-button and pkg-b:my-button
    expect(components).toHaveLength(4);
    expect(components).toContain('my-input');
    expect(components).toContain('my-card');
    expect(components).toContain('pkg-a:my-button');
    expect(components).toContain('pkg-b:my-button');
  });

  it('does not namespace non-colliding components', () => {
    const merged = mergeCems([pkgA, pkgB]);
    const components = listAllComponents(merged);
    expect(components).toContain('my-input');
    expect(components).toContain('my-card');
    // original unnamespaced my-button should NOT appear
    expect(components).not.toContain('my-button');
  });

  it('sets packageName on each declaration', () => {
    const merged = mergeCems([pkgA, pkgB]);
    for (const mod of merged.modules) {
      for (const decl of mod.declarations ?? []) {
        expect(decl.packageName).toBeDefined();
        expect(['pkg-a', 'pkg-b']).toContain(decl.packageName);
      }
    }
  });

  it('preserves schemaVersion from first CEM', () => {
    const merged = mergeCems([pkgA, pkgB]);
    expect(merged.schemaVersion).toBe('1.0.0');
  });

  it('handles single CEM with no collision', () => {
    const merged = mergeCems([pkgA]);
    const components = listAllComponents(merged);
    expect(components).toHaveLength(2);
    expect(components).toContain('my-button');
    expect(components).toContain('my-input');
  });

  it('handles empty cems array', () => {
    const merged = mergeCems([]);
    expect(merged.modules).toHaveLength(0);
    expect(merged.schemaVersion).toBe('1.0.0');
  });
});
