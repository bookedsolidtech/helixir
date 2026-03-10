import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadLibrary,
  getLibrary,
  listLibraries,
  removeLibrary,
  resetCemStore,
  clearCemStore,
  resolveCem,
  listAllComponents,
  getMergedCem,
  loadCdnCem,
  clearCdnCemCache,
} from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// Minimal CEM fixtures
const LIBRARY_A: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/button.ts',
      declarations: [
        {
          kind: 'class',
          name: 'MyButton',
          tagName: 'my-button',
          description: 'A button component',
        },
        {
          kind: 'class',
          name: 'MyInput',
          tagName: 'my-input',
          description: 'An input component',
        },
      ],
    },
  ],
};

const LIBRARY_B: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/card.ts',
      declarations: [
        {
          kind: 'class',
          name: 'SlCard',
          tagName: 'sl-card',
          description: 'A card component',
        },
        {
          kind: 'class',
          name: 'SlDialog',
          tagName: 'sl-dialog',
          description: 'A dialog component',
        },
        {
          kind: 'class',
          name: 'SlAlert',
          tagName: 'sl-alert',
          description: 'An alert component',
        },
      ],
    },
  ],
};

describe('CEM Store', () => {
  beforeEach(() => {
    resetCemStore();
  });

  describe('loadLibrary / getLibrary', () => {
    it('loads and retrieves a library by ID', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      const cem = getLibrary('default');
      expect(cem).toBeDefined();
      expect(listAllComponents(cem!)).toEqual(['my-button', 'my-input']);
    });

    it('loads multiple libraries', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      loadLibrary('shoelace', LIBRARY_B, 'cdn');

      const defaultCem = getLibrary('default');
      const shoelaceCem = getLibrary('shoelace');

      expect(listAllComponents(defaultCem!)).toEqual(['my-button', 'my-input']);
      expect(listAllComponents(shoelaceCem!)).toEqual(['sl-card', 'sl-dialog', 'sl-alert']);
    });

    it('returns undefined for unknown library', () => {
      expect(getLibrary('nonexistent')).toBeUndefined();
    });
  });

  describe('listLibraries', () => {
    it('returns empty array when no libraries loaded', () => {
      expect(listLibraries()).toEqual([]);
    });

    it('returns all loaded libraries with metadata', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      loadLibrary('shoelace', LIBRARY_B, 'cdn');

      const libs = listLibraries();
      expect(libs).toHaveLength(2);

      const defaultLib = libs.find((l) => l.libraryId === 'default');
      expect(defaultLib).toEqual({
        libraryId: 'default',
        componentCount: 2,
        sourceType: 'config',
      });

      const shoelaceLib = libs.find((l) => l.libraryId === 'shoelace');
      expect(shoelaceLib).toEqual({
        libraryId: 'shoelace',
        componentCount: 3,
        sourceType: 'cdn',
      });
    });
  });

  describe('removeLibrary', () => {
    it('removes a non-default library', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      loadLibrary('shoelace', LIBRARY_B, 'cdn');

      const removed = removeLibrary('shoelace');
      expect(removed).toBe(true);
      expect(getLibrary('shoelace')).toBeUndefined();
      expect(listLibraries()).toHaveLength(1);
    });

    it('cannot remove the default library', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      const removed = removeLibrary('default');
      expect(removed).toBe(false);
      expect(getLibrary('default')).toBeDefined();
    });

    it('returns false for nonexistent library', () => {
      expect(removeLibrary('nonexistent')).toBe(false);
    });
  });

  describe('clearCemStore', () => {
    it('removes all non-default libraries but keeps default', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      loadLibrary('shoelace', LIBRARY_B, 'cdn');
      loadLibrary('spectrum', LIBRARY_B, 'local');

      clearCemStore();

      expect(getLibrary('default')).toBeDefined();
      expect(getLibrary('shoelace')).toBeUndefined();
      expect(getLibrary('spectrum')).toBeUndefined();
      expect(listLibraries()).toHaveLength(1);
    });
  });

  describe('resolveCem', () => {
    it('returns merged CEM when libraryId is omitted', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      const resolved = resolveCem(undefined, LIBRARY_A);
      expect(listAllComponents(resolved)).toEqual(['my-button', 'my-input']);
    });

    it('returns merged CEM when libraryId is "default"', () => {
      const resolved = resolveCem('default', LIBRARY_A);
      expect(listAllComponents(resolved)).toEqual(['my-button', 'my-input']);
    });

    it('returns specific library CEM when libraryId is provided', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      loadLibrary('shoelace', LIBRARY_B, 'cdn');

      const resolved = resolveCem('shoelace', LIBRARY_A);
      expect(listAllComponents(resolved)).toEqual(['sl-card', 'sl-dialog', 'sl-alert']);
    });

    it('throws for unknown libraryId', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      expect(() => resolveCem('nonexistent', LIBRARY_A)).toThrow(/Library "nonexistent" not found/);
    });
  });

  describe('multi-library isolation', () => {
    it('list_components returns different results per libraryId', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      loadLibrary('shoelace', LIBRARY_B, 'cdn');

      const defaultComponents = listAllComponents(resolveCem('default', LIBRARY_A));
      const shoelaceComponents = listAllComponents(resolveCem('shoelace', LIBRARY_A));

      expect(defaultComponents).not.toEqual(shoelaceComponents);
      expect(defaultComponents).toContain('my-button');
      expect(shoelaceComponents).toContain('sl-card');
      expect(shoelaceComponents).not.toContain('my-button');
    });

    it('default behavior unchanged when libraryId is omitted', () => {
      loadLibrary('default', LIBRARY_A, 'config');

      // Without additional libraries, resolveCem returns the default CEM
      const components = listAllComponents(resolveCem(undefined, LIBRARY_A));
      expect(components).toEqual(['my-button', 'my-input']);
    });

    it('unload_library makes subsequent queries fail gracefully', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      loadLibrary('shoelace', LIBRARY_B, 'cdn');

      // Can query before unload
      expect(listAllComponents(resolveCem('shoelace', LIBRARY_A))).toHaveLength(3);

      // Unload
      removeLibrary('shoelace');

      // Subsequent query throws
      expect(() => resolveCem('shoelace', LIBRARY_A)).toThrow(/Library "shoelace" not found/);
    });
  });

  describe('getMergedCem', () => {
    it('returns the local CEM unchanged when no additional libraries are loaded', () => {
      const merged = getMergedCem(LIBRARY_A);
      expect(listAllComponents(merged)).toEqual(['my-button', 'my-input']);
    });

    it('merges local CEM with loaded libraries', () => {
      loadLibrary('shoelace', LIBRARY_B, 'cdn');
      const merged = getMergedCem(LIBRARY_A);
      const components = listAllComponents(merged);
      expect(components).toContain('my-button');
      expect(components).toContain('my-input');
      expect(components).toContain('sl-card');
      expect(components).toContain('sl-dialog');
      expect(components).toContain('sl-alert');
    });

    it('merges local CEM with loaded libraries, excluding default', () => {
      loadLibrary('default', LIBRARY_B, 'config');
      loadLibrary('shoelace', LIBRARY_B, 'cdn');
      const merged = getMergedCem(LIBRARY_A);
      const components = listAllComponents(merged);
      // Should have local (LIBRARY_A) components plus namespaced shoelace components
      expect(components).toContain('my-button');
      expect(components).toContain('my-input');
      // Shoelace components are namespaced
      expect(components.some((c) => c.includes('sl-card'))).toBe(true);
    });

    it('handles multiple loaded libraries', () => {
      loadLibrary('lib1', LIBRARY_B, 'cdn');
      const library_c: Cem = {
        schemaVersion: '1.0.0',
        modules: [
          {
            kind: 'javascript-module',
            path: 'src/menu.ts',
            declarations: [
              {
                kind: 'class',
                name: 'MyMenu',
                tagName: 'my-menu',
                description: 'A menu component',
              },
            ],
          },
        ],
      };
      loadLibrary('lib2', library_c, 'local');
      const merged = getMergedCem(LIBRARY_A);
      const components = listAllComponents(merged);
      expect(components).toHaveLength(6); // 2 from A + 3 from B + 1 from C
      expect(components).toContain('my-button');
      expect(components).toContain('sl-card');
      expect(components).toContain('my-menu');
    });
  });

  describe('resetCemStore', () => {
    it('clears all libraries including default', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      loadLibrary('shoelace', LIBRARY_B, 'cdn');
      resetCemStore();
      expect(listLibraries()).toHaveLength(0);
      expect(getLibrary('default')).toBeUndefined();
      expect(getLibrary('shoelace')).toBeUndefined();
    });

    it('allows reloading after reset', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      resetCemStore();
      loadLibrary('default', LIBRARY_B, 'config');
      const cem = getLibrary('default');
      expect(listAllComponents(cem!)).toEqual(['sl-card', 'sl-dialog', 'sl-alert']);
    });
  });

  describe('CDN aliases (backward compatibility)', () => {
    it('loadCdnCem loads a library with "cdn" source type', () => {
      loadCdnCem('shoelace', LIBRARY_B);
      const libs = listLibraries();
      const shoelaceLib = libs.find((l) => l.libraryId === 'shoelace');
      expect(shoelaceLib?.sourceType).toBe('cdn');
    });

    it('clearCdnCemCache clears all non-default libraries', () => {
      loadCdnCem('shoelace', LIBRARY_B);
      loadLibrary('default', LIBRARY_A, 'config');
      clearCdnCemCache();
      expect(getLibrary('shoelace')).toBeUndefined();
      expect(getLibrary('default')).toBeDefined();
    });

    it('clearCdnCemCache is equivalent to clearCemStore', () => {
      loadLibrary('default', LIBRARY_A, 'config');
      loadCdnCem('lib1', LIBRARY_B);
      clearCdnCemCache();
      expect(listLibraries()).toHaveLength(1);
      expect(listLibraries()[0]!.libraryId).toBe('default');
    });
  });
});
