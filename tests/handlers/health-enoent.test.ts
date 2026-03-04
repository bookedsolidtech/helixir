import { describe, it, expect, vi, afterEach } from 'vitest';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// Mock node:fs/promises before importing the handler
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
}));

import { readdir } from 'node:fs/promises';
import { getHealthTrend } from '../../packages/core/src/handlers/health.js';

function makeConfig(): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: '/project',
    componentPrefix: '',
    healthHistoryDir: '.health-history',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('loadLatestHistoryFile — ENOENT vs non-ENOENT errors', () => {
  it('falls back to legacy path when namespaced dir returns ENOENT', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    vi.mocked(readdir)
      .mockRejectedValueOnce(enoent) // namespaced dir → ENOENT → fall back
      .mockRejectedValueOnce(enoent); // legacy dir also missing → return null
    // getHealthTrend throws "No health history found" (not a filesystem error) when null is returned
    await expect(getHealthTrend(makeConfig(), 'my-button')).rejects.toThrow(
      /No health history found for 'my-button'/,
    );
  });

  it('surfaces EACCES error from namespaced dir without falling back to legacy path', async () => {
    const eacces = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    vi.mocked(readdir).mockRejectedValueOnce(eacces);
    await expect(getHealthTrend(makeConfig(), 'my-button')).rejects.toThrow(
      /EACCES: permission denied/,
    );
    // readdir should only have been called once — no fallback attempted
    expect(vi.mocked(readdir)).toHaveBeenCalledTimes(1);
  });
});
