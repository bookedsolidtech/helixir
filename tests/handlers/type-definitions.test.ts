import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { validateTypeDefinitions } from '../../packages/core/src/handlers/type-definitions.js';
import { CemSchema } from '../../packages/core/src/handlers/cem.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// Minimal CEM fixture with tabs, skeleton, and spinner components (the known drift cases)
const FIXTURE_CEM = CemSchema.parse({
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/components/hx-tabs.js',
      declarations: [
        {
          kind: 'class',
          name: 'HxTabs',
          tagName: 'hx-tabs',
          description: 'A tabs component.',
          members: [
            {
              kind: 'field',
              name: 'selectedIndex',
              attribute: 'selected-index',
              type: { text: 'number' },
              description: 'Index of the selected tab.',
            },
            {
              kind: 'field',
              name: 'orientation',
              attribute: 'orientation',
              type: { text: "'horizontal' | 'vertical'" },
              description: 'Tab orientation.',
            },
          ],
          events: [
            {
              name: 'hx-tab-change',
              type: { text: 'CustomEvent<{ index: number }>' },
              description: 'Fired when the active tab changes.',
            },
          ],
          slots: [{ name: '', description: 'Default slot for tab panels.' }],
        },
      ],
    },
    {
      kind: 'javascript-module',
      path: 'src/components/hx-skeleton.js',
      declarations: [
        {
          kind: 'class',
          name: 'HxSkeleton',
          tagName: 'hx-skeleton',
          description: 'A skeleton loading component.',
          members: [
            {
              kind: 'field',
              name: 'effect',
              attribute: 'effect',
              type: { text: "'pulse' | 'wave' | 'none'" },
              description: 'The animation effect.',
            },
          ],
        },
      ],
    },
    {
      kind: 'javascript-module',
      path: 'src/components/hx-spinner.js',
      declarations: [
        {
          kind: 'class',
          name: 'HxSpinner',
          tagName: 'hx-spinner',
          description: 'A spinner component.',
          members: [
            {
              kind: 'field',
              name: 'size',
              attribute: 'size',
              type: { text: "'small' | 'medium' | 'large'" },
              description: 'The spinner size.',
            },
          ],
        },
      ],
    },
  ],
});

// A fully synced .d.ts content
const SYNCED_DTS = `
export declare class HxTabs extends HTMLElement {
  selectedIndex: number;
  orientation: 'horizontal' | 'vertical';
}

export declare class HxSkeleton extends HTMLElement {
  effect: 'pulse' | 'wave' | 'none';
}

export declare class HxSpinner extends HTMLElement {
  size: 'small' | 'medium' | 'large';
}

declare global {
  interface HTMLElementTagNameMap {
    'hx-tabs': HxTabs;
    'hx-skeleton': HxSkeleton;
    'hx-spinner': HxSpinner;
  }
}
`;

// Drifted .d.ts — tabs is missing selectedIndex, skeleton is missing entirely, spinner has wrong attribute name
const DRIFTED_DTS = `
export declare class HxTabs extends HTMLElement {
  orientation: 'horizontal' | 'vertical';
}

export declare class HxSpinner extends HTMLElement {
  spinnerSize: 'small' | 'medium' | 'large';
}

declare global {
  interface HTMLElementTagNameMap {
    'hx-tabs': HxTabs;
    'hx-spinner': HxSpinner;
  }
}
`;

// .d.ts with addEventListener event overloads for event cross-checking
const DTS_WITH_EVENTS = `
export declare class HxTabs extends HTMLElement {
  selectedIndex: number;
  orientation: 'horizontal' | 'vertical';
  addEventListener(type: 'hx-tab-change', listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'hx-tabs': HxTabs;
  }
}
`;

let tmpDir: string;
let config: McpWcConfig;

