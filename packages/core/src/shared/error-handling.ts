import { relative } from 'path';

export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  GIT = 'GIT',
  FILESYSTEM = 'FILESYSTEM',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export class MCPError extends Error {
  readonly category: ErrorCategory;

  constructor(message: string, category: ErrorCategory) {
    super(message);
    this.name = 'MCPError';
    this.category = category;
  }
}

/**
 * Sanitizes an error message to prevent information disclosure:
 * - Absolute paths that start with projectRoot are replaced with relative paths.
 * - All other absolute paths (Unix or Windows) are replaced with "[path redacted]".
 * - Regex pattern details in Zod/validation messages are stripped.
 */
export function sanitizeErrorMessage(message: string, projectRoot: string): string {
  // Replace absolute paths that start with projectRoot with relative equivalents.
  // We do this first (before the blanket redaction) so project-relative paths stay readable.
  let sanitized = message;

  if (projectRoot) {
    // Normalize projectRoot to ensure no trailing slash
    const normalizedRoot = projectRoot.replace(/\/+$/, '');
    // Match the projectRoot prefix (possibly followed by more path characters)
    const escapedRoot = normalizedRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const projectRootRegex = new RegExp(escapedRoot + '(/[^\\s]*)?', 'g');
    sanitized = sanitized.replace(projectRootRegex, (match) => {
      // Compute the path relative to projectRoot
      const relativePath = relative(normalizedRoot, match);
      return relativePath || '.';
    });
  }

  // Strip regex pattern details from Zod validation messages.
  // Patterns like: /someRegex/, "Invalid regex: /pattern/"
  // Must run BEFORE path redaction so regex delimiters aren't mistaken for paths.
  sanitized = sanitized.replace(/Invalid regex:[^;,\n]*/gi, 'Invalid regex: [pattern redacted]');
  sanitized = sanitized.replace(
    /\/(?=[^/\s]*[\\^$[\](){}+*?|])([^/\s]{2,})\/[gimsuy]*/g,
    '[pattern redacted]',
  );

  // Replace any remaining Unix absolute paths (starting with /)
  // Matches paths like /foo/bar/baz (no whitespace)
  sanitized = sanitized.replace(/(?<!\w)(\/[^\s]+)/g, '[path redacted]');

  // Replace Windows absolute paths (e.g. C:\foo\bar)
  sanitized = sanitized.replace(/[A-Za-z]:\\[^\s]*/g, '[path redacted]');

  return sanitized;
}

/**
 * Wraps an unknown thrown value into an MCPError with an appropriate category.
 * Inference rules (applied before falling back to UNKNOWN):
 *   - SyntaxError / TypeError  → VALIDATION
 *   - Error with .code ENOENT  → FILESYSTEM
 *   - Error with .code EACCES  → FILESYSTEM
 *
 * When projectRoot is provided, absolute paths in error messages are sanitized:
 *   - Paths under projectRoot become relative paths
 *   - All other absolute paths are replaced with "[path redacted]"
 * Zod/regex pattern details in VALIDATION errors are also stripped.
 */
export function handleToolError(error: unknown, projectRoot: string = ''): MCPError {
  if (error instanceof MCPError) {
    return error;
  }

  if (error instanceof SyntaxError || error instanceof TypeError) {
    const message = sanitizeErrorMessage(error.message, projectRoot);
    return new MCPError(message, ErrorCategory.VALIDATION);
  }

  if (error instanceof Error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT' || nodeError.code === 'EACCES') {
      const message = sanitizeErrorMessage(error.message, projectRoot);
      return new MCPError(message, ErrorCategory.FILESYSTEM);
    }
    return new MCPError(error.message, ErrorCategory.UNKNOWN);
  }

  return new MCPError(String(error), ErrorCategory.UNKNOWN);
}
