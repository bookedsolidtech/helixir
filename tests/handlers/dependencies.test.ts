/**
 * Unit tests for src/handlers/dependencies.ts (getComponentDependencies).
 */
import { describe, it, expect } from 'vitest';
import { getComponentDependencies } from '../../packages/core/src/handlers/dependencies.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// A CEM where my-dialog uses my-button (via declaration-level references).
const CEM_WITH_DEPS: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/my-button.js',
      declarations: [{ kind: 'class', name: 'MyButton', tagName: 'my-button' }],
    },
    {
      kind: 'javascript-module',
      path: 'src/my-icon.js',
      declarations: [{ kind: 'class', name: 'MyIcon', tagName: 'my-icon' }],
    },
    {
      kind: 'javascript-module',
      path: 'src/my-dialog.js',
      declarations: [
        {
          kind: 'class',
          name: 'MyDialog',
          tagName: 'my-dialog',
          references: [{ name: 'MyButton' }, { name: 'MyIcon' }],
        },
      ],
    },
  ],
};

// A CEM with a transitive chain: my-toolbar → my-button → (no deps).
const CEM_TRANSITIVE: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/my-button.js',
      declarations: [
        {
          kind: 'class',
          name: 'MyButton',
          tagName: 'my-button',
          references: [{ name: 'MyIcon' }],
        },
      ],
    },
    {
      kind: 'javascript-module',
      path: 'src/my-icon.js',
      declarations: [{ kind: 'class', name: 'MyIcon', tagName: 'my-icon' }],
    },
    {
      kind: 'javascript-module',
      path: 'src/my-toolbar.js',
      declarations: [
        {
          kind: 'class',
          name: 'MyToolbar',
          tagName: 'my-toolbar',
          references: [{ name: 'MyButton' }],
        },
      ],
    },
  ],
};

// A CEM with no reference data at all.
const CEM_NO_REFS: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/my-button.js',
      declarations: [{ kind: 'class', name: 'MyButton', tagName: 'my-button' }],
    },
  ],
};

describe('getComponentDependencies', () => {
  it('returns direct dependencies from declaration-level references', () => {
    const result = getComponentDependencies(CEM_WITH_DEPS, 'my-dialog');

    expect(result.tagName).toBe('my-dialog');
    expect(result.direct).toContain('my-button');
    expect(result.direct).toContain('my-icon');
    expect(result.direct).toHaveLength(2);
    expect(result.transitive).toHaveLength(0);
  });

  it('resolves transitive dependencies via BFS', () => {
    const result = getComponentDependencies(CEM_TRANSITIVE, 'my-toolbar');

    expect(result.direct).toContain('my-button');
    expect(result.transitive).toContain('my-icon');
  });

  it('returns empty direct and transitive for a leaf component with no deps', () => {
    const result = getComponentDependencies(CEM_WITH_DEPS, 'my-button');

    expect(result.direct).toHaveLength(0);
    expect(result.transitive).toHaveLength(0);
    expect(result.note).toBeUndefined();
  });

  it('includes a note when the CEM has no reference data', () => {
    const result = getComponentDependencies(CEM_NO_REFS, 'my-button');

    expect(result.note).toMatch(/does not include dependency information/i);
    expect(result.direct).toHaveLength(0);
    expect(result.transitive).toHaveLength(0);
  });

  it('builds a graph covering the component and its deps', () => {
    const result = getComponentDependencies(CEM_WITH_DEPS, 'my-dialog');

    expect(Object.keys(result.graph)).toContain('my-dialog');
    expect(Object.keys(result.graph)).toContain('my-button');
    expect(Object.keys(result.graph)).toContain('my-icon');
  });

  it('throws when the component is not in the CEM', () => {
    expect(() => getComponentDependencies(CEM_WITH_DEPS, 'nonexistent-tag')).toThrow(
      /not found in CEM/i,
    );
  });

  it('does not resolve transitive deps when includeTransitive is false', () => {
    const result = getComponentDependencies(CEM_TRANSITIVE, 'my-toolbar', false);

    expect(result.direct).toContain('my-button');
    expect(result.transitive).toHaveLength(0);
  });
});
