import { describe, it, expect } from 'vitest';
import { checkHtmlUsage } from '../../packages/core/src/handlers/html-usage-checker.js';
import type { ComponentMetadata } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const buttonMeta: ComponentMetadata = {
  tagName: 'my-button',
  name: 'MyButton',
  description: 'A button component',
  members: [
    {
      name: 'variant',
      kind: 'field',
      type: "'primary' | 'secondary' | 'danger'",
      description: 'Visual variant',
    },
    {
      name: 'disabled',
      kind: 'field',
      type: 'boolean',
      description: 'Disables the button',
    },
    {
      name: 'size',
      kind: 'field',
      type: "'sm' | 'md' | 'lg'",
      description: 'Button size',
    },
    {
      name: 'loading',
      kind: 'field',
      type: 'boolean',
      description: 'Shows loading state',
    },
    { name: 'focus', kind: 'method', type: 'void', description: 'Focus the button' },
  ],
  events: [
    {
      name: 'my-click',
      type: 'CustomEvent<{ originalEvent: MouseEvent }>',
      description: 'Fired on click',
    },
  ],
  slots: [
    { name: '', description: 'Default slot for label text' },
    { name: 'prefix', description: 'Icon before the label' },
    { name: 'suffix', description: 'Icon after the label' },
  ],
  cssProperties: [
    { name: '--my-button-bg', description: 'Background color' },
    { name: '--my-button-color', description: 'Text color' },
  ],
  cssParts: [{ name: 'base', description: 'The button wrapper' }],
};

const cardMeta: ComponentMetadata = {
  tagName: 'my-card',
  name: 'MyCard',
  description: 'A card component',
  members: [
    { name: 'heading', kind: 'field', type: 'string', description: 'Card heading' },
    { name: 'elevated', kind: 'field', type: 'boolean', description: 'Elevated style' },
  ],
  events: [],
  slots: [
    { name: '', description: 'Card body' },
    { name: 'header', description: 'Header content' },
    { name: 'footer', description: 'Footer content' },
  ],
  cssProperties: [],
  cssParts: [],
};

// ─── Slot Validation ─────────────────────────────────────────────────────────