beforeEach(() => {
  tmpDir = join(tmpdir(), `helixir-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  config = {
    cemPath: 'custom-elements.json',
    projectRoot: tmpDir,
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    cdnAutoloader: null,
    cdnStylesheet: null,
    watch: false,
  };
});

function writeDts(content: string, filename = 'helix.d.ts'): string {
  const filePath = join(tmpDir, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filename;
}

describe('validateTypeDefinitions', () => {
  describe('synced definitions', () => {
    it('returns zero mismatches when types match CEM', () => {
      const dtsPath = writeDts(SYNCED_DTS);
      const result = validateTypeDefinitions(config, FIXTURE_CEM, dtsPath);

      expect(result.summary.totalMismatches).toBe(0);
      expect(result.summary.componentsWithIssues).toBe(0);
      expect(result.mismatches).toHaveLength(0);
      expect(result.formatted).toContain('0 mismatches');
    });

    it('reports correct component counts', () => {
      const dtsPath = writeDts(SYNCED_DTS);
      const result = validateTypeDefinitions(config, FIXTURE_CEM, dtsPath);

      expect(result.summary.totalComponents).toBe(3);
      expect(result.summary.componentsChecked).toBe(3);
    });
  });

  describe('drifted definitions', () => {
    it('detects missing property in hx-tabs (selectedIndex)', () => {
      const dtsPath = writeDts(DRIFTED_DTS);
      const result = validateTypeDefinitions(config, FIXTURE_CEM, dtsPath);

      const tabsMismatches = result.mismatches.filter((m) => m.component === 'hx-tabs');
      expect(tabsMismatches.some((m) => m.name === 'selectedIndex' && m.issue === 'missing_in_dts')).toBe(true);
    });

    it('detects hx-skeleton missing from HTMLElementTagNameMap', () => {
      const dtsPath = writeDts(DRIFTED_DTS);
      const result = validateTypeDefinitions(config, FIXTURE_CEM, dtsPath);

      const skeletonMismatches = result.mismatches.filter((m) => m.component === 'hx-skeleton');
      expect(skeletonMismatches.some((m) => m.issue === 'missing_in_dts')).toBe(true);
    });

    it('detects hx-spinner property renamed from size to spinnerSize', () => {
      const dtsPath = writeDts(DRIFTED_DTS);
      const result = validateTypeDefinitions(config, FIXTURE_CEM, dtsPath);

      const spinnerMismatches = result.mismatches.filter((m) => m.component === 'hx-spinner');
      expect(spinnerMismatches.some((m) => m.name === 'size' && m.issue === 'missing_in_dts')).toBe(true);
    });

    it('totalMismatches is non-zero for drifted definitions', () => {
      const dtsPath = writeDts(DRIFTED_DTS);
      const result = validateTypeDefinitions(config, FIXTURE_CEM, dtsPath);

      expect(result.summary.totalMismatches).toBeGreaterThan(0);
      expect(result.formatted).toContain('mismatch(es)');
    });
  });

  describe('tag name filtering', () => {
    it('checks only the specified tag names', () => {
      const dtsPath = writeDts(DRIFTED_DTS);
      const result = validateTypeDefinitions(config, FIXTURE_CEM, dtsPath, ['hx-tabs']);

      expect(result.summary.componentsChecked).toBe(1);
      // Should only report mismatches for hx-tabs
      expect(result.mismatches.every((m) => m.component === 'hx-tabs')).toBe(true);
    });

    it('returns empty mismatches when filtered component is synced', () => {
      const dtsPath = writeDts(SYNCED_DTS);
      const result = validateTypeDefinitions(config, FIXTURE_CEM, dtsPath, ['hx-spinner']);

      expect(result.summary.componentsChecked).toBe(1);
      expect(result.mismatches.filter((m) => m.component === 'hx-spinner')).toHaveLength(0);
    });
  });

  describe('event cross-checking', () => {
    it('detects matching events when addEventListener overloads are present', () => {
      const dtsPath = writeDts(DTS_WITH_EVENTS);
      // Only check hx-tabs (which has the events)
      const result = validateTypeDefinitions(config, FIXTURE_CEM, dtsPath, ['hx-tabs']);

      // hx-tab-change is in both CEM and d.ts — no event mismatch
      const eventMismatches = result.mismatches.filter((m) => m.category === 'event');
      expect(eventMismatches).toHaveLength(0);
    });
  });

  describe('extra types in d.ts', () => {
    it('reports components in d.ts that are not in CEM', () => {
      const extraDts = SYNCED_DTS + `
export declare class HxGhost extends HTMLElement {
  mode: string;
}
declare global {
  interface HTMLElementTagNameMap {
    'hx-ghost': HxGhost;
  }
}
`;
      const dtsPath = writeDts(extraDts);
      const result = validateTypeDefinitions(config, FIXTURE_CEM, dtsPath);

      const ghostMismatches = result.mismatches.filter((m) => m.component === 'hx-ghost');
      expect(ghostMismatches.some((m) => m.issue === 'missing_in_cem')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('throws FILESYSTEM error for missing d.ts file', () => {
      expect(() =>
        validateTypeDefinitions(config, FIXTURE_CEM, 'nonexistent.d.ts'),
      ).toThrow('Cannot read type definitions file');
    });
  });

  describe('formatted output', () => {
    it('lists components with issues in formatted output', () => {
      const dtsPath = writeDts(DRIFTED_DTS);
      const result = validateTypeDefinitions(config, FIXTURE_CEM, dtsPath);

      expect(result.formatted).toContain('hx-tabs');
      expect(result.formatted).toContain('hx-skeleton');
    });
  });
});

// Cleanup after tests
import { afterEach } from 'vitest';
afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});
