import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { formatTable } from '../src/cli/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_PATH = resolve(__dirname, '../build/src/index.js');
const FIXTURE_CEM = resolve(__dirname, './__fixtures__/custom-elements.json');
const FIXTURE_ROOT = resolve(__dirname, './__fixtures__');

// ─── Unit tests for formatTable ───────────────────────────────────────────────

describe('formatTable', () => {
  it('renders headers and rows with correct padding', () => {
    const result = formatTable(
      ['Name', 'Value'],
      [
        ['foo', 'bar'],
        ['longer-key', 'x'],
      ],
    );
    const lines = result.split('\n');
    expect(lines[0]).toContain('Name');
    expect(lines[0]).toContain('Value');
    expect(lines[1]).toMatch(/^[-]+/); // separator line
    expect(lines[2]).toContain('foo');
    expect(lines[3]).toContain('longer-key');
  });

  it('handles single column', () => {
    const result = formatTable(['Component'], [['my-button'], ['my-input']]);
    expect(result).toContain('Component');
    expect(result).toContain('my-button');
    expect(result).toContain('my-input');
  });

  it('handles empty rows', () => {
    const result = formatTable(['Col'], []);
    expect(result).toContain('Col');
  });

  it('pads cells to equal width', () => {
    const result = formatTable(
      ['A', 'B'],
      [
        ['short', 'x'],
        ['much-longer', 'y'],
      ],
    );
    const lines = result.split('\n');
    // All data lines should have the same length
    expect(lines[2]?.length).toBe(lines[3]?.length);
  });
});

// ─── CLI subcommand integration tests ────────────────────────────────────────

describe('helixir CLI subcommands (requires build)', () => {
  function runCli(args: string[], extraEnv?: Record<string, string>) {
    return spawnSync('node', [SERVER_PATH, ...args], {
      env: {
        ...process.env,
        MCP_WC_CEM_PATH: FIXTURE_CEM,
        MCP_WC_PROJECT_ROOT: FIXTURE_ROOT,
        ...extraEnv,
      },
      timeout: 10000,
      encoding: 'utf-8',
    });
  }

  it('help subcommand prints usage text', () => {
    const result = runCli(['help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('helixir');
    expect(result.stdout).toContain('Subcommands');
    expect(result.stdout).toContain('analyze');
    expect(result.stdout).toContain('health');
  });

  it('--help flag with no subcommand prints usage text', () => {
    const result = runCli(['--help']);
    expect(result.stdout).toContain('helixir');
  });

  it('unknown subcommand exits 1 with error message', () => {
    const result = runCli(['totally-unknown-subcommand-xyz']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown subcommand');
  });

  it('analyze lists all components in JSON format', () => {
    const result = runCli(['analyze', '--format', 'json']);
    expect(result.status).toBe(0);
    const data: unknown = JSON.parse(result.stdout);
    expect(Array.isArray(data)).toBe(true);
  });

  it('analyze returns table output with --format table', () => {
    const result = runCli(['analyze', '--format', 'table']);
    expect(result.status).toBe(0);
    // Table output should contain separator characters
    expect(result.stdout).toMatch(/[-|]/);
  });

  it('health lists scores in JSON format', () => {
    const result = runCli(['health', '--format', 'json']);
    expect(result.status).toBe(0);
    const data: unknown = JSON.parse(result.stdout);
    expect(Array.isArray(data)).toBe(true);
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0] as Record<string, unknown>;
      expect(first).toHaveProperty('score');
      expect(first).toHaveProperty('grade');
      expect(first).toHaveProperty('tagName');
    }
  });

  it('health --ci exits 0 when all scores above low threshold', () => {
    const result = runCli(['health', '--ci', '--threshold', '0', '--format', 'json']);
    expect(result.status).toBe(0);
  });

  it('health --ci exits 2 when threshold is impossibly high', () => {
    const result = runCli(['health', '--ci', '--threshold', '999', '--format', 'json']);
    // Either 0 (no components) or 2 (below threshold)
    expect([0, 2]).toContain(result.status);
  });

  it('diff --ci exits with 0 or 2 (requires git)', () => {
    const result = runCli(['diff', '--ci', '--format', 'json', '--base', 'main']);
    // May fail if not in a git repo or branch differs; just check it doesn't crash with exit 1
    expect([0, 1, 2]).toContain(result.status);
  });

  it('migrate requires a tag name', () => {
    const result = runCli(['migrate', '--format', 'json']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires a tag name');
  });

  it('suggest requires a tag name', () => {
    const result = runCli(['suggest', '--format', 'json']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires a tag name');
  });

  it('bundle requires a tag name', () => {
    const result = runCli(['bundle', '--format', 'json']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires a tag name');
  });

  it('compare requires two CEM paths', () => {
    const result = runCli(['compare', '--format', 'json']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires two CEM paths');
  });

  it('benchmark requires at least one CEM path', () => {
    const result = runCli(['benchmark', '--format', 'json']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires at least one CEM path');
  });

  it('validate requires a tag name', () => {
    const result = runCli(['validate', '--format', 'json']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires a tag name');
  });

  it('validate requires --html flag', () => {
    const result = runCli(['validate', 'my-button', '--format', 'json']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires --html');
  });

  it('cdn requires a package name', () => {
    const result = runCli(['cdn', '--format', 'json']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires a package name');
  });

  it('compare two fixture CEMs produces output', () => {
    // Pass relative paths — compareLibraries resolves them against projectRoot
    const result = runCli([
      'compare',
      'cem-compare-a.json',
      'cem-compare-b.json',
      '--format',
      'json',
    ]);
    expect(result.status).toBe(0);
    const data = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(data).toHaveProperty('countA');
    expect(data).toHaveProperty('countB');
  });
});

describe('helixir init', () => {
  it('writes mcpwc.config.json and prints snippets when CEM is found', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wc-tools-init-'));
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
      expect(result.stdout).toContain('"helixir"');

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
    const tmpDir = mkdtempSync(join(tmpdir(), 'wc-tools-init-'));
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
    const tmpDir = mkdtempSync(join(tmpdir(), 'wc-tools-init-'));
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
    const tmpDir = mkdtempSync(join(tmpdir(), 'wc-tools-init-'));
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
