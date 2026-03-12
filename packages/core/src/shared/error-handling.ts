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
 * Wraps an unknown thrown value into an MCPError with an appropriate category.
 * Inference rules (applied before falling back to UNKNOWN):
 *   - SyntaxError / TypeError  → VALIDATION
 *   - Error with .code ENOENT  → FILESYSTEM
 *   - Error with .code EACCES  → FILESYSTEM
 */
export function handleToolError(error: unknown): MCPError {
  if (error instanceof MCPError) {
    return error;
  }

  if (error instanceof SyntaxError || error instanceof TypeError) {
    return new MCPError(error.message, ErrorCategory.VALIDATION);
  }

  if (error instanceof Error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT' || nodeError.code === 'EACCES') {
      return new MCPError(error.message, ErrorCategory.FILESYSTEM);
    }
    return new MCPError(error.message, ErrorCategory.UNKNOWN);
  }

  return new MCPError(String(error), ErrorCategory.UNKNOWN);
}
