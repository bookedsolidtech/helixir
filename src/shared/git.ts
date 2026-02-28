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
   * Stashes any pending changes, checks out the given branch, runs fn,
   * then restores the original branch and pops the stash (if one was created).
   */
  async withBranch<T>(branch: string, fn: () => Promise<T>): Promise<T> {
    const originalBranch = await git('rev-parse', '--abbrev-ref', 'HEAD');

    const stashOutput = await git('stash', 'push', '--include-untracked', '-m', 'wc-mcp-temp');
    const stashed = !stashOutput.includes('No local changes to save');

    try {
      await git('checkout', branch);

      try {
        return await fn();
      } finally {
        await git('checkout', originalBranch);
      }
    } finally {
      if (stashed) {
        await git('stash', 'pop');
      }
    }
  }
}
