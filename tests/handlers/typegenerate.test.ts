import { describe, expect, it } from 'vitest';

import { generateTypes } from '../../packages/core/src/handlers/typegenerate.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// Minimal CEM fixture that mirrors the hx-tabs bug scenario:
// JS property name (name) differs from HTML attribute name (attribute).
// e.g. JS name="active" but HTML attribute="activation"
const HX_TABS_CEM: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/hx-tabs.js',
      declarations: [
        {
          kind: 'class',
          name: 'HxTabs',
          tagName: 'hx-tabs',
          description: 'A tabs component.',
          members: [
            {
              kind: 'field',
              // JS property name differs from attribute name — this is the bug scenario.
              // The generator MUST use `attribute` ("activation"), NOT `name` ("active").
              name: 'active',
              attribute: 'activation',
              type: { text: "'auto' | 'manual'" },
              description: 'Tab activation mode.',
            },
            {
              kind: 'field',
              // JS property name differs from attribute name.
              // Generator must use `attribute` ("orientation"), NOT `name` ("placement").
              name: 'placement',
              attribute: 'orientation',
              type: { text: "'horizontal' | 'vertical'" },
              description: 'Tab strip orientation.',
            },
            {
              kind: 'field',
              name: 'label',
              attribute: 'label',
              type: { text: 'string' },
              description: 'Accessible label for the tab list.',
            },
            {
              // Method — should NOT appear in the attributes interface.
              kind: 'method',
              name: 'show',
              return: { type: { text: 'void' } },
            },
          ],
          events: [
            {
              name: 'hx-tab-change',
              // Actual event detail: { tabId, index } — NOT { active }
              type: { text: 'CustomEvent<{ tabId: string; index: number }>' },
              description: 'Fired when the active tab changes.',
            },
          ],
        },
      ],
    },
  ],
};

// CEM with a component that has no attributes (methods only).
const NO_ATTRS_CEM: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/my-service.js',
      declarations: [
        {
          kind: 'class',
          name: 'MyService',
          tagName: 'my-service',
          members: [
            {
              kind: 'method',
              name: 'connect',
              return: { type: { text: 'void' } },
            },
          ],
        },
      ],
    },
  ],
};

// CEM with an event that has no type (should default to void).
const NO_EVENT_TYPE_CEM: Cem = {
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
          members: [
            {
              kind: 'field',
              name: 'disabled',
              attribute: 'disabled',
              type: { text: 'boolean' },
            },
          ],
          events: [
            {
              name: 'my-click',
              // No type field — should emit CustomEvent<void>
            },
          ],
        },
      ],
    },
  ],
};

describe('generateTypes', () => {
  describe('attribute name correctness (hx-tabs bug fix)', () => {
    it('uses the CEM attribute field, NOT the JS property name, for attribute interface keys', () => {
      const { content } = generateTypes(HX_TABS_CEM);

      // Correct attribute names from the `attribute` field
      expect(content).toContain('activation?:');
      expect(content).toContain('orientation?:');
      expect(content).toContain('label?:');

      // Wrong names from the JS `name` field must NOT appear as property keys
      expect(content).not.toMatch(/^\s+active\?:/m);
      expect(content).not.toMatch(/^\s+placement\?:/m);
    });

    it('emits the correct event detail type for hx-tab-change', () => {
      const { content } = generateTypes(HX_TABS_CEM);

      // Correct detail: { tabId: string; index: number }
      expect(content).toContain("'hx-tab-change': CustomEvent<{ tabId: string; index: number }>;");

      // Wrong detail that was in the original bug report
      expect(content).not.toContain('CustomEvent<{ active:');
    });
  });

  describe('interface generation', () => {
    it('generates an Attributes interface named after the tag name in PascalCase', () => {
      const { content } = generateTypes(HX_TABS_CEM);
      expect(content).toContain('export interface HxTabsAttributes {');
    });

    it('generates an Events interface named after the tag name in PascalCase', () => {
      const { content } = generateTypes(HX_TABS_CEM);
      expect(content).toContain('export interface HxTabsEvents {');
    });

    it('marks all attribute properties as optional', () => {
      const { content } = generateTypes(HX_TABS_CEM);
      // Every attribute line should end with `?:`
      const attrLines = content
        .split('\n')
        .filter((l) => l.match(/^\s+(activation|orientation|label)\?:/));
      expect(attrLines.length).toBe(3);
    });

    it('excludes methods from the attributes interface', () => {
      const { content } = generateTypes(HX_TABS_CEM);
      expect(content).not.toContain('show?:');
    });

    it('includes JSDoc descriptions as comments', () => {
      const { content } = generateTypes(HX_TABS_CEM);
      expect(content).toContain('/** Tab activation mode. */');
      expect(content).toContain('/** Tab strip orientation. */');
    });

    it('emits HTMLElementTagNameMap augmentation with component tag names', () => {
      const { content } = generateTypes(HX_TABS_CEM);
      expect(content).toContain("declare global {");
      expect(content).toContain("interface HTMLElementTagNameMap {");
      expect(content).toContain("'hx-tabs': HTMLElement & HxTabsAttributes;");
    });
  });

  describe('edge cases', () => {
    it('returns componentCount matching number of tag-named declarations', () => {
      const { componentCount } = generateTypes(HX_TABS_CEM);
      expect(componentCount).toBe(1);
    });

    it('omits Attributes interface for components with no attribute-bearing members', () => {
      const { content } = generateTypes(NO_ATTRS_CEM);
      expect(content).not.toContain('MyServiceAttributes');
      // Should still have the tag map entry, without the & intersection
      expect(content).toContain("'my-service': HTMLElement;");
    });

    it('defaults event detail to void when no type is specified', () => {
      const { content } = generateTypes(NO_EVENT_TYPE_CEM);
      expect(content).toContain("'my-click': CustomEvent<void>;");
    });

    it('returns an empty tag map and zero components for an empty CEM', () => {
      const emptyCem: Cem = { schemaVersion: '1.0.0', modules: [] };
      const { content, componentCount } = generateTypes(emptyCem);
      expect(componentCount).toBe(0);
      expect(content).not.toContain('HTMLElementTagNameMap');
    });

    it('handles multi-component CEM correctly', () => {
      const { componentCount } = generateTypes({
        schemaVersion: '1.0.0',
        modules: [
          ...HX_TABS_CEM.modules,
          ...NO_EVENT_TYPE_CEM.modules,
        ],
      });
      expect(componentCount).toBe(2);
    });
  });
});
