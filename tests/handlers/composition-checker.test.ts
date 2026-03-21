import { describe, it, expect } from 'vitest';
import { checkComposition } from '../../packages/core/src/handlers/composition-checker.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fixture: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module' as const,
      path: 'src/my-tab-group.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyTabGroup',
          tagName: 'my-tab-group',
          members: [],
          events: [],
          slots: [
            { name: 'nav', description: 'Tab navigation items. Must be `<my-tab>` elements.' },
            { name: '', description: 'Tab panel content. Must be `<my-tab-panel>` elements.' },
          ],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-tab.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyTab',
          tagName: 'my-tab',
          members: [
            {
              kind: 'field' as const,
              name: 'panel',
              type: { text: 'string' },
              description: 'The name of the tab panel this tab is associated with.',
            },
          ],
          events: [],
          slots: [{ name: '', description: 'Tab label.' }],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-tab-panel.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyTabPanel',
          tagName: 'my-tab-panel',
          members: [
            {
              kind: 'field' as const,
              name: 'name',
              type: { text: 'string' },
              description: 'The panel identifier. Must match a tab panel attribute.',
            },
          ],
          events: [],
          slots: [{ name: '', description: 'Panel content.' }],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-select.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MySelect',
          tagName: 'my-select',
          members: [],
          events: [],
          slots: [
            {
              name: '',
              description: 'The select options. Must be `<my-option>` elements.',
            },
          ],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-option.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyOption',
          tagName: 'my-option',
          members: [
            {
              kind: 'field' as const,
              name: 'value',
              type: { text: 'string' },
              description: 'The option value.',
            },
          ],
          events: [],
          slots: [{ name: '', description: 'Option label.' }],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
  ],
};

// ─── Clean composition ──────────────────────────────────────────────────────

describe('checkComposition — clean patterns', () => {
  it('returns clean for matching tab/panel counts', () => {
    const html = `<my-tab-group>
  <my-tab slot="nav" panel="one">Tab 1</my-tab>
  <my-tab slot="nav" panel="two">Tab 2</my-tab>
  <my-tab-panel name="one">Content 1</my-tab-panel>
  <my-tab-panel name="two">Content 2</my-tab-panel>
</my-tab-group>`;
    const result = checkComposition(html, fixture);
    expect(result.clean).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns clean for select with options', () => {
    const html = `<my-select>
  <my-option value="a">Alpha</my-option>
  <my-option value="b">Beta</my-option>
</my-select>`;
    const result = checkComposition(html, fixture);
    expect(result.clean).toBe(true);
  });
});

// ─── Tab/panel count mismatch ────────────────────────────────────────────────

describe('checkComposition — tab/panel mismatch', () => {
  it('catches more tabs than panels', () => {
    const html = `<my-tab-group>
  <my-tab slot="nav" panel="one">Tab 1</my-tab>
  <my-tab slot="nav" panel="two">Tab 2</my-tab>
  <my-tab slot="nav" panel="three">Tab 3</my-tab>
  <my-tab-panel name="one">Content 1</my-tab-panel>
  <my-tab-panel name="two">Content 2</my-tab-panel>
</my-tab-group>`;
    const result = checkComposition(html, fixture);
    expect(result.issues.some((i) => i.rule === 'count-mismatch')).toBe(true);
  });

  it('catches more panels than tabs', () => {
    const html = `<my-tab-group>
  <my-tab slot="nav" panel="one">Tab 1</my-tab>
  <my-tab-panel name="one">Content 1</my-tab-panel>
  <my-tab-panel name="two">Content 2</my-tab-panel>
</my-tab-group>`;
    const result = checkComposition(html, fixture);
    expect(result.issues.some((i) => i.rule === 'count-mismatch')).toBe(true);
  });
});

// ─── Unlinked cross-references ──────────────────────────────────────────────

describe('checkComposition — unlinked references', () => {
  it('catches tab panel attribute that has no matching panel name', () => {
    const html = `<my-tab-group>
  <my-tab slot="nav" panel="one">Tab 1</my-tab>
  <my-tab slot="nav" panel="missing">Tab 2</my-tab>
  <my-tab-panel name="one">Content 1</my-tab-panel>
  <my-tab-panel name="two">Content 2</my-tab-panel>
</my-tab-group>`;
    const result = checkComposition(html, fixture);
    expect(result.issues.some((i) => i.rule === 'unlinked-reference')).toBe(true);
  });
});

// ─── Empty containers ───────────────────────────────────────────────────────

describe('checkComposition — empty containers', () => {
  it('catches select with no options', () => {
    const html = `<my-select></my-select>`;
    const result = checkComposition(html, fixture);
    expect(result.issues.some((i) => i.rule === 'empty-container')).toBe(true);
  });

  it('catches tab group with no tabs', () => {
    const html = `<my-tab-group></my-tab-group>`;
    const result = checkComposition(html, fixture);
    expect(result.issues.some((i) => i.rule === 'empty-container')).toBe(true);
  });
});

// ─── Result structure ───────────────────────────────────────────────────────

describe('checkComposition — result structure', () => {
  it('includes component pairs detected', () => {
    const html = `<my-tab-group>
  <my-tab slot="nav" panel="one">Tab 1</my-tab>
  <my-tab-panel name="one">Content 1</my-tab-panel>
</my-tab-group>`;
    const result = checkComposition(html, fixture);
    expect(result.pairsDetected).toBeGreaterThanOrEqual(1);
  });

  it('returns clean=false when issues exist', () => {
    const html = `<my-select></my-select>`;
    const result = checkComposition(html, fixture);
    expect(result.clean).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
