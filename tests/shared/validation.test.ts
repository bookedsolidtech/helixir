import { describe, it, expect } from 'vitest';
import { TagNameSchema, FilePathSchema } from '../../packages/core/src/shared/validation.js';

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

  describe('with prefix without trailing hyphen', () => {
    const schema = TagNameSchema('hx');

    it('accepts valid custom element names starting with prefix', () => {
      expect(schema.safeParse('hx-button').success).toBe(true);
      expect(schema.safeParse('hx-card-header').success).toBe(true);
    });

    it('rejects names without a hyphen (not valid custom elements)', () => {
      expect(schema.safeParse('hxfoo').success).toBe(false);
      expect(schema.safeParse('hx123').success).toBe(false);
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

  describe('null byte injection', () => {
    it('rejects paths with an embedded null byte', () => {
      expect(FilePathSchema.safeParse('src/file\0.ts').success).toBe(false);
      expect(FilePathSchema.safeParse('src/\0../etc/passwd').success).toBe(false);
    });

    it('rejects paths with a leading null byte', () => {
      expect(FilePathSchema.safeParse('\0etc/passwd').success).toBe(false);
      expect(FilePathSchema.safeParse('\0').success).toBe(false);
    });
  });

  describe('Finding #3 hardening', () => {
    it('rejects Windows drive letter paths (C:\\...)', () => {
      expect(FilePathSchema.safeParse('C:\\Windows\\System32').success).toBe(false);
      expect(FilePathSchema.safeParse('c:/etc/passwd').success).toBe(false);
      expect(FilePathSchema.safeParse('Z:/secret').success).toBe(false);
    });

    it('rejects network share paths (\\\\server\\share)', () => {
      expect(FilePathSchema.safeParse('\\\\server\\share').success).toBe(false);
      expect(FilePathSchema.safeParse('\\\\192.168.1.1\\c$').success).toBe(false);
    });

    it('rejects paths that are absolute according to path.isAbsolute', () => {
      // On POSIX these are absolute — already covered by the /- check
      // On Windows, drive-letter paths are also caught by the windows check above
      expect(FilePathSchema.safeParse('/usr/local/bin').success).toBe(false);
    });
  });
});
