import type { CemDeclaration, CemMember } from './cem.js';

// --- Helpers ---

function parseUnionValues(typeText: string): string[] | null {
  const parts = typeText.split('|').map((s) => s.trim());
  const result: string[] = [];
  for (const part of parts) {
    const match = part.match(/^['"](.+)['"]$/);
    if (!match || match[1] === undefined) return null;
    result.push(match[1]);
  }
  return result.length > 0 ? result : null;
}

function toControlType(typeText: string): 'select' | 'boolean' | 'number' | 'text' {
  const t = typeText.trim();
  if (t === 'boolean') return 'boolean';
  if (t === 'number') return 'number';
  if (parseUnionValues(t)) return 'select';
  return 'text';
}

function defaultArg(member: CemMember): string {
  const t = member.type?.text?.trim() ?? '';
  if (t === 'boolean') return 'false';
  if (t === 'number') return '0';
  const union = parseUnionValues(t);
  if (union) return `'${union[0]}'`;
  if (member.default !== undefined) return member.default;
  return "''";
}

function litBinding(field: CemMember): string {
  const t = field.type?.text?.trim() ?? '';
  const attrName = field.attribute ?? field.name;
  if (t === 'boolean') {
    return `      ?${attrName}=\${${field.name}}`;
  }
  return `      ${attrName}="\${${field.name}}"`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function safeDescription(desc: string): string {
  return desc.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// --- Public API ---

/**
 * Generates a complete Storybook CSF3 story file for a web component based on its CEM declaration.
 * Returns a string of TypeScript source ready to paste into a .stories.ts file.
 */
export function generateStory(decl: CemDeclaration): string {
  const tagName = decl.tagName ?? decl.name;
  const fields = (decl.members ?? []).filter((m) => m.kind === 'field');

  // Build argTypes
  const argTypeLines: string[] = [];
  for (const field of fields) {
    const t = field.type?.text?.trim() ?? 'string';
    const controlType = toControlType(t);
    const desc = field.description ? `, description: '${safeDescription(field.description)}'` : '';

    if (controlType === 'select') {
      const options = parseUnionValues(t) ?? [];
      const optStr = options.map((o) => `'${o}'`).join(', ');
      argTypeLines.push(
        `    ${field.name}: { control: { type: 'select' }, options: [${optStr}]${desc} },`,
      );
    } else {
      argTypeLines.push(`    ${field.name}: { control: { type: '${controlType}' }${desc} },`);
    }
  }

  // Build default args
  const argLines: string[] = fields.map((f) => `    ${f.name}: ${defaultArg(f)},`);

  // Build render bindings
  const bindingLines: string[] = fields.map((f) => litBinding(f));

  // Param names for destructuring
  const paramNames = fields.map((f) => f.name);

  // Find variant field for named story exports
  const variantField =
    fields.find(
      (f) =>
        (f.name === 'variant' || f.name === 'size') &&
        parseUnionValues(f.type?.text?.trim() ?? '') !== null,
    ) ?? fields.find((f) => parseUnionValues(f.type?.text?.trim() ?? '') !== null);

  // --- Assemble output ---
  const lines: string[] = [];

  lines.push(`import type { Meta, StoryObj } from '@storybook/web-components';`);
  lines.push(`import { html } from 'lit';`);
  lines.push('');
  lines.push(`const meta: Meta = {`);
  lines.push(`  title: 'Components/${tagName}',`);
  lines.push(`  component: '${tagName}',`);

  if (argTypeLines.length > 0) {
    lines.push(`  argTypes: {`);
    for (const line of argTypeLines) lines.push(line);
    lines.push(`  },`);
  }

  if (argLines.length > 0) {
    lines.push(`  args: {`);
    for (const line of argLines) lines.push(line);
    lines.push(`  },`);
  }

  if (paramNames.length > 0) {
    lines.push(`  render: ({ ${paramNames.join(', ')} }) => html\``);
    lines.push(`    <${tagName}`);
    for (const binding of bindingLines) lines.push(binding);
    lines.push(`    ></${tagName}>\`,`);
  } else {
    lines.push(`  render: () => html\`<${tagName}></${tagName}>\`,`);
  }

  lines.push(`};`);
  lines.push('');
  lines.push(`export default meta;`);
  lines.push(`type Story = StoryObj<typeof meta>;`);
  lines.push('');
  lines.push(`export const Default: Story = {};`);

  // Named story exports for each variant value
  if (variantField) {
    const union = parseUnionValues(variantField.type?.text?.trim() ?? '') ?? [];
    lines.push('');
    for (const value of union) {
      const storyName = capitalize(value);
      lines.push(
        `export const ${storyName}: Story = { args: { ${variantField.name}: '${value}' } };`,
      );
    }
  }

  return lines.join('\n');
}
