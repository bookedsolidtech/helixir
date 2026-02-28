import { describe, it, expect } from 'vitest';
import { TagNameSchema, FilePathSchema } from '../../src/shared/validation.js';

describe('TagNameSchema', () => {
  describe('with custom prefix', () => {
    const schema = TagNameSchema('my-');

    it('accepts tag names that start with the prefix', () => {
      expect(schema.safeParse('my-button').success).toBe(true);
      expect(schema.safeParse('my-icon').success).toBe(true);
      expect(schema.safeParse('my-card-header').success).toBe(true);
    });

    it('rejects tag names that do not start with the prefix', () => {
      expect(schema.safeParse('other-button').success).toBe(false);
      expect(schema.safeParse('button').success).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(schema.safeParse('').success).toBe(false);
    });
  });

  describe('with empty prefix', () => {
    const schema = TagNameSchema('');

    it('accepts any valid custom element tag name', () => {
      expect(schema.safeParse('my-button').success).toBe(true);
      expect(schema.safeParse('x-icon').success).toBe(true);
      expect(schema.safeParse('sl-card').success).toBe(true);
      expect(schema.safeParse('a-b').success).toBe(true);
    });

    it('rejects tag names without a hyphen', () => {
      expect(schema.safeParse('button').success).toBe(false);
      expect(schema.safeParse('div').success).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(schema.safeParse('').success).toBe(false);
    });
  });

  describe('invalid tag names', () => {
    const schema = TagNameSchema('');

    it('rejects tag names starting with uppercase', () => {
      expect(schema.safeParse('My-button').success).toBe(false);
    });

    it('rejects tag names starting with a hyphen', () => {
      expect(schema.safeParse('-button').success).toBe(false);
    });

    it('rejects tag names with special characters', () => {
      expect(schema.safeParse('my button').success).toBe(false);
      expect(schema.safeParse('my_button').success).toBe(false);
    });
  });
});

describe('FilePathSchema', () => {
  it('accepts valid relative paths', () => {
    expect(FilePathSchema.safeParse('src/components/button.ts').success).toBe(true);
    expect(FilePathSchema.safeParse('README.md').success).toBe(true);
    expect(FilePathSchema.safeParse('a/b/c.ts').success).toBe(true);
  });

  it('rejects path traversal (..)', () => {
    expect(FilePathSchema.safeParse('../outside').success).toBe(false);
    expect(FilePathSchema.safeParse('src/../../../etc/passwd').success).toBe(false);
    expect(FilePathSchema.safeParse('..').success).toBe(false);
  });

  it('rejects absolute paths', () => {
    expect(FilePathSchema.safeParse('/etc/passwd').success).toBe(false);
    expect(FilePathSchema.safeParse('/absolute/path/file.ts').success).toBe(false);
  });
});
