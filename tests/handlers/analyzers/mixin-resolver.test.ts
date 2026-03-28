/**
 * Mixin & Inheritance Chain Resolver — unit tests
 *
 * Tests resolveInheritanceChain() and related helpers from mixin-resolver.ts.
 * This module has async I/O behavior but has testable pure logic via:
 *   - resolveInheritanceChain() with inline source (no real files needed for component itself)
 *   - Chain resolution on components with no CEM-declared mixins/superclasses
 *   - Aggregation logic via the chain result
 *   - Architecture classification based on chain shape
 *
 * Key exports tested:
 *   - resolveInheritanceChain()
 *   - ResolvedSource type structure
 *   - InheritanceChainResult type structure
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { resolveInheritanceChain } from '../../../packages/core/src/handlers/analyzers/mixin-resolver.js';
import type { CemDeclaration } from '../../../packages/core/src/handlers/cem.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const WORKTREE =
  '/Volumes/Development/booked/helixir/.worktrees/feature-test-add-test-suites-for-8-untested';

// A minimal component source with no a11y patterns
const MINIMAL_SOURCE = `
class MyComponent extends HTMLElement {
  connectedCallback() {
    this.textContent = 'Hello';
  }
}
customElements.define('my-component', MyComponent);
`;

// A component source with ARIA patterns
const ARIA_SOURCE = `
class MyButton extends LitElement {
  @property({ type: Boolean }) disabled = false;
  render() {
    return html\`<button aria-disabled=\${this.disabled}>Click me</button>\`;
  }
  handleKeyDown(e) {
    if (e.key === 'Enter') this.click();
  }
}
`;

// A component with a form internals + focus management
const FORM_SOURCE = `
class MyInput extends LitElement {
  static formAssociated = true;
  constructor() {
    super();
    this.#internals = this.attachInternals();
  }
  focus() {
    this.shadowRoot.querySelector('input').focus();
  }
  connectedCallback() {
    super.connectedCallback();
    this.setAttribute('tabindex', '0');
  }
}
`;

// A component that imports an a11y-relevant mixin
const _MIXIN_IMPORT_SOURCE = `
import { FocusMixin } from './focus-mixin.js';
import { KeyboardMixin } from './keyboard-mixin.js';

class MyDropdown extends FocusMixin(KeyboardMixin(HTMLElement)) {
  connectedCallback() {
    this.setAttribute('role', 'listbox');
  }
}
`;

// A simple component declaration (no inheritance chain in CEM)
const SIMPLE_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MyComponent',
  tagName: 'my-component',
};

const BUTTON_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MyButton',
  tagName: 'my-button',
};

const FORM_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MyInput',
  tagName: 'my-input',
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveInheritanceChain', () => {
  describe('basic chain resolution', () => {
    it('resolves a component with no inheritance chain', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
      );
      expect(chain).toBeDefined();
      expect(chain.sources.length).toBeGreaterThanOrEqual(1);
    });

    it('always includes the component itself as first source', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
      );
      const first = chain.sources[0];
      expect(first!.type).toBe('component');
      expect(first!.name).toBe('MyComponent');
    });

    it('includes component source content', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
      );
      const componentSource = chain.sources.find((s) => s.type === 'component');
      expect(componentSource!.content).toBe(MINIMAL_SOURCE);
    });
  });

  describe('result structure', () => {
    it('returns InheritanceChainResult with all required fields', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
      );
      expect(chain).toHaveProperty('sources');
      expect(chain).toHaveProperty('aggregatedMarkers');
      expect(chain).toHaveProperty('resolvedCount');
      expect(chain).toHaveProperty('unresolved');
      expect(chain).toHaveProperty('architecture');
    });

    it('resolvedCount equals sources array length', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
      );
      expect(chain.resolvedCount).toBe(chain.sources.length);
    });

    it('unresolved is an array', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
      );
      expect(Array.isArray(chain.unresolved)).toBe(true);
    });

    it('architecture is one of the expected values', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
      );
      expect(['inline', 'mixin-heavy', 'controller-based', 'hybrid']).toContain(chain.architecture);
    });
  });

  describe('aggregated markers', () => {
    it('aggregated markers reflect component source patterns', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
      );
      // MINIMAL_SOURCE has no a11y patterns
      expect(chain.aggregatedMarkers.ariaBindings).toBe(false);
      expect(chain.aggregatedMarkers.roleAssignments).toBe(false);
      expect(chain.aggregatedMarkers.keyboardHandling).toBe(false);
    });

    it('aggregated markers detect aria patterns in component source', async () => {
      const chain = await resolveInheritanceChain(
        ARIA_SOURCE,
        resolve(WORKTREE, 'src/my-button.ts'),
        BUTTON_DECL,
        WORKTREE,
      );
      expect(chain.aggregatedMarkers.ariaBindings).toBe(true);
      expect(chain.aggregatedMarkers.keyboardHandling).toBe(true);
    });

    it('aggregated markers detect form internals and focus in component source', async () => {
      const chain = await resolveInheritanceChain(
        FORM_SOURCE,
        resolve(WORKTREE, 'src/my-input.ts'),
        FORM_DECL,
        WORKTREE,
      );
      expect(chain.aggregatedMarkers.formInternals).toBe(true);
      expect(chain.aggregatedMarkers.focusManagement).toBe(true);
    });

    it('aggregated markers have all 7 keys', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
      );
      expect(Object.keys(chain.aggregatedMarkers)).toHaveLength(7);
    });
  });

  describe('architecture classification', () => {
    it('classifies single-file component as "inline"', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
      );
      // No mixins resolved → inline
      expect(chain.architecture).toBe('inline');
    });

    it('classifies component with all a11y inline as "inline"', async () => {
      const chain = await resolveInheritanceChain(
        ARIA_SOURCE,
        resolve(WORKTREE, 'src/my-button.ts'),
        BUTTON_DECL,
        WORKTREE,
      );
      // Component has all patterns, no external mixins resolved
      expect(chain.architecture).toBe('inline');
    });
  });

  describe('each ResolvedSource structure', () => {
    it('component source has correct ResolvedSource structure', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
      );
      const src = chain.sources[0]!;
      expect(src).toHaveProperty('name');
      expect(src).toHaveProperty('type');
      expect(src).toHaveProperty('filePath');
      expect(src).toHaveProperty('content');
      expect(src).toHaveProperty('markers');
    });

    it('component source markers are a valid SourceA11yMarkers object', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
      );
      const markers = chain.sources[0]!.markers;
      const expectedKeys = [
        'ariaBindings',
        'roleAssignments',
        'keyboardHandling',
        'focusManagement',
        'formInternals',
        'liveRegions',
        'screenReaderSupport',
      ];
      for (const key of expectedKeys) {
        expect(markers).toHaveProperty(key);
        expect(typeof markers[key as keyof typeof markers]).toBe('boolean');
      }
    });
  });

  describe('CEM-declared superclass with no module path', () => {
    it('silently skips framework base classes like LitElement', async () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'MyButton',
        tagName: 'my-button',
        superclass: { name: 'LitElement' }, // framework base — skipped by getInheritanceChain
      };
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        decl,
        WORKTREE,
      );
      // LitElement is a framework base class — getInheritanceChain() skips it entirely.
      // It does NOT appear in unresolved; the chain simply has no superclass entry.
      expect(chain.unresolved).not.toContain('LitElement');
      expect(chain.sources.length).toBeGreaterThanOrEqual(1);
    });

    it('adds unresolved entry when a non-framework superclass has no module path', async () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'MyButton',
        tagName: 'my-button',
        superclass: { name: 'BaseButton' }, // custom base class, no module path
      };
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        decl,
        WORKTREE,
      );
      // BaseButton has no module path → gets added to chain with modulePath=null → goes to unresolved
      expect(chain.unresolved).toContain('BaseButton');
    });
  });

  describe('maxDepth parameter', () => {
    it('accepts maxDepth parameter without error', async () => {
      await expect(
        resolveInheritanceChain(
          MINIMAL_SOURCE,
          resolve(WORKTREE, 'src/my-component.ts'),
          SIMPLE_DECL,
          WORKTREE,
          0, // depth 0 = no import following
        ),
      ).resolves.toBeDefined();
    });

    it('depth 0 still resolves the component itself', async () => {
      const chain = await resolveInheritanceChain(
        MINIMAL_SOURCE,
        resolve(WORKTREE, 'src/my-component.ts'),
        SIMPLE_DECL,
        WORKTREE,
        0,
      );
      expect(chain.sources.length).toBeGreaterThanOrEqual(1);
      expect(chain.sources[0]!.type).toBe('component');
    });
  });
});
