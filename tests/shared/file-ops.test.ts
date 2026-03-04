/**
 * Unit tests for src/shared/file-ops.ts (SafeFileOperations).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock fs/promises before importing the module under test
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  access: vi.fn(),
}));

import { readFile, access } from 'node:fs/promises';
import { SafeFileOperations } from '../../packages/core/src/shared/file-ops.js';
import { ErrorCategory } from '../../packages/core/src/shared/error-handling.js';

const TestSchema = z.object({ name: z.string(), value: z.number() });

describe('SafeFileOperations.readJSON', () => {
  let ops: SafeFileOperations;

  beforeEach(() => {
    ops = new SafeFileOperations();
    vi.resetAllMocks();
  });

  it('returns parsed and validated data for valid JSON', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ name: 'foo', value: 42 }));

    const result = await ops.readJSON('/path/to/file.json', TestSchema);

    expect(result).toEqual({ name: 'foo', value: 42 });
  });

  it('throws FILESYSTEM error when readFile fails', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT: no such file'));

    await expect(ops.readJSON('/missing.json', TestSchema)).rejects.toMatchObject({
      category: ErrorCategory.FILESYSTEM,
    });
  });

  it('throws VALIDATION error when JSON is malformed', async () => {
    vi.mocked(readFile).mockResolvedValue('{ not valid json }');

    await expect(ops.readJSON('/bad.json', TestSchema)).rejects.toMatchObject({
      category: ErrorCategory.VALIDATION,
    });
  });

  it('throws VALIDATION error when schema validation fails', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ name: 'foo', value: 'not-a-number' }));

    await expect(ops.readJSON('/schema-fail.json', TestSchema)).rejects.toMatchObject({
      category: ErrorCategory.VALIDATION,
    });
  });
});

describe('SafeFileOperations.fileExists', () => {
  let ops: SafeFileOperations;

  beforeEach(() => {
    ops = new SafeFileOperations();
    vi.resetAllMocks();
  });

  it('returns true when access succeeds', async () => {
    vi.mocked(access).mockResolvedValue(undefined);
    expect(await ops.fileExists('/exists.json')).toBe(true);
  });

  it('returns false when access throws', async () => {
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
    expect(await ops.fileExists('/missing.json')).toBe(false);
  });
});
