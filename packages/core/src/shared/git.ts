import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MCPError, ErrorCategory } from './error-handling.js';
import { FilePathSchema } from './validation.js';

const execFileAsync = promisify(execFile);

/** Strict allowlist for git refs: must start with alphanumeric, then alphanumeric, dots, underscores, hyphens, and forward slashes. */
const GIT_REF_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._\-/]*$/;

/** Strict allowlist for git file paths: alphanumeric, dots, underscores, hyphens, and forward slashes. */
const GIT_FILE_PATH_REGEX = /^[a-zA-Z0-9._\-/]+$/;

async function git(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { timeout: 30_000 });
    return stdout.trim();
  } catch (err) {
    throw new MCPError(`git ${args[0]} failed: ${String(err)}`, ErrorCategory.GIT);
  }
}

export class GitOperations {
  /**
   * Reads file content at a specific git ref without modifying the working tree.
   * Uses `git show <ref>:<filePath>` to read content from another branch/commit.
   * The filePath must be relative to the git repository root.
   *
   * The `ref` parameter is validated against a strict allowlist before use to
   * prevent flag injection (e.g., refs starting with "--").
   */
  async gitShow(ref: string, filePath: string): Promise<string> {
    if (!GIT_REF_REGEX.test(ref)) {
      throw new MCPError(
        `Invalid git ref "${ref}". Only alphanumeric characters, dots, underscores, hyphens, and forward slashes are allowed.`,
        ErrorCategory.VALIDATION,
      );
    }
    if (!GIT_FILE_PATH_REGEX.test(filePath)) {
      throw new MCPError(
        `Invalid file path "${filePath}". Only alphanumeric characters, dots, underscores, hyphens, and forward slashes are allowed.`,
        ErrorCategory.VALIDATION,
      );
    }
    if (filePath.startsWith('-')) {
      throw new MCPError(
        `Invalid file path "${filePath}". File paths must not start with "-".`,
        ErrorCategory.VALIDATION,
      );
    }
    const filePathResult = FilePathSchema.safeParse(filePath);
    if (!filePathResult.success) {
      throw new MCPError(
        `Invalid file path "${filePath}": ${filePathResult.error.errors[0]?.message ?? 'validation failed'}`,
        ErrorCategory.VALIDATION,
      );
    }
    return git('show', `${ref}:${filePath}`);
  }
}
