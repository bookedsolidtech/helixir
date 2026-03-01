import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_PATH = resolve(__dirname, '../build/index.js');
const FIXTURE_CEM = resolve(__dirname, './__fixtures__/custom-elements.json');

describe('startup CEM validation', () => {
  it('exits with code 1 and writes a helpful error when CEM file is missing', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wc-mcp-startup-'));
    try {
      const result = spawnSync('node', [SERVER_PATH], {
        env: {
          ...process.env,
          MCP_WC_PROJECT_ROOT: tmpDir,
          // cemPath defaults to 'custom-elements.json', which does not exist in tmpDir
        },
        timeout: 5000,
        encoding: 'utf-8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Fatal: CEM file not found');
      expect(result.stderr).toMatch(/MCP_WC_CEM_PATH|mcpwc\.config\.json/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits with code 1 and writes a parse error when CEM file is malformed JSON', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wc-mcp-startup-'));
    try {
      const cemPath = join(tmpDir, 'custom-elements.json');
      writeFileSync(cemPath, 'not-valid-json{{{');

      const result = spawnSync('node', [SERVER_PATH], {
        env: {
          ...process.env,
          MCP_WC_PROJECT_ROOT: tmpDir,
        },
        timeout: 5000,
        encoding: 'utf-8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Fatal: CEM file');
      expect(result.stderr).toContain('not valid JSON');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('starts successfully when CEM file exists and is valid JSON', () => {
    const result = spawnSync('node', [SERVER_PATH], {
      env: {
        ...process.env,
        MCP_WC_CEM_PATH: FIXTURE_CEM,
      },
      input: '', // close stdin immediately to let the server exit cleanly
      timeout: 5000,
      encoding: 'utf-8',
    });

    // Server may exit non-zero when stdin closes, but should NOT emit a CEM-related fatal error
    expect(result.stderr).not.toContain('Fatal: CEM file');
  });
});
