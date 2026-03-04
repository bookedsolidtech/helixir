import { describe, it, expect } from 'vitest';
import { generateStory } from '../../packages/core/src/handlers/story.js';
import type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';

// Minimal my-button declaration matching the fixture
const myButtonDecl: CemDeclaration = {
  kind: 'class',
  name: 'MyButton',
  tagName: 'my-button',
  description: 'A generic button component with various style variants and states.',
  members: [
    {
      kind: 'field',
      name: 'variant',
      type: { text: "'primary' | 'secondary' | 'danger'" },
      default: "'primary'",
      description: 'The visual style variant of the button.',
      attribute: 'variant',
    },
    {
      kind: 'field',
      name: 'disabled',
      type: { text: 'boolean' },
      default: 'false',
      description: 'When true, prevents user interaction and applies disabled styling.',
      attribute: 'disabled',
    },
    {
      kind: 'field',
      name: 'size',
      type: { text: "'sm' | 'md' | 'lg'" },
      default: "'md'",
      attribute: 'size',
    },
    // method — should be excluded from argTypes
    {
      kind: 'method',
      name: 'focus',
    },
  ],
};

describe('generateStory — my-button', () => {
  it('includes the correct imports', () => {
    const output = generateStory(myButtonDecl);
    expect(output).toContain("import type { Meta, StoryObj } from '@storybook/web-components'");
    expect(output).toContain("import { html } from 'lit'");
  });

  it('includes the component tag name in meta', () => {
    const output = generateStory(myButtonDecl);
    expect(output).toContain("component: 'my-button'");
    expect(output).toContain("title: 'Components/my-button'");
  });

  it('generates a select argType for variant with correct options', () => {
    const output = generateStory(myButtonDecl);
    expect(output).toContain("variant: { control: { type: 'select' }");
    expect(output).toContain("options: ['primary', 'secondary', 'danger']");
  });

  it('generates a boolean argType for disabled', () => {
    const output = generateStory(myButtonDecl);
    expect(output).toContain("disabled: { control: { type: 'boolean' }");
  });

  it('generates a select argType for size', () => {
    const output = generateStory(myButtonDecl);
    expect(output).toContain("size: { control: { type: 'select' }");
    expect(output).toContain("options: ['sm', 'md', 'lg']");
  });

  it('does not include method members in argTypes', () => {
    const output = generateStory(myButtonDecl);
    expect(output).not.toContain('focus:');
  });

  it('uses ?attr binding syntax for boolean properties', () => {
    const output = generateStory(myButtonDecl);
    expect(output).toContain('?disabled=${disabled}');
  });

  it('uses plain attribute binding for string union properties', () => {
    const output = generateStory(myButtonDecl);
    expect(output).toContain('variant="${variant}"');
  });

  it('exports a Default story', () => {
    const output = generateStory(myButtonDecl);
    expect(output).toContain('export const Default: Story = {}');
  });

  it('generates named story exports for each variant value', () => {
    const output = generateStory(myButtonDecl);
    expect(output).toContain("export const Primary: Story = { args: { variant: 'primary' } }");
    expect(output).toContain("export const Secondary: Story = { args: { variant: 'secondary' } }");
    expect(output).toContain("export const Danger: Story = { args: { variant: 'danger' } }");
  });

  it('sets default args from CEM defaults', () => {
    const output = generateStory(myButtonDecl);
    expect(output).toContain("variant: 'primary'");
    expect(output).toContain('disabled: false');
  });
});

describe('generateStory — component with no union properties', () => {
  const simpleDecl: CemDeclaration = {
    kind: 'class',
    name: 'MyInput',
    tagName: 'my-input',
    members: [
      {
        kind: 'field',
        name: 'value',
        type: { text: 'string' },
        attribute: 'value',
      },
      {
        kind: 'field',
        name: 'count',
        type: { text: 'number' },
        attribute: 'count',
      },
    ],
  };

  it('generates text control for string type', () => {
    const output = generateStory(simpleDecl);
    expect(output).toContain("value: { control: { type: 'text' }");
  });

  it('generates number control for number type', () => {
    const output = generateStory(simpleDecl);
    expect(output).toContain("count: { control: { type: 'number' }");
  });

  it('does not generate named variant stories when no union type exists', () => {
    const output = generateStory(simpleDecl);
    // Only Default should be exported
    const exportLines = output.split('\n').filter((l) => l.startsWith('export const'));
    expect(exportLines).toHaveLength(1);
    expect(exportLines[0]).toContain('Default');
  });
});

describe('generateStory — component with no members', () => {
  const emptyDecl: CemDeclaration = {
    kind: 'class',
    name: 'MyIcon',
    tagName: 'my-icon',
  };

  it('generates a valid story without argTypes', () => {
    const output = generateStory(emptyDecl);
    expect(output).toContain("component: 'my-icon'");
    expect(output).not.toContain('argTypes');
    expect(output).toContain('export const Default: Story = {}');
  });
});
