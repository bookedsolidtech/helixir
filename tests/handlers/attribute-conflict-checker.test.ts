import { describe, it, expect } from 'vitest';
import {
  parseAttributeConstraints,
  checkAttributeConflicts,
} from '../../packages/core/src/handlers/attribute-conflict-checker.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fixture: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module' as const,
      path: 'src/my-button.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyButton',
          tagName: 'my-button',
          members: [
            {
              kind: 'field' as const,
              name: 'href',
              type: { text: 'string' },
              description: 'When set, the button renders as an anchor.',
              attribute: 'href',
            },
            {
              kind: 'field' as const,
              name: 'target',
              type: { text: 'string' },
              description: 'Only used when `href` is present.',
              attribute: 'target',
            },
            {
              kind: 'field' as const,
              name: 'download',
              type: { text: 'string' },
              description: 'Only used when `href` is set.',
              attribute: 'download',
            },
            {
              kind: 'field' as const,
              name: 'variant',
              type: { text: "'primary' | 'default'" },
              description: 'The button variant.',
              attribute: 'variant',
            },
          ],
          events: [],
          slots: [],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-input.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyInput',
          tagName: 'my-input',
          members: [
            {
              kind: 'field' as const,
              name: 'type',
              type: { text: "'text' | 'number' | 'password' | 'date'" },
              description: 'The type of input.',
              attribute: 'type',
            },
            {
              kind: 'field' as const,
              name: 'min',
              type: { text: 'number' },
              description: 'Only applies to date and number input types.',
              attribute: 'min',
            },
            {
              kind: 'field' as const,
              name: 'max',
              type: { text: 'number' },
              description: 'Only applies to date and number input types.',
              attribute: 'max',
            },
            {
              kind: 'field' as const,
              name: 'passwordToggle',
              type: { text: 'boolean' },
              description: 'Only applies to password types.',
              attribute: 'password-toggle',
            },
          ],
          events: [],
          slots: [],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-menu-item.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyMenuItem',
          tagName: 'my-menu-item',
          members: [
            {
              kind: 'field' as const,
              name: 'type',
              type: { text: "'normal' | 'checkbox'" },
              description: 'The type of menu item.',
              attribute: 'type',
            },
            {
              kind: 'field' as const,
              name: 'checked',
              type: { text: 'boolean' },
              description: 'Only valid when type is "checkbox".',
              attribute: 'checked',
            },
          ],
          events: [],
          slots: [],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
  ],
};

// ─── parseAttributeConstraints ──────────────────────────────────────────────

describe('parseAttributeConstraints', () => {
  it('detects "Only used when X is present" patterns', () => {
    const constraints = parseAttributeConstraints(fixture, 'my-button');
    const targetConstraint = constraints.find((c) => c.attribute === 'target');
    expect(targetConstraint).toBeDefined();
    expect(targetConstraint?.guardAttribute).toBe('href');
  });

  it('detects "Only used when X is set" patterns', () => {
    const constraints = parseAttributeConstraints(fixture, 'my-button');
    const downloadConstraint = constraints.find((c) => c.attribute === 'download');
    expect(downloadConstraint).toBeDefined();
    expect(downloadConstraint?.guardAttribute).toBe('href');
  });

  it('detects "Only applies to X types" patterns', () => {
    const constraints = parseAttributeConstraints(fixture, 'my-input');
    const minConstraint = constraints.find((c) => c.attribute === 'min');
    expect(minConstraint).toBeDefined();
    expect(minConstraint?.guardAttribute).toBe('type');
    expect(minConstraint?.guardValues).toContain('date');
    expect(minConstraint?.guardValues).toContain('number');
  });

  it('detects "Only valid when type is X" patterns', () => {
    const constraints = parseAttributeConstraints(fixture, 'my-menu-item');
    const checkedConstraint = constraints.find((c) => c.attribute === 'checked');
    expect(checkedConstraint).toBeDefined();
    expect(checkedConstraint?.guardAttribute).toBe('type');
    expect(checkedConstraint?.guardValues).toContain('checkbox');
  });

  it('returns empty for attributes without constraints', () => {
    const constraints = parseAttributeConstraints(fixture, 'my-button');
    expect(constraints.find((c) => c.attribute === 'variant')).toBeUndefined();
  });
});

// ─── checkAttributeConflicts — valid usage ──────────────────────────────────

describe('checkAttributeConflicts — valid usage', () => {
  it('reports no issues when guard attribute is present', () => {
    const html = `<my-button href="/home" target="_blank">Go</my-button>`;
    const result = checkAttributeConflicts(html, 'my-button', fixture);
    expect(result.issues).toHaveLength(0);
    expect(result.clean).toBe(true);
  });

  it('reports no issues when conditional attribute is not used', () => {
    const html = `<my-button variant="primary">Click</my-button>`;
    const result = checkAttributeConflicts(html, 'my-button', fixture);
    expect(result.issues).toHaveLength(0);
  });

  it('reports no issues when type matches guard value', () => {
    const html = `<my-input type="number" min="0" max="100"></my-input>`;
    const result = checkAttributeConflicts(html, 'my-input', fixture);
    expect(result.issues).toHaveLength(0);
  });

  it('reports no issues when checkbox type has checked', () => {
    const html = `<my-menu-item type="checkbox" checked>Option</my-menu-item>`;
    const result = checkAttributeConflicts(html, 'my-menu-item', fixture);
    expect(result.issues).toHaveLength(0);
  });
});

// ─── checkAttributeConflicts — invalid usage ────────────────────────────────

describe('checkAttributeConflicts — invalid usage', () => {
  it('flags target without href', () => {
    const html = `<my-button target="_blank">Go</my-button>`;
    const result = checkAttributeConflicts(html, 'my-button', fixture);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.attribute).toBe('target');
    expect(result.issues[0]?.guardAttribute).toBe('href');
    expect(result.clean).toBe(false);
  });

  it('flags multiple conditional attributes without guard', () => {
    const html = `<my-button target="_blank" download="file.pdf">Go</my-button>`;
    const result = checkAttributeConflicts(html, 'my-button', fixture);
    expect(result.issues).toHaveLength(2);
  });

  it('flags min/max on text input', () => {
    const html = `<my-input type="text" min="0" max="10"></my-input>`;
    const result = checkAttributeConflicts(html, 'my-input', fixture);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('flags password-toggle on non-password input', () => {
    const html = `<my-input type="text" password-toggle></my-input>`;
    const result = checkAttributeConflicts(html, 'my-input', fixture);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.attribute).toBe('password-toggle');
  });

  it('flags checked without checkbox type', () => {
    const html = `<my-menu-item checked>Item</my-menu-item>`;
    const result = checkAttributeConflicts(html, 'my-menu-item', fixture);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.attribute).toBe('checked');
  });

  it('includes line number in issue', () => {
    const html = `<my-button
  target="_blank">Go</my-button>`;
    const result = checkAttributeConflicts(html, 'my-button', fixture);
    expect(result.issues[0]?.line).toBeGreaterThan(0);
  });
});
