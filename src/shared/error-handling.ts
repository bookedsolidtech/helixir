export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
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
 */
export function handleToolError(error: unknown): MCPError {
  if (error instanceof MCPError) {
    return error;
  }

  if (error instanceof Error) {
    return new MCPError(error.message, ErrorCategory.UNKNOWN);
  }

  return new MCPError(String(error), ErrorCategory.UNKNOWN);
}
