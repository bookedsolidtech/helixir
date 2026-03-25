import type { Cem } from './cem.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ScaffoldSlot {
  /** Slot name. Empty string or 'default' for the default slot. */
  name: string;
  description?: string;
}

export interface ScaffoldCssPart {
  /** CSS part name for `::part()` exposure. */
  name: string;
  description?: string;
}

export interface ScaffoldEvent {
  /** Custom event name (e.g. "hx-change"). */
  name: string;
  /** CustomEvent detail type (e.g. "{ value: string }"). Defaults to "void". */
  type?: string;
  description?: string;
}

export interface ScaffoldProperty {
  /** JavaScript property name. */
  name: string;
  /** TypeScript type (e.g. "string", "boolean", "number"). Defaults to "string". */
  type?: string;
  /** HTML attribute name if different from the property name. */
  attribute?: string;
  /** Default value as a source literal (e.g. "'primary'", "false", "0"). */
  default?: string;
  description?: string;
  /** Whether the property reflects to an attribute. */
  reflects?: boolean;
}

export interface ScaffoldComponentOptions {
  /** The custom element tag name (e.g. "hx-button"). Must contain a hyphen. */
  tagName: string;
  /** Base class to extend. If omitted, detected from the CEM or defaults to "LitElement". */
  baseClass?: string;
  /** Named slots to expose in the component. */
  slots?: ScaffoldSlot[];
  /** CSS parts to expose via `::part()`. */
  cssParts?: ScaffoldCssPart[];
  /** Custom events to dispatch. */
  events?: ScaffoldEvent[];
  /** Reactive properties to declare. */
  properties?: ScaffoldProperty[];
}

export interface DetectedConventions {
  /** Component tag name prefix detected from the CEM (e.g. "hx-"). */
  prefix: string;
  /** Most common base class found in the CEM (e.g. "LitElement"). */
  baseClass: string;
  /** Package name detected from inherited members, or null if not found. */
  packageName: string | null;
}

export interface ScaffoldComponentResult {
  /** Tag name used for the component. */
  tagName: string;
  /** Generated Lit component source (.ts). */
  component: string;
  /** Generated Vitest test stub (.test.ts). */
  test: string;
  /** Generated Storybook CSF3 story (.stories.ts). */
  story: string;
  /** Generated CSS structure file. */
  css: string;
  /** Conventions detected from the target library's CEM. */
  conventions: DetectedConventions;
}

// ─── Convention detection ─────────────────────────────────────────────────────

/**
 * Detect naming conventions from the existing CEM.
 *
 * - `prefix`: inferred from the most common tag name prefix in the library,
 *   or overridden by `configPrefix` when supplied.
 * - `baseClass`: the most commonly used superclass across all declarations.
 * - `packageName`: the first package name found in an inherited member's origin.
 */