describe('checkHtmlUsage — slot validation', () => {
  it('reports no issues for valid slot names', () => {
    const html = `<my-button>
      <span slot="prefix">+</span>
      Click me
    </my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const slotIssues = result.issues.filter((i) => i.rule === 'unknown-slot');
    expect(slotIssues).toHaveLength(0);
  });

  it('detects unknown slot names', () => {
    const html = `<my-button>
      <span slot="icon">+</span>
      Click me
    </my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const slotIssues = result.issues.filter((i) => i.rule === 'unknown-slot');
    expect(slotIssues).toHaveLength(1);
    expect(slotIssues[0]?.message).toContain('icon');
  });

  it('suggests closest slot name for typos', () => {
    const html = `<my-button>
      <span slot="prefx">+</span>
    </my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const slotIssues = result.issues.filter((i) => i.rule === 'unknown-slot');
    expect(slotIssues).toHaveLength(1);
    expect(slotIssues[0]?.suggestion).toContain('prefix');
  });

  it('handles multiple invalid slots', () => {
    const html = `<my-card>
      <div slot="title">Title</div>
      <div slot="actions">Actions</div>
    </my-card>`;
    const result = checkHtmlUsage(html, cardMeta);
    const slotIssues = result.issues.filter((i) => i.rule === 'unknown-slot');
    expect(slotIssues).toHaveLength(2);
  });
});

// ─── Enum Value Validation ──────────────────────────────────────────────────

describe('checkHtmlUsage — enum value validation', () => {
  it('reports no issues for valid enum values', () => {
    const html = `<my-button variant="primary" size="lg">OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const enumIssues = result.issues.filter((i) => i.rule === 'invalid-enum-value');
    expect(enumIssues).toHaveLength(0);
  });

  it('detects invalid enum values', () => {
    const html = `<my-button variant="blue">OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const enumIssues = result.issues.filter((i) => i.rule === 'invalid-enum-value');
    expect(enumIssues).toHaveLength(1);
    expect(enumIssues[0]?.message).toContain('blue');
    expect(enumIssues[0]?.message).toContain('variant');
  });

  it('lists valid options in suggestion', () => {
    const html = `<my-button variant="warning">OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const enumIssues = result.issues.filter((i) => i.rule === 'invalid-enum-value');
    expect(enumIssues[0]?.suggestion).toContain('primary');
    expect(enumIssues[0]?.suggestion).toContain('secondary');
    expect(enumIssues[0]?.suggestion).toContain('danger');
  });

  it('handles multiple enum attributes', () => {
    const html = `<my-button variant="ghost" size="xl">OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const enumIssues = result.issues.filter((i) => i.rule === 'invalid-enum-value');
    expect(enumIssues).toHaveLength(2);
  });
});

// ─── Boolean Attribute Validation ───────────────────────────────────────────

describe('checkHtmlUsage — boolean attribute validation', () => {
  it('allows bare boolean attributes', () => {
    const html = `<my-button disabled>OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const boolIssues = result.issues.filter((i) => i.rule === 'boolean-string-value');
    expect(boolIssues).toHaveLength(0);
  });

  it('allows boolean attributes set to empty string', () => {
    const html = `<my-button disabled="">OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const boolIssues = result.issues.filter((i) => i.rule === 'boolean-string-value');
    expect(boolIssues).toHaveLength(0);
  });

  it('warns on boolean attributes set to string "true"', () => {
    const html = `<my-button disabled="true">OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const boolIssues = result.issues.filter((i) => i.rule === 'boolean-string-value');
    expect(boolIssues).toHaveLength(1);
    expect(boolIssues[0]?.message).toContain('disabled');
  });

  it('warns on boolean attributes set to string "false"', () => {
    const html = `<my-button disabled="false">OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const boolIssues = result.issues.filter((i) => i.rule === 'boolean-string-value');
    expect(boolIssues).toHaveLength(1);
    expect(boolIssues[0]?.suggestion).toContain('remove');
  });
});

// ─── Unknown Attribute Detection ────────────────────────────────────────────

describe('checkHtmlUsage — unknown attribute detection', () => {
  it('does not flag known attributes', () => {
    const html = `<my-button variant="primary" disabled size="md">OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const unknownIssues = result.issues.filter((i) => i.rule === 'unknown-attribute');
    expect(unknownIssues).toHaveLength(0);
  });

  it('does not flag standard HTML attributes', () => {
    const html = `<my-button class="foo" id="btn" style="color:red" hidden>OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const unknownIssues = result.issues.filter((i) => i.rule === 'unknown-attribute');
    expect(unknownIssues).toHaveLength(0);
  });

  it('does not flag slot, aria-*, data-*, and event attributes', () => {
    const html = `<my-button slot="foo" aria-label="hi" data-id="1" @click="fn">OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const unknownIssues = result.issues.filter((i) => i.rule === 'unknown-attribute');
    expect(unknownIssues).toHaveLength(0);
  });

  it('detects unknown attributes and suggests closest match', () => {
    const html = `<my-button varient="primary">OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    const unknownIssues = result.issues.filter((i) => i.rule === 'unknown-attribute');
    expect(unknownIssues).toHaveLength(1);
    expect(unknownIssues[0]?.suggestion).toContain('variant');
  });
});

// ─── Result Structure ────────────────────────────────────────────────────────

describe('checkHtmlUsage — result structure', () => {
  it('returns clean: true when no issues found', () => {
    const html = `<my-button variant="primary">OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    expect(result.clean).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns tagName from metadata', () => {
    const html = `<my-button>OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    expect(result.tagName).toBe('my-button');
  });

  it('issues have all required fields', () => {
    const html = `<my-button variant="ghost">OK</my-button>`;
    const result = checkHtmlUsage(html, buttonMeta);
    expect(result.issues.length).toBeGreaterThan(0);
    const issue = result.issues[0];
    expect(issue).toHaveProperty('line');
    expect(issue).toHaveProperty('severity');
    expect(issue).toHaveProperty('rule');
    expect(issue).toHaveProperty('message');
    expect(issue).toHaveProperty('suggestion');
  });
});
