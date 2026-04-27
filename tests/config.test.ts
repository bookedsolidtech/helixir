import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig } from '../packages/core/src/config.js';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.unstubAllEnvs();
    tmpDir = mkdtempSync(join(tmpdir(), 'helixir-test-'));
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

    it('cdnBase defaults to null (CDN disabled)', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const config = loadConfig();

      expect(config.cdnBase).toBeNull();
    });

    it('cdnAutoloader defaults to null', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const config = loadConfig();

      expect(config.cdnAutoloader).toBeNull();
    });

    it('cdnStylesheet defaults to null', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const config = loadConfig();

      expect(config.cdnStylesheet).toBeNull();
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

    it('config file can set CDN fields', () => {
      writeFileSync(
        join(tmpDir, 'mcpwc.config.json'),
        JSON.stringify({
          cdnBase: 'https://cdn.example.com',
          cdnAutoloader: 'https://cdn.example.com/autoloader.js',
          cdnStylesheet: 'https://cdn.example.com/styles.css',
        }),
      );
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const config = loadConfig();

      expect(config.cdnBase).toBe('https://cdn.example.com');
      expect(config.cdnAutoloader).toBe('https://cdn.example.com/autoloader.js');
      expect(config.cdnStylesheet).toBe('https://cdn.example.com/styles.css');
    });

    it('silently ignores missing config file', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      expect(() => loadConfig()).not.toThrow();
    });

    it('honors MCP_WC_CONFIG_PATH for a config path nested inside the workspace', () => {
      // Common case: a colocated packages/ds/helixir.mcp.json with relative
      // path fields. The result must be PROJECT-RELATIVE (not absolute) so
      // downstream consumers (mcp/index.ts containment check, git-backed
      // paths in handlers/cem.ts and handlers/health.ts) keep working.
      const nestedDir = join(tmpDir, 'packages', 'ds');
      mkdirSync(nestedDir, { recursive: true });
      const nestedConfig = join(nestedDir, 'helixir.mcp.json');
      writeFileSync(nestedConfig, JSON.stringify({ cemPath: 'dist/custom-elements.json' }));
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CONFIG_PATH', nestedConfig);

      const config = loadConfig();
      // Project-relative path; joins to <tmpDir>/packages/ds/dist/custom-elements.json
      expect(config.cemPath).toBe(join('packages', 'ds', 'dist', 'custom-elements.json'));
    });

    it('rebases all relative path fields in a nested config to repo-relative', () => {
      // Inside-projectRoot variant of the rebase: paths land under
      // packages/ds/* and stay relative to the workspace root, ready for
      // git-backed handlers and the mcp/index.ts containment check.
      const nestedDir = join(tmpDir, 'packages', 'ds');
      mkdirSync(nestedDir, { recursive: true });
      const nestedConfig = join(nestedDir, 'helixir.mcp.json');
      writeFileSync(
        nestedConfig,
        JSON.stringify({
          cemPath: 'dist/custom-elements.json',
          tsconfigPath: 'tsconfig.build.json',
          tokensPath: 'tokens/generated.json',
          healthHistoryDir: '.health',
        }),
      );
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CONFIG_PATH', nestedConfig);

      const config = loadConfig();
      expect(config.cemPath).toBe(join('packages', 'ds', 'dist', 'custom-elements.json'));
      expect(config.tsconfigPath).toBe(join('packages', 'ds', 'tsconfig.build.json'));
      expect(config.tokensPath).toBe(join('packages', 'ds', 'tokens', 'generated.json'));
      expect(config.healthHistoryDir).toBe(join('packages', 'ds', '.health'));
    });

    it('drops out-of-tree absolute cemPath but preserves other absolute fields', () => {
      // cemPath outside projectRoot is dropped (mcp/index.ts containment +
      // gitShow's repo-relative requirement). tsconfigPath/tokensPath/
      // healthHistoryDir are preserved as absolute because their handlers
      // accept absolute paths via plain resolve().
      const externalDir = mkdtempSync(join(tmpdir(), 'helixir-external-'));
      const externalConfig = join(externalDir, 'helixir.mcp.json');
      try {
        writeFileSync(
          externalConfig,
          JSON.stringify({
            cemPath: '/abs/path/custom-elements.json',
            tsconfigPath: '/shared/tsconfig.base.json',
            tokensPath: '/shared/tokens.json',
            healthHistoryDir: '/tmp/helixir-health',
          }),
        );
        vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
        vi.stubEnv('MCP_WC_CONFIG_PATH', externalConfig);

        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
          const config = loadConfig();
          // cemPath dropped → falls back to default
          expect(config.cemPath).toBe('custom-elements.json');
          // Non-CEM absolute paths preserved
          expect(config.tsconfigPath).toBe('/shared/tsconfig.base.json');
          expect(config.tokensPath).toBe('/shared/tokens.json');
          expect(config.healthHistoryDir).toBe('/tmp/helixir-health');
          // Drop warning is for cemPath only
          const warnings = stderrSpy.mock.calls.flat().join(' ');
          expect(warnings).toContain('cemPath');
        } finally {
          stderrSpy.mockRestore();
        }
      } finally {
        rmSync(externalDir, { recursive: true, force: true });
      }
    });

    it('falls back to in-repo discovery when MCP_WC_CONFIG_PATH points at a missing file', () => {
      // A stale or mistyped editor setting should not silently discard a
      // working workspace config. Warn, then continue into the standard
      // in-root discovery path.
      writeFileSync(
        join(tmpDir, 'helixir.mcp.json'),
        JSON.stringify({ componentPrefix: 'wc-', cemPath: 'in-repo-cem.json' }),
      );
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CONFIG_PATH', join(tmpDir, 'does-not-exist.json'));

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        const config = loadConfig();
        expect(config.componentPrefix).toBe('wc-');
        expect(config.cemPath).toBe('in-repo-cem.json');
        const warnings = stderrSpy.mock.calls.flat().join(' ');
        expect(warnings).toContain('MCP_WC_CONFIG_PATH');
        expect(warnings).toContain('not found');
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it('falls back to in-repo discovery when MCP_WC_CONFIG_PATH JSON is malformed', () => {
      writeFileSync(join(tmpDir, 'helixir.mcp.json'), JSON.stringify({ componentPrefix: 'wc-' }));
      writeFileSync(join(tmpDir, 'broken.json'), '{not valid json');
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CONFIG_PATH', join(tmpDir, 'broken.json'));

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        const config = loadConfig();
        expect(config.componentPrefix).toBe('wc-');
        const warnings = stderrSpy.mock.calls.flat().join(' ');
        expect(warnings).toContain('malformed');
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it('drops fields that would resolve outside projectRoot, with a warning', () => {
      // A relative cemPath inside an external config rebases to a path that
      // escapes projectRoot. mcp/index.ts has a hard containment check that
      // would crash startup; rather than handing it a path it will reject,
      // we drop the field so defaults take over and emit a warning.
      const externalDir = mkdtempSync(join(tmpdir(), 'helixir-external-'));
      const externalConfig = join(externalDir, 'helixir.mcp.json');
      try {
        writeFileSync(externalConfig, JSON.stringify({ cemPath: 'dist/cem.json' }));
        vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
        vi.stubEnv('MCP_WC_CONFIG_PATH', externalConfig);

        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
          const config = loadConfig();
          // Field dropped → falls back to default
          expect(config.cemPath).toBe('custom-elements.json');
          // Warning emitted
          const warnings = stderrSpy.mock.calls.flat().join(' ');
          expect(warnings).toContain('cemPath');
          expect(warnings).toContain('outside projectRoot');
        } finally {
          stderrSpy.mockRestore();
        }
      } finally {
        rmSync(externalDir, { recursive: true, force: true });
      }
    });

    it('resolves MCP_WC_CONFIG_PATH relative to projectRoot when not absolute', () => {
      writeFileSync(
        join(tmpDir, 'custom-config.json'),
        JSON.stringify({ cemPath: 'relative-cem.json' }),
      );
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CONFIG_PATH', 'custom-config.json');

      const config = loadConfig();
      expect(config.cemPath).toBe('relative-cem.json');
    });

    it('writes a warning to stderr for malformed config file but does not throw', () => {
      writeFileSync(join(tmpDir, 'mcpwc.config.json'), 'not-valid-json{{{');
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        expect(() => loadConfig()).not.toThrow();
        expect(stderrSpy).toHaveBeenCalledWith(
          '[helixir] Warning: mcpwc.config.json is malformed. Using defaults.\n',
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

    it('MCP_WC_CDN_BASE sets cdnBase to the given path', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CDN_BASE', 'https://cdn.example.com');

      const config = loadConfig();

      expect(config.cdnBase).toBe('https://cdn.example.com');
    });

    it('MCP_WC_CDN_BASE=null disables CDN (sets cdnBase to null)', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CDN_BASE', 'null');

      const config = loadConfig();

      expect(config.cdnBase).toBeNull();
    });

    it('MCP_WC_CDN_AUTOLOADER sets cdnAutoloader to the given path', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CDN_AUTOLOADER', 'https://cdn.example.com/autoloader.js');

      const config = loadConfig();

      expect(config.cdnAutoloader).toBe('https://cdn.example.com/autoloader.js');
    });

    it('MCP_WC_CDN_AUTOLOADER=null disables CDN autoloader (sets cdnAutoloader to null)', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CDN_AUTOLOADER', 'null');

      const config = loadConfig();

      expect(config.cdnAutoloader).toBeNull();
    });

    it('MCP_WC_CDN_STYLESHEET sets cdnStylesheet to the given path', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CDN_STYLESHEET', 'https://cdn.example.com/styles.css');

      const config = loadConfig();

      expect(config.cdnStylesheet).toBe('https://cdn.example.com/styles.css');
    });

    it('MCP_WC_CDN_STYLESHEET=null disables CDN stylesheet (sets cdnStylesheet to null)', () => {
      vi.stubEnv('MCP_WC_PROJECT_ROOT', tmpDir);
      vi.stubEnv('MCP_WC_CDN_STYLESHEET', 'null');

      const config = loadConfig();

      expect(config.cdnStylesheet).toBeNull();
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

      const envRoot = mkdtempSync(join(tmpdir(), 'helixir-test-env-'));
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
