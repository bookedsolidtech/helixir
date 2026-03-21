import { describe, it, expect } from 'vitest';
import { checkA11yUsage } from '../../packages/core/src/handlers/a11y-usage-checker.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fixture: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module' as const,
      path: 'src/my-dialog.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyDialog',
          tagName: 'my-dialog',
          members: [
            {
              kind: 'field' as const,
              name: 'label',
              type: { text: 'string' },
              description: 'The dialog label for accessibility. Required even with no-header.',
              attribute: 'label',
            },
            {
              kind: 'field' as const,
              name: 'noHeader',
              type: { text: 'boolean' },
              description: 'Removes the header.',
              attribute: 'no-header',
            },
          ],
          events: [],
          slots: [
            { name: '', description: 'The dialog body.' },
            { name: 'label', description: 'The dialog label slot.' },
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
              description: 'The name of the tab panel this tab controls.',
              attribute: 'panel',
            },
          ],
          events: [],
          slots: [{ name: '', description: 'The tab label.' }],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-icon-button.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyIconButton',
          tagName: 'my-icon-button',
          members: [
            {
              kind: 'field' as const,
              name: 'label',
              type: { text: 'string' },
              description: 'An accessible label for the button. Required for icon-only buttons.',
              attribute: 'label',
            },
            {
              kind: 'field' as const,
              name: 'name',
              type: { text: 'string' },
              description: 'The icon name.',
              attribute: 'name',
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
      path: 'src/my-button.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyButton',
          tagName: 'my-button',
          members: [
            {
              kind: 'field' as const,
              name: 'variant',
              type: { text: 'string' },
              description: 'The button variant.',
              attribute: 'variant',
            },
          ],
          events: [],
          slots: [{ name: '', description: 'The button label.' }],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
  ],
};

// ─── Missing accessible labels ──────────────────────────────────────────────

describe('checkA11yUsage — missing labels', () => {
  it('flags icon-button without label attribute', () => {
    const html = `<my-icon-button name="gear"></my-icon-button>`;
    const result = checkA11yUsage(html, 'my-icon-button', fixture);
    expect(result.issues.some((i) => i.rule === 'missing-label')).toBe(true);
    expect(result.clean).toBe(false);
  });

  it('no issue when icon-button has label', () => {
    const html = `<my-icon-button name="gear" label="Settings"></my-icon-button>`;
    const result = checkA11yUsage(html, 'my-icon-button', fixture);
    expect(result.issues.filter((i) => i.rule === 'missing-label')).toHaveLength(0);
  });

  it('no issue when icon-button has aria-label', () => {
    const html = `<my-icon-button name="gear" aria-label="Settings"></my-icon-button>`;
    const result = checkA11yUsage(html, 'my-icon-button', fixture);
    expect(result.issues.filter((i) => i.rule === 'missing-label')).toHaveLength(0);
  });

  it('no issue when icon-button has aria-labelledby', () => {
    const html = `<my-icon-button name="gear" aria-labelledby="label-id"></my-icon-button>`;
    const result = checkA11yUsage(html, 'my-icon-button', fixture);
    expect(result.issues.filter((i) => i.rule === 'missing-label')).toHaveLength(0);
  });

  it('flags dialog without label or aria-label', () => {
    const html = `<my-dialog><p>Content</p></my-dialog>`;
    const result = checkA11yUsage(html, 'my-dialog', fixture);
    expect(result.issues.some((i) => i.rule === 'missing-label')).toBe(true);
  });

  it('no issue when dialog has label attribute', () => {
    const html = `<my-dialog label="Confirm delete"><p>Are you sure?</p></my-dialog>`;
    const result = checkA11yUsage(html, 'my-dialog', fixture);
    expect(result.issues.filter((i) => i.rule === 'missing-label')).toHaveLength(0);
  });
});

// ─── Manual role override ───────────────────────────────────────────────────

describe('checkA11yUsage — role override', () => {
  it('flags manual role on tab component', () => {
    const html = `<my-tab role="button" panel="general">General</my-tab>`;
    const result = checkA11yUsage(html, 'my-tab', fixture);
    expect(result.issues.some((i) => i.rule === 'role-override')).toBe(true);
  });

  it('no issue when no role is set', () => {
    const html = `<my-tab panel="general">General</my-tab>`;
    const result = checkA11yUsage(html, 'my-tab', fixture);
    expect(result.issues.filter((i) => i.rule === 'role-override')).toHaveLength(0);
  });
});

// ─── Components that don't need labels ─────────────────────────────────────

describe('checkA11yUsage — no false positives', () => {
  it('does not flag button with text content', () => {
    const html = `<my-button>Click me</my-button>`;
    const result = checkA11yUsage(html, 'my-button', fixture);
    expect(result.issues.filter((i) => i.rule === 'missing-label')).toHaveLength(0);
  });

  it('returns clean when no issues', () => {
    const html = `<my-button variant="primary">OK</my-button>`;
    const result = checkA11yUsage(html, 'my-button', fixture);
    expect(result.clean).toBe(true);
  });
});

// ─── Result structure ──────────────────────────────────────────────────────

describe('checkA11yUsage — result structure', () => {
  it('includes severity in issues', () => {
    const html = `<my-icon-button name="gear"></my-icon-button>`;
    const result = checkA11yUsage(html, 'my-icon-button', fixture);
    expect(result.issues[0]?.severity).toBeDefined();
  });

  it('includes line number in issues', () => {
    const html = `<div>
<my-icon-button name="gear"></my-icon-button>
</div>`;
    const result = checkA11yUsage(html, 'my-icon-button', fixture);
    const labelIssue = result.issues.find((i) => i.rule === 'missing-label');
    expect(labelIssue?.line).toBe(2);
  });
});
