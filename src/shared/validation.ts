import { z } from 'zod';

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
 */
export const FilePathSchema = z
  .string()
  .refine((p) => !p.includes('..'), {
    message: 'Path traversal (..) is not allowed',
  })
  .refine((p) => !p.startsWith('/'), {
    message: 'Absolute paths are not allowed',
  });
