import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig } from '../packages/core/src/config.js';

describe('loadConfig — helixir.mcp.json rename', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.unstubAllEnvs();
    tmpDir = mkdtempSync(join(tmpdir(), 'helixir-rename-test-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads values from helixir.mcp.json (primary)', () => {
    writeFileSync(
      join(tmpDir, 'helixir.mcp.json'),
      JSON.stringify({ cemPath: 'dist/cem.json', componentPrefix: 'hx-' }),
    );
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const config = loadConfig();

    expect(config.cemPath).toBe('dist/cem.json');
    expect(config.componentPrefix).toBe('hx-');
  });

  it('falls back to mcpwc.config.json with deprecation warning', () => {
    writeFileSync(
      join(tmpDir, 'mcpwc.config.json'),
      JSON.stringify({ cemPath: 'legacy-cem.json' }),
    );
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const config = loadConfig();
      expect(config.cemPath).toBe('legacy-cem.json');
      expect(stderrSpy).toHaveBeenCalledWith(
        '[helixir] Warning: mcpwc.config.json is deprecated. Rename to helixir.mcp.json.\n',
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('prefers helixir.mcp.json when both files exist', () => {
    writeFileSync(join(tmpDir, 'helixir.mcp.json'), JSON.stringify({ cemPath: 'new-cem.json' }));
    writeFileSync(join(tmpDir, 'mcpwc.config.json'), JSON.stringify({ cemPath: 'old-cem.json' }));
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const config = loadConfig();
    expect(config.cemPath).toBe('new-cem.json');
  });

  it('does not emit deprecation warning when only helixir.mcp.json exists', () => {
    writeFileSync(join(tmpDir, 'helixir.mcp.json'), JSON.stringify({ cemPath: 'new-cem.json' }));
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      loadConfig();
      expect(stderrSpy).not.toHaveBeenCalledWith(expect.stringContaining('deprecated'));
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('returns defaults when neither config file exists', () => {
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const config = loadConfig();
    expect(config.cemPath).toBe('custom-elements.json');
    expect(config.tsconfigPath).toBe('tsconfig.json');
  });

  it('handles malformed helixir.mcp.json gracefully', () => {
    writeFileSync(join(tmpDir, 'helixir.mcp.json'), 'invalid-json{{{');
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(() => loadConfig()).not.toThrow();
      expect(stderrSpy).toHaveBeenCalledWith(
        '[helixir] Warning: helixir.mcp.json is malformed. Using defaults.\n',
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('handles malformed mcpwc.config.json in fallback gracefully', () => {
    writeFileSync(join(tmpDir, 'mcpwc.config.json'), 'invalid-json{{{');
    vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(() => loadConfig()).not.toThrow();
      // Should get both deprecation warning AND malformed warning
      expect(stderrSpy).toHaveBeenCalledWith(
        '[helixir] Warning: mcpwc.config.json is deprecated. Rename to helixir.mcp.json.\n',
      );
      expect(stderrSpy).toHaveBeenCalledWith(
        '[helixir] Warning: mcpwc.config.json is malformed. Using defaults.\n',
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
