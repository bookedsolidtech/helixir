import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_PATH = resolve(__dirname, '../build/index.js');

describe('wc-mcp init', () => {
  it('writes mcpwc.config.json and prints snippets when CEM is found', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wc-mcp-init-'));
    try {
      // Create a package.json with lit to trigger framework detection
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { lit: '^3.0.0' } }),
      );
      // Create a CEM file at the default candidate location
      writeFileSync(
        join(tmpDir, 'custom-elements.json'),
        JSON.stringify({ schemaVersion: '2.0.0', modules: [] }),
      );

      // Simulate: accept found CEM (empty = Y), skip tokens (empty = skip)
      const input = '\n\n';

      const result = spawnSync('node', [SERVER_PATH, 'init'], {
        cwd: tmpDir,
        input,
        env: { ...process.env },
        timeout: 10000,
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Detected: Lit 3.x');
      expect(result.stdout).toContain('Found CEM: custom-elements.json');
      expect(result.stdout).toContain('Written: mcpwc.config.json');
      expect(result.stdout).toContain('claude_desktop_config.json');
      expect(result.stdout).toContain('"wc-mcp"');

      // Verify config file was written
      const configPath = join(tmpDir, 'mcpwc.config.json');
      expect(existsSync(configPath)).toBe(true);
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      expect(config['cemPath']).toBe('custom-elements.json');
      expect(config['tokensPath']).toBe(null);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('uses custom CEM path when user declines auto-discovered CEM', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wc-mcp-init-'));
    try {
      writeFileSync(
        join(tmpDir, 'custom-elements.json'),
        JSON.stringify({ schemaVersion: '2.0.0', modules: [] }),
      );

      // Simulate: decline found CEM (n), enter custom path, skip tokens
      const input = 'n\ndist/my-cem.json\n\n';

      const result = spawnSync('node', [SERVER_PATH, 'init'], {
        cwd: tmpDir,
        input,
        env: { ...process.env },
        timeout: 10000,
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      const config = JSON.parse(readFileSync(join(tmpDir, 'mcpwc.config.json'), 'utf-8')) as Record<
        string,
        unknown
      >;
      expect(config['cemPath']).toBe('dist/my-cem.json');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('records tokensPath when user provides one', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wc-mcp-init-'));
    try {
      writeFileSync(
        join(tmpDir, 'custom-elements.json'),
        JSON.stringify({ schemaVersion: '2.0.0', modules: [] }),
      );

      // Simulate: accept CEM, provide tokens path
      const input = '\ntokens/design-tokens.json\n';

      const result = spawnSync('node', [SERVER_PATH, 'init'], {
        cwd: tmpDir,
        input,
        env: { ...process.env },
        timeout: 10000,
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      const config = JSON.parse(readFileSync(join(tmpDir, 'mcpwc.config.json'), 'utf-8')) as Record<
        string,
        unknown
      >;
      expect(config['tokensPath']).toBe('tokens/design-tokens.json');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('falls back to default CEM path when none is auto-detected and user skips', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wc-mcp-init-'));
    try {
      // No CEM file present, no package.json
      // Simulate: press Enter for CEM path (use default), skip tokens
      const input = '\n\n';

      const result = spawnSync('node', [SERVER_PATH, 'init'], {
        cwd: tmpDir,
        input,
        env: { ...process.env },
        timeout: 10000,
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      const config = JSON.parse(readFileSync(join(tmpDir, 'mcpwc.config.json'), 'utf-8')) as Record<
        string,
        unknown
      >;
      expect(config['cemPath']).toBe('custom-elements.json');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
