import { z } from 'zod';
import { isAbsolute } from 'node:path';

/**
 * Creates a Zod schema for validating custom element tag names.
 *
 * @param componentPrefix - Required tag name prefix (e.g. "my-" requires "my-button").
 *   Pass an empty string to accept any valid custom element tag name.
 */
export function TagNameSchema(componentPrefix: string): z.ZodString {
  if (componentPrefix === '') {
    return z
      .string()
      .regex(
        /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/,
        'Tag name must be a valid custom element name containing a hyphen',
      );
  }

  const escaped = componentPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return z
    .string()
    .regex(
      new RegExp(`^${escaped}[a-z0-9]+(-[a-z0-9]+)*$`),
      `Tag name must start with "${componentPrefix}"`,
    );
}

/**
 * Zod schema for file paths that rejects path traversal and absolute paths.
 * Also rejects Windows drive letter paths (e.g. C:\...), network share paths (\\server\share),
 * and any path that resolves as absolute.
 */
export const FilePathSchema = z
  .string()
  .refine((p) => !p.includes('\0'), {
    message: 'Null bytes are not allowed in file paths',
  })
  .refine((p) => !p.split(/[/\\]/).some((seg) => seg === '..'), {
    message: 'Path traversal (..) is not allowed',
  })
  .refine((p) => !p.startsWith('/'), {
    message: 'Absolute paths are not allowed',
  })
  .refine((p) => !/^[a-zA-Z]:/.test(p), {
    message: 'Windows drive letter paths are not allowed',
  })
  .refine((p) => !p.startsWith('\\\\'), {
    message: 'Network share paths are not allowed',
  })
  .refine((p) => !isAbsolute(p), {
    message: 'Absolute paths are not allowed',
  });
