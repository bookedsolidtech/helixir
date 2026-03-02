import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { discoverCemPath, FRIENDLY_CEM_ERROR } from '../src/shared/discovery.js';
import { loadConfig } from '../src/config.js';

function createTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'wc-tools-discovery-test-'));
}

function createCemFile(dir: string, relativePath: string): void {
  const parts = relativePath.split('/');
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relativePath), JSON.stringify({ schemaVersion: '1.0.0', modules: [] }));
}

describe('discoverCemPath', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no CEM files exist', () => {
    const result = discoverCemPath(tmpDir);
    expect(result).toBeNull();
  });

  it('finds custom-elements.json at project root (candidate 1)', () => {
    createCemFile(tmpDir, 'custom-elements.json');

    const result = discoverCemPath(tmpDir);

    expect(result).toBe('custom-elements.json');
  });

  it('finds dist/custom-elements.json (candidate 2)', () => {
    createCemFile(tmpDir, 'dist/custom-elements.json');

    const result = discoverCemPath(tmpDir);

    expect(result).toBe('dist/custom-elements.json');
  });

  it('finds src/custom-elements.json (candidate 3)', () => {
    createCemFile(tmpDir, 'src/custom-elements.json');

    const result = discoverCemPath(tmpDir);

    expect(result).toBe('src/custom-elements.json');
  });

  it('finds packages/*/custom-elements.json (monorepo candidate 4)', () => {
    createCemFile(tmpDir, 'packages/my-components/custom-elements.json');

    const result = discoverCemPath(tmpDir);

    expect(result).toBe(join('packages', 'my-components', 'custom-elements.json'));
  });

  it('finds Shoelace CEM (candidate 5)', () => {
    createCemFile(tmpDir, 'node_modules/@shoelace-style/shoelace/dist/custom-elements.json');

    const result = discoverCemPath(tmpDir);

    expect(result).toBe('node_modules/@shoelace-style/shoelace/dist/custom-elements.json');
  });

  it('finds @spectrum-web-components/*/custom-elements.json (candidate 6)', () => {
    createCemFile(tmpDir, 'node_modules/@spectrum-web-components/button/custom-elements.json');

    const result = discoverCemPath(tmpDir);

    expect(result).toBe(
      join('node_modules', '@spectrum-web-components', 'button', 'custom-elements.json'),
    );
  });

  it('returns the root candidate first when multiple exist (priority order)', () => {
    createCemFile(tmpDir, 'custom-elements.json');
    createCemFile(tmpDir, 'dist/custom-elements.json');

    const result = discoverCemPath(tmpDir);

    expect(result).toBe('custom-elements.json');
  });

  it('logs a warning to stderr when multiple candidates are found', () => {
    createCemFile(tmpDir, 'custom-elements.json');
    createCemFile(tmpDir, 'dist/custom-elements.json');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      discoverCemPath(tmpDir);
      expect(stderrSpy).toHaveBeenCalledOnce();
      const message = String(stderrSpy.mock.calls[0][0]);
      expect(message).toContain('[wc-tools] Warning: Multiple custom-elements.json files found');
      expect(message).toContain('custom-elements.json');
      expect(message).toContain('dist/custom-elements.json');
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('does not log a warning when exactly one candidate is found', () => {
    createCemFile(tmpDir, 'dist/custom-elements.json');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      discoverCemPath(tmpDir);
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('handles multiple monorepo packages', () => {
    createCemFile(tmpDir, 'packages/pkg-a/custom-elements.json');
    createCemFile(tmpDir, 'packages/pkg-b/custom-elements.json');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const result = discoverCemPath(tmpDir);
      expect(result).not.toBeNull();
      expect(stderrSpy).toHaveBeenCalledOnce();
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

describe('loadConfig - CEM auto-discovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.unstubAllEnvs();
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('auto-discovers CEM at project root when not explicitly configured', () => {
    createCemFile(tmpDir, 'custom-elements.json');
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const config = loadConfig();

    expect(config.cemPath).toBe('custom-elements.json');
  });

  it('auto-discovers CEM in dist/ when not explicitly configured', () => {
    createCemFile(tmpDir, 'dist/custom-elements.json');
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const config = loadConfig();

    expect(config.cemPath).toBe('dist/custom-elements.json');
  });

  it('emits friendly error to stderr when no CEM found and none configured', () => {
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      loadConfig();
      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      const errorCall = calls.find((msg) => msg.includes('No custom-elements.json found'));
      expect(errorCall).toBeDefined();
      expect(errorCall).toBe(FRIENDLY_CEM_ERROR);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('friendly error message includes generation instructions', () => {
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      loadConfig();
      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      const errorCall = calls.find((msg) => msg.includes('No custom-elements.json found'));
      expect(errorCall).toContain('Lit:');
      expect(errorCall).toContain('Stencil:');
      expect(errorCall).toContain('Shoelace:');
      expect(errorCall).toContain('mcpwc.config.json');
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('skips discovery when cemPath set via env var MCP_WC_CEM_PATH', () => {
    // No CEM files on disk — discovery would fail if run
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
    vi.stubEnv('MCP_WC_CEM_PATH', 'explicit/custom-elements.json');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const config = loadConfig();
      expect(config.cemPath).toBe('explicit/custom-elements.json');
      // No friendly error should be emitted
      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      const errorCall = calls.find((msg) => msg.includes('No custom-elements.json found'));
      expect(errorCall).toBeUndefined();
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('skips discovery when cemPath set in mcpwc.config.json', () => {
    // No CEM files on disk — discovery would fail if run
    writeFileSync(
      join(tmpDir, 'mcpwc.config.json'),
      JSON.stringify({ cemPath: 'explicit/custom-elements.json' }),
    );
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const config = loadConfig();
      expect(config.cemPath).toBe('explicit/custom-elements.json');
      // No friendly error should be emitted
      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      const errorCall = calls.find((msg) => msg.includes('No custom-elements.json found'));
      expect(errorCall).toBeUndefined();
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('env var takes priority over auto-discovered CEM', () => {
    // CEM exists at root but env var points elsewhere
    createCemFile(tmpDir, 'custom-elements.json');
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
    vi.stubEnv('MCP_WC_CEM_PATH', 'override/custom-elements.json');

    const config = loadConfig();

    expect(config.cemPath).toBe('override/custom-elements.json');
  });

  it('keeps default cemPath value when discovery finds nothing (no throw)', () => {
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(() => loadConfig()).not.toThrow();
      const config = loadConfig();
      expect(config.cemPath).toBe('custom-elements.json');
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
