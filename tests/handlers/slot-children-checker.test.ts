import { describe, it, expect } from 'vitest';
import {
  parseSlotConstraints,
  checkSlotChildren,
} from '../../packages/core/src/handlers/slot-children-checker.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fixture: Cem = {
  schemaVersion: '1.0.0',
  modules: [
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
              description: 'Accepts <my-option> elements as the list of options.',
            },
            { name: 'prefix', description: 'Content displayed before the label.' },
            {
              name: 'clear-icon',
              description: 'An icon for the clear button. Works best with `<my-icon>`.',
            },
          ],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
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
            {
              name: '',
              description: 'Must be `<my-tab-panel>` elements.',
            },
            {
              name: 'nav',
              description: 'Must be `<my-tab>` elements.',
            },
          ],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-radio-group.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyRadioGroup',
          tagName: 'my-radio-group',
          members: [],
          events: [],
          slots: [
            {
              name: '',
              description:
                'The default slot where `<my-radio>` or `<my-radio-button>` elements are placed.',
            },
          ],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-carousel.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyCarousel',
          tagName: 'my-carousel',
          members: [],
          events: [],
          slots: [
            {
              name: '',
              description: 'The carousel slides. Each child should be a `<my-carousel-item>`.',
            },
          ],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-button.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyButton',
          tagName: 'my-button',
          members: [],
          events: [],
          slots: [
            { name: '', description: 'Default slot for button label text.' },
            {
              name: 'prefix',
              description: 'Slot for an icon or element displayed before the label.',
            },
          ],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
  ],
};

// ─── parseSlotConstraints ───────────────────────────────────────────────────

describe('parseSlotConstraints', () => {
  it('extracts "Must be" required tags', () => {
    const constraints = parseSlotConstraints([
      { name: '', description: 'Must be `<my-tab-panel>` elements.' },
    ]);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]?.slotName).toBe('');
    expect(constraints[0]?.requiredTags).toEqual(['my-tab-panel']);
    expect(constraints[0]?.severity).toBe('error');
  });

  it('extracts "Works best with" recommended tags', () => {
    const constraints = parseSlotConstraints([
      { name: 'icon', description: 'An icon slot. Works best with `<my-icon>`.' },
    ]);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]?.requiredTags).toEqual(['my-icon']);
    expect(constraints[0]?.severity).toBe('warning');
  });

  it('extracts "Accepts" tags', () => {
    const constraints = parseSlotConstraints([
      { name: '', description: 'Accepts <my-option> elements as the list of options.' },
    ]);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]?.requiredTags).toEqual(['my-option']);
    expect(constraints[0]?.severity).toBe('error');
  });

  it('extracts "should be" soft constraint', () => {
    const constraints = parseSlotConstraints([
      { name: '', description: 'Each child should be a `<my-carousel-item>`.' },
    ]);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]?.requiredTags).toEqual(['my-carousel-item']);
    expect(constraints[0]?.severity).toBe('warning');
  });

  it('extracts multiple allowed tags from "or" patterns', () => {
    const constraints = parseSlotConstraints([
      {
        name: '',
        description: 'Where `<my-radio>` or `<my-radio-button>` elements are placed.',
      },
    ]);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]?.requiredTags).toContain('my-radio');
    expect(constraints[0]?.requiredTags).toContain('my-radio-button');
  });

  it('returns empty for unconstrained slots', () => {
    const constraints = parseSlotConstraints([
      { name: '', description: 'Default slot for button label text.' },
    ]);
    expect(constraints).toHaveLength(0);
  });
});

// ─── checkSlotChildren — valid usage ────────────────────────────────────────

describe('checkSlotChildren — valid usage', () => {
  it('reports no issues for correct slot children', () => {
    const html = `<my-select>
  <my-option>Option 1</my-option>
  <my-option>Option 2</my-option>
</my-select>`;
    const result = checkSlotChildren(html, 'my-select', fixture);
    expect(result.issues).toHaveLength(0);
    expect(result.clean).toBe(true);
  });

  it('allows components without slot constraints', () => {
    const html = `<my-button>
  <span>Click me</span>
</my-button>`;
    const result = checkSlotChildren(html, 'my-button', fixture);
    expect(result.issues).toHaveLength(0);
    expect(result.clean).toBe(true);
  });

  it('allows correct named slot children', () => {
    const html = `<my-tab-group>
  <my-tab slot="nav">Tab 1</my-tab>
  <my-tab-panel>Panel 1</my-tab-panel>
</my-tab-group>`;
    const result = checkSlotChildren(html, 'my-tab-group', fixture);
    expect(result.issues).toHaveLength(0);
  });

  it('allows multiple valid tag types in or-pattern slots', () => {
    const html = `<my-radio-group>
  <my-radio>Option A</my-radio>
  <my-radio-button>Option B</my-radio-button>
</my-radio-group>`;
    const result = checkSlotChildren(html, 'my-radio-group', fixture);
    expect(result.issues).toHaveLength(0);
  });
});

// ─── checkSlotChildren — invalid usage ──────────────────────────────────────

describe('checkSlotChildren — invalid usage', () => {
  it('flags wrong children in constrained default slot', () => {
    const html = `<my-select>
  <div>Not an option</div>
  <my-option>Valid</my-option>
</my-select>`;
    const result = checkSlotChildren(html, 'my-select', fixture);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]?.childTag).toBe('div');
    expect(result.clean).toBe(false);
  });

  it('flags wrong children in named slot', () => {
    const html = `<my-tab-group>
  <div slot="nav">Not a tab</div>
  <my-tab-panel>Panel</my-tab-panel>
</my-tab-group>`;
    const result = checkSlotChildren(html, 'my-tab-group', fixture);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.childTag === 'div' && i.slotName === 'nav')).toBe(true);
  });

  it('reports warning severity for "Works best with" violations', () => {
    const html = `<my-select>
  <my-option>Valid</my-option>
  <span slot="clear-icon">X</span>
</my-select>`;
    const result = checkSlotChildren(html, 'my-select', fixture);
    const clearIconIssues = result.issues.filter((i) => i.slotName === 'clear-icon');
    expect(clearIconIssues).toHaveLength(1);
    expect(clearIconIssues[0]?.severity).toBe('warning');
  });

  it('reports error severity for "Must be" violations', () => {
    const html = `<my-tab-group>
  <div>Wrong child</div>
</my-tab-group>`;
    const result = checkSlotChildren(html, 'my-tab-group', fixture);
    expect(result.issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('includes expected tags in issue details', () => {
    const html = `<my-select>
  <div>Wrong</div>
</my-select>`;
    const result = checkSlotChildren(html, 'my-select', fixture);
    expect(result.issues[0]?.expectedTags).toContain('my-option');
  });
});

// ─── Result structure ──────────────────────────────────────────────────────

describe('checkSlotChildren — result structure', () => {
  it('returns constraints found from CEM', () => {
    const html = `<my-select><my-option>OK</my-option></my-select>`;
    const result = checkSlotChildren(html, 'my-select', fixture);
    expect(result.constraintsFound).toBeGreaterThan(0);
  });

  it('returns line numbers for issues', () => {
    const html = `<my-select>
  <div>Wrong</div>
</my-select>`;
    const result = checkSlotChildren(html, 'my-select', fixture);
    expect(result.issues[0]?.line).toBe(2);
  });
});