export function detectConventions(cem: Cem, configPrefix?: string): DetectedConventions {
  const declarations = cem.modules
    .flatMap((m) => m.declarations ?? [])
    .filter((d) => Boolean(d.tagName));

  // --- Prefix ---
  let prefix = configPrefix ?? '';
  if (!prefix && declarations.length > 0) {
    const counts = new Map<string, number>();
    for (const decl of declarations) {
      const tag = decl.tagName as string;
      const dash = tag.indexOf('-');
      if (dash > 0) {
        const p = tag.slice(0, dash + 1);
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
    }
    let max = 0;
    for (const [p, n] of counts) {
      if (n > max) {
        max = n;
        prefix = p;
      }
    }
  }

  // --- Base class ---
  let baseClass = 'LitElement';
  const superclassCounts = new Map<string, number>();
  for (const decl of declarations) {
    if (decl.superclass?.name) {
      const sc = decl.superclass.name;
      superclassCounts.set(sc, (superclassCounts.get(sc) ?? 0) + 1);
    }
  }
  let maxSc = 0;
  for (const [sc, n] of superclassCounts) {
    if (n > maxSc) {
      maxSc = n;
      baseClass = sc;
    }
  }

  // --- Package name ---
  let packageName: string | null = null;
  outer: for (const decl of declarations) {
    for (const member of decl.members ?? []) {
      if (member.inheritedFrom?.package) {
        packageName = member.inheritedFrom.package;
        break outer;
      }
    }
  }

  return { prefix, baseClass, packageName };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a kebab-case tag name to PascalCase. e.g. "hx-button" → "HxButton" */
function tagNameToClassName(tagName: string): string {
  return tagName
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

/** Resolve a JS/TS type string to its Lit property type constructor name. */
function litPropertyType(type: string | undefined): string {
  if (type === 'boolean') return 'Boolean';
  if (type === 'number') return 'Number';
  return 'String';
}

/** Produce a sensible default value literal for a property's TS type. */
function defaultValueLiteral(prop: ScaffoldProperty): string {
  if (prop.default !== undefined) return prop.default;
  if (prop.type === 'boolean') return 'false';
  if (prop.type === 'number') return '0';
  return "''";
}

// ─── Template generators ──────────────────────────────────────────────────────

function generateComponentSource(
  options: ScaffoldComponentOptions,
  conventions: DetectedConventions,
): string {
  const { tagName, slots = [], cssParts = [], events = [], properties = [] } = options;
  const className = tagNameToClassName(tagName);
  const baseClass = options.baseClass ?? conventions.baseClass;
  const lines: string[] = [];

  // Imports
  lines.push(`import { ${baseClass === 'LitElement' ? 'LitElement, ' : ''}html, css } from 'lit';`);
  lines.push(`import { customElement, property } from 'lit/decorators.js';`);
  lines.push('');

  // JSDoc block with CEM annotations (@slot, @csspart, @fires)
  const hasAnnotations = slots.length > 0 || cssParts.length > 0 || events.length > 0;
  if (hasAnnotations) {
    lines.push('/**');
    for (const slot of slots) {
      const slotName = slot.name === '' || slot.name === 'default' ? '' : slot.name;
      const label = slotName ? `@slot ${slotName}` : '@slot';
      lines.push(` * ${label} - ${slot.description ?? 'Default slot content'}`);
    }
    for (const part of cssParts) {
      lines.push(` * @csspart ${part.name} - ${part.description ?? `The ${part.name} element`}`);
    }
    for (const event of events) {
      const detail = event.type ?? 'void';
      lines.push(
        ` * @fires {CustomEvent<${detail}>} ${event.name} - ${event.description ?? `Fired when ${event.name} occurs`}`,
      );
    }
    lines.push(' */');
  }

  // @customElement decorator + class
  lines.push(`@customElement('${tagName}')`);
  if (baseClass === 'LitElement') {
    lines.push(`export class ${className} extends LitElement {`);
  } else {
    lines.push(`export class ${className} extends ${baseClass} {`);
  }

  // Static styles
  lines.push('  static styles = css`');
  lines.push('    :host {');
  lines.push('      display: block;');
  lines.push('    }');
  if (cssParts.length > 0) {
    lines.push('');
    for (const part of cssParts) {
      lines.push(`    /* [part="${part.name}"] styles */`);
    }
  }
  lines.push('  `;');

  // Properties
  if (properties.length > 0) {
    lines.push('');
    for (const prop of properties) {
      const opts: string[] = [`type: ${litPropertyType(prop.type)}`];
      if (prop.attribute !== undefined) opts.push(`attribute: '${prop.attribute}'`);
      if (prop.reflects) opts.push('reflect: true');
      if (prop.description) {
        lines.push(`  /** ${prop.description} */`);
      }
      lines.push(`  @property({ ${opts.join(', ')} })`);
      lines.push(`  ${prop.name}: ${prop.type ?? 'string'} = ${defaultValueLiteral(prop)};`);
      lines.push('');
    }
  }

  // render()
  lines.push('  render() {');
  lines.push('    return html`');
  if (cssParts.length > 0) {
    const mainPartName = cssParts[0]?.name ?? 'base';
    if (slots.length > 0) {
      lines.push(`      <div part="${mainPartName}">`);
      for (const slot of slots) {
        const isDefault = slot.name === '' || slot.name === 'default';
        lines.push(isDefault ? '        <slot></slot>' : `        <slot name="${slot.name}"></slot>`);
      }
      lines.push('      </div>');
    } else {
      lines.push(`      <div part="${mainPartName}"></div>`);
    }
  } else if (slots.length > 0) {
    for (const slot of slots) {
      const isDefault = slot.name === '' || slot.name === 'default';
      lines.push(isDefault ? '      <slot></slot>' : `      <slot name="${slot.name}"></slot>`);
    }
  } else {
    lines.push('      <slot></slot>');
  }
  lines.push('    `;');
  lines.push('  }');
  lines.push('}');
  lines.push('');

  // HTMLElementTagNameMap augmentation
  lines.push('declare global {');
  lines.push('  interface HTMLElementTagNameMap {');
  lines.push(`    '${tagName}': ${className};`);
  lines.push('  }');
  lines.push('}');

  return lines.join('\n');
}

function generateTestSource(options: ScaffoldComponentOptions): string {
  const { tagName, properties = [] } = options;
  const className = tagNameToClassName(tagName);
  const lines: string[] = [];

  lines.push(`import { describe, it, expect, beforeEach } from 'vitest';`);
  lines.push(`import './${tagName}.js';`);
  lines.push(`import type { ${className} } from './${tagName}.js';`);
  lines.push('');
  lines.push(`describe('${tagName}', () => {`);
  lines.push(`  let el: ${className};`);
  lines.push('');
  lines.push('  beforeEach(async () => {');
  lines.push(`    el = document.createElement('${tagName}') as ${className};`);
  lines.push('    document.body.appendChild(el);');
  lines.push('    await el.updateComplete;');
  lines.push('  });');
  lines.push('');
  lines.push("  it('renders without errors', async () => {");
  lines.push('    expect(el).toBeDefined();');
  lines.push('    expect(el.shadowRoot).toBeTruthy();');
  lines.push('  });');

  for (const prop of properties) {
    lines.push('');
    lines.push(`  it('${prop.name} property', async () => {`);
    if (prop.type === 'boolean') {
      lines.push(`    el.${prop.name} = true;`);
      lines.push('    await el.updateComplete;');
      lines.push(`    expect(el.${prop.name}).toBe(true);`);
    } else if (prop.type === 'number') {
      lines.push(`    el.${prop.name} = 42;`);
      lines.push('    await el.updateComplete;');
      lines.push(`    expect(el.${prop.name}).toBe(42);`);
    } else {
      lines.push(`    el.${prop.name} = 'test-value';`);
      lines.push('    await el.updateComplete;');
      lines.push(`    expect(el.${prop.name}).toBe('test-value');`);
    }
    lines.push('  });');
  }

  lines.push('});');
  return lines.join('\n');
}

function generateStorySource(options: ScaffoldComponentOptions): string {
  const { tagName, properties = [] } = options;
  const lines: string[] = [];

  lines.push(`import type { Meta, StoryObj } from '@storybook/web-components';`);
  lines.push(`import { html } from 'lit';`);
  lines.push('');
  lines.push(`const meta: Meta = {`);
  lines.push(`  title: 'Components/${tagName}',`);
  lines.push(`  component: '${tagName}',`);

  if (properties.length > 0) {
    lines.push('  argTypes: {');
    for (const prop of properties) {
      if (prop.type === 'boolean') {
        lines.push(`    ${prop.name}: { control: { type: 'boolean' } },`);
      } else if (prop.type === 'number') {
        lines.push(`    ${prop.name}: { control: { type: 'number' } },`);
      } else {
        lines.push(`    ${prop.name}: { control: { type: 'text' } },`);
      }
    }
    lines.push('  },');
    lines.push('  args: {');
    for (const prop of properties) {
      lines.push(`    ${prop.name}: ${defaultValueLiteral(prop)},`);
    }
    lines.push('  },');
    const paramNames = properties.map((p) => p.name).join(', ');
    lines.push(`  render: ({ ${paramNames} }) => html\``);
    lines.push(`    <${tagName}`);
    for (const prop of properties) {
      const attrName = prop.attribute ?? prop.name;
      if (prop.type === 'boolean') {
        lines.push(`      ?${attrName}=\${${prop.name}}`);
      } else {
        lines.push(`      ${attrName}="\${${prop.name}}"`);
      }
    }
    lines.push(`    ></${tagName}>\`,`);
  } else {
    lines.push(`  render: () => html\`<${tagName}></${tagName}>\`,`);
  }

  lines.push('};');
  lines.push('');
  lines.push('export default meta;');
  lines.push('type Story = StoryObj<typeof meta>;');
  lines.push('');
  lines.push('export const Default: Story = {};');

  return lines.join('\n');
}

function generateCssSource(options: ScaffoldComponentOptions): string {
  const { tagName, cssParts = [] } = options;
  const lines: string[] = [];

  lines.push(`/* ${tagName} styles */`);
  lines.push('');
  lines.push(':host {');
  lines.push('  display: block;');
  lines.push('}');

  if (cssParts.length > 0) {
    lines.push('');
    lines.push('/* CSS Parts — style with ::part() from consuming context */');
    for (const part of cssParts) {
      lines.push('');
      if (part.description) {
        lines.push(`/* ${part.description} */`);
      }
      lines.push(`[part="${part.name}"] {`);
      lines.push('}');
    }
  }

  return lines.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scaffold a new Helix-pattern web component from options and a CEM context.
 *
 * Detects library conventions (tag prefix, base class, package name) from the
 * CEM so the generated code matches existing library patterns. Returns four
 * files ready to write to disk: a Lit component class, a Vitest test stub, a
 * Storybook CSF3 story, and a CSS structure file.
 *
 * @param options - Component specification (tag name, properties, slots, etc.)
 * @param cem - Parsed Custom Elements Manifest for convention detection
 * @param configPrefix - Optional override for the component prefix
 * @returns All generated file contents plus detected conventions
 */
export function scaffoldComponent(
  options: ScaffoldComponentOptions,
  cem: Cem,
  configPrefix?: string,
): ScaffoldComponentResult {
  const conventions = detectConventions(cem, configPrefix);
  return {
    tagName: options.tagName,
    component: generateComponentSource(options, conventions),
    test: generateTestSource(options),
    story: generateStorySource(options),
    css: generateCssSource(options),
    conventions,
  };
}
