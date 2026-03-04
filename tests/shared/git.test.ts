/**
 * Unit tests for src/shared/git.ts (GitOperations).
 */
import { describe, it, expect, vi } from 'vitest';

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { GitOperations } from '../../packages/core/src/shared/git.js';
import { ErrorCategory } from '../../packages/core/src/shared/error-handling.js';

// Promisify's exec wraps execFile callbacks — mock via __promisify__ pattern
// Since we use promisify(execFile) with options { timeout }, the callback is the 4th argument.
// We look for the last function argument to handle both 3-arg and 4-arg forms.
function findCallback(args: unknown[]): ((err: Error | null, result: unknown) => void) | null {
  for (let i = args.length - 1; i >= 0; i--) {
    if (typeof args[i] === 'function') {
      return args[i] as (err: Error | null, result: unknown) => void;
    }
  }
  return null;
}

function mockExecFileSuccess(stdout: string): void {
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const callback = findCallback(args);
    if (callback) callback(null, { stdout });
    return {} as ReturnType<typeof execFile>;
  });
}

function mockExecFileError(message: string): void {
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const callback = findCallback(args);
    if (callback) callback(new Error(message), null);
    return {} as ReturnType<typeof execFile>;
  });
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

  describe('ref validation (Finding #1)', () => {
    it('accepts valid alphanumeric branch refs', async () => {
      const cemContent = '{"schemaVersion":"1.0.0","modules":[]}\n';
      mockExecFileSuccess(cemContent);
      const ops = new GitOperations();
      await expect(ops.gitShow('main', 'custom-elements.json')).resolves.toBeDefined();
    });

    it('accepts refs with dots, underscores, hyphens, and slashes', async () => {
      mockExecFileSuccess('{}');
      const ops = new GitOperations();
      await expect(ops.gitShow('feature/my-branch_1.0', 'file.json')).resolves.toBeDefined();
    });

    it('rejects refs with semicolons', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main;rm -rf', 'file.json')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects refs with pipe characters', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main|evil', 'file.json')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects refs starting with double-dash (flag injection)', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('--upload-pack=evil', 'file.json')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects refs containing spaces', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main evil', 'file.json')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects refs with null bytes', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main\0evil', 'file.json')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects refs with ampersands', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main&evil', 'file.json')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects empty string refs', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('', 'file.json')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('accepts very long refs composed of valid characters', async () => {
      mockExecFileSuccess('{"schemaVersion":"1.0.0","modules":[]}');
      const ops = new GitOperations();
      const longRef = 'a'.repeat(500);
      // Long refs with valid chars pass validation and proceed to git
      await expect(ops.gitShow(longRef, 'file.json')).resolves.toBeDefined();
    });

    it('rejects refs with shell metacharacters (backtick)', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main`evil`', 'file.json')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });
  });

  describe('filePath validation', () => {
    it('rejects path traversal with ../../etc/passwd', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main', '../../etc/passwd')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects path traversal with ../secret', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main', '../secret')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects paths with null bytes', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main', 'file\0.json')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects absolute paths', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main', '/etc/passwd')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('accepts valid relative file paths', async () => {
      mockExecFileSuccess('{"schemaVersion":"1.0.0","modules":[]}');
      const ops = new GitOperations();
      await expect(ops.gitShow('main', 'custom-elements.json')).resolves.toBeDefined();
    });

    it('accepts valid nested relative file paths', async () => {
      mockExecFileSuccess('content');
      const ops = new GitOperations();
      await expect(ops.gitShow('main', 'src/shared/git.ts')).resolves.toBeDefined();
    });

    it('rejects filePath starting with "-" (flag injection)', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main', '-rf')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects filePath with shell metacharacter semicolon', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main', 'file;rm -rf /')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects filePath with spaces', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main', 'my file.json')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects filePath with backticks', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main', 'file`evil`.json')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects filePath with pipe character', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main', 'file|evil')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects filePath with ampersand', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main', 'file&evil')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });

    it('rejects empty filePath', async () => {
      const ops = new GitOperations();
      await expect(ops.gitShow('main', '')).rejects.toMatchObject({
        category: ErrorCategory.VALIDATION,
      });
    });
  });
});
