import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.unstubAllEnvs();
    tmpDir = mkdtempSync(join(tmpdir(), 'wc-mcp-test-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('defaults', () => {
    it('returns default values when no env vars and no config file', () => {
      // Point projectRoot at empty tmpDir so no mcpwc.config.json is found
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const config = loadConfig();

      expect(config.cemPath).toBe('custom-elements.json');
      expect(config.projectRoot).toBe(tmpDir);
      expect(config.componentPrefix).toBe('');
      expect(config.healthHistoryDir).toBe('.mcp-wc/health');
      expect(config.tsconfigPath).toBe('tsconfig.json');
      expect(config.tokensPath).toBeNull();
    });

    it('tokensPath defaults to null (token tools disabled)', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const config = loadConfig();

      expect(config.tokensPath).toBeNull();
    });

    it('componentPrefix defaults to empty string (any prefix accepted)', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const config = loadConfig();

      expect(config.componentPrefix).toBe('');
    });
  });

  describe('config file (mcpwc.config.json)', () => {
    it('loads values from mcpwc.config.json', () => {
      writeFileSync(
        join(tmpDir, 'mcpwc.config.json'),
        JSON.stringify({
          cemPath: 'dist/custom-elements.json',
          componentPrefix: 'my-',
          tokensPath: 'tokens.json',
        }),
      );
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const config = loadConfig();

      expect(config.cemPath).toBe('dist/custom-elements.json');
      expect(config.componentPrefix).toBe('my-');
      expect(config.tokensPath).toBe('tokens.json');
    });

    it('config file overrides defaults but preserves unset defaults', () => {
      writeFileSync(
        join(tmpDir, 'mcpwc.config.json'),
        JSON.stringify({ cemPath: 'file-cem.json' }),
      );
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const config = loadConfig();

      expect(config.cemPath).toBe('file-cem.json');
      // These were not in the file — defaults should still apply
      expect(config.tsconfigPath).toBe('tsconfig.json');
      expect(config.healthHistoryDir).toBe('.mcp-wc/health');
    });

    it('config file can set tokensPath to null (JSON null)', () => {
      writeFileSync(join(tmpDir, 'mcpwc.config.json'), JSON.stringify({ tokensPath: null }));
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const config = loadConfig();

      expect(config.tokensPath).toBeNull();
    });

    it('silently ignores missing config file', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      expect(() => loadConfig()).not.toThrow();
    });

    it('writes a warning to stderr for malformed config file but does not throw', () => {
      writeFileSync(join(tmpDir, 'mcpwc.config.json'), 'not-valid-json{{{');
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        expect(() => loadConfig()).not.toThrow();
        expect(stderrSpy).toHaveBeenCalledWith(
          '[wc-mcp] Warning: mcpwc.config.json is malformed. Using defaults.\n',
        );
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it('uses defaults when config file is malformed', () => {
      writeFileSync(join(tmpDir, 'mcpwc.config.json'), 'not-valid-json{{{');
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        const config = loadConfig();
        expect(config.cemPath).toBe('custom-elements.json');
        expect(config.tsconfigPath).toBe('tsconfig.json');
        expect(config.tokensPath).toBeNull();
      } finally {
        stderrSpy.mockRestore();
      }
    });
  });

  describe('environment variables', () => {
    it('MCP_WC_CEM_PATH overrides cemPath', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CEM_PATH', 'env-custom-elements.json');

      const config = loadConfig();

      expect(config.cemPath).toBe('env-custom-elements.json');
    });

    it('MCP_WC_COMPONENT_PREFIX overrides componentPrefix', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_COMPONENT_PREFIX', 'sl-');

      const config = loadConfig();

      expect(config.componentPrefix).toBe('sl-');
    });

    it('MCP_WC_HEALTH_HISTORY_DIR overrides healthHistoryDir', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_HEALTH_HISTORY_DIR', 'custom/health');

      const config = loadConfig();

      expect(config.healthHistoryDir).toBe('custom/health');
    });

    it('MCP_WC_TSCONFIG_PATH overrides tsconfigPath', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_TSCONFIG_PATH', 'tsconfig.prod.json');

      const config = loadConfig();

      expect(config.tsconfigPath).toBe('tsconfig.prod.json');
    });

    it('MCP_WC_TOKENS_PATH sets tokensPath to the given path', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_TOKENS_PATH', 'tokens/design.json');

      const config = loadConfig();

      expect(config.tokensPath).toBe('tokens/design.json');
    });

    it('MCP_WC_TOKENS_PATH=null disables token tools (sets tokensPath to null)', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_TOKENS_PATH', 'null');

      const config = loadConfig();

      expect(config.tokensPath).toBeNull();
    });
  });

  describe('priority order: env vars > config file > defaults', () => {
    it('env vars override config file values', () => {
      writeFileSync(
        join(tmpDir, 'mcpwc.config.json'),
        JSON.stringify({
          cemPath: 'file-cem.json',
          componentPrefix: 'file-',
        }),
      );
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CEM_PATH', 'env-cem.json');

      const config = loadConfig();

      // env var wins over config file
      expect(config.cemPath).toBe('env-cem.json');
      // config file wins over default (no env var for this field)
      expect(config.componentPrefix).toBe('file-');
    });

    it('config file wins over defaults for unset env vars', () => {
      writeFileSync(
        join(tmpDir, 'mcpwc.config.json'),
        JSON.stringify({ healthHistoryDir: 'file-health' }),
      );
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const config = loadConfig();

      expect(config.healthHistoryDir).toBe('file-health');
      // Still falls back to default for unset fields
      expect(config.cemPath).toBe('custom-elements.json');
    });

    it('all env vars override both config file and defaults', () => {
      writeFileSync(
        join(tmpDir, 'mcpwc.config.json'),
        JSON.stringify({
          cemPath: 'file-cem.json',
          componentPrefix: 'file-',
          healthHistoryDir: 'file-health',
          tsconfigPath: 'file-tsconfig.json',
          tokensPath: 'file-tokens.json',
        }),
      );

      const envRoot = mkdtempSync(join(tmpdir(), 'wc-mcp-test-env-'));
      try {
        vi.stubEnv('MCP_WC_PROJECT_ROOT', envRoot);
        vi.stubEnv('MCP_WC_CEM_PATH', 'env-cem.json');
        vi.stubEnv('MCP_WC_COMPONENT_PREFIX', 'env-');
        vi.stubEnv('MCP_WC_HEALTH_HISTORY_DIR', 'env-health');
        vi.stubEnv('MCP_WC_TSCONFIG_PATH', 'env-tsconfig.json');
        vi.stubEnv('MCP_WC_TOKENS_PATH', 'env-tokens.json');

        const config = loadConfig();

        expect(config.projectRoot).toBe(envRoot);
        expect(config.cemPath).toBe('env-cem.json');
        expect(config.componentPrefix).toBe('env-');
        expect(config.healthHistoryDir).toBe('env-health');
        expect(config.tsconfigPath).toBe('env-tsconfig.json');
        expect(config.tokensPath).toBe('env-tokens.json');
      } finally {
        rmSync(envRoot, { recursive: true, force: true });
      }
    });
  });
});
