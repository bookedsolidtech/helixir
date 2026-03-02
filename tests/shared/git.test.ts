/**
 * Unit tests for src/shared/git.ts (GitOperations).
 */
import { describe, it, expect, vi } from 'vitest';

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { GitOperations } from '../../src/shared/git.js';
import { ErrorCategory } from '../../src/shared/error-handling.js';

// Promisify's exec wraps execFile callbacks — mock via __promisify__ pattern
// Since we use promisify(execFile), we mock execFile to call its callback.
function mockExecFileSuccess(stdout: string): void {
  vi.mocked(execFile).mockImplementation(
    (_cmd, _args, callback: (err: Error | null, result: { stdout: string }) => void) => {
      callback(null, { stdout });
      return {} as ReturnType<typeof execFile>;
    },
  );
}

function mockExecFileError(message: string): void {
  vi.mocked(execFile).mockImplementation(
    (_cmd, _args, callback: (err: Error | null, result: unknown) => void) => {
      callback(new Error(message), null);
      return {} as ReturnType<typeof execFile>;
    },
  );
}

describe('GitOperations.gitShow', () => {
  it('returns trimmed file content from git show', async () => {
    const cemContent = '{"schemaVersion":"1.0.0","modules":[]}\n';
    mockExecFileSuccess(cemContent);

    const ops = new GitOperations();
    const result = await ops.gitShow('main', 'custom-elements.json');

    expect(result).toBe('{"schemaVersion":"1.0.0","modules":[]}');
  });

  it('throws MCPError with GIT category when git fails', async () => {
    mockExecFileError('fatal: not a git repository');

    const ops = new GitOperations();

    await expect(ops.gitShow('main', 'custom-elements.json')).rejects.toMatchObject({
      category: ErrorCategory.GIT,
    });
  });
});
