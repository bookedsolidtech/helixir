import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MCPError, ErrorCategory } from './error-handling.js';

const execFileAsync = promisify(execFile);

async function git(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args);
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
   */
  async gitShow(ref: string, filePath: string): Promise<string> {
    return git('show', `${ref}:${filePath}`);
  }
}
