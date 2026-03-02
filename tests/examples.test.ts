import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../src/config.js';

const EXAMPLES_DIR = resolve(new URL('.', import.meta.url).pathname, '../examples');

function getExampleConfigs(): Array<{ name: string; configPath: string; content: string }> {
  const entries = readdirSync(EXAMPLES_DIR, { withFileTypes: true });
  const results: Array<{ name: string; configPath: string; content: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const configPath = join(EXAMPLES_DIR, entry.name, 'mcpwc.config.json');
    try {
      const content = readFileSync(configPath, 'utf-8');
      results.push({ name: entry.name, configPath, content });
    } catch {
      // Directory has no mcpwc.config.json (e.g., claude-desktop) — skip
    }
  }

  return results;
}

describe('example configs', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.unstubAllEnvs();
    tmpDir = mkdtempSync(join(tmpdir(), 'wc-tools-examples-test-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds at least one example mcpwc.config.json', () => {
    const configs = getExampleConfigs();
    expect(configs.length).toBeGreaterThanOrEqual(1);
  });

  it('each example mcpwc.config.json is valid JSON', () => {
    const configs = getExampleConfigs();
    for (const { name, content } of configs) {
      expect(
        () => JSON.parse(content),
        `examples/${name}/mcpwc.config.json is not valid JSON`,
      ).not.toThrow();
    }
  });

  it('each example mcpwc.config.json is accepted by loadConfig() without throwing', () => {
    const configs = getExampleConfigs();

    for (const { name, content } of configs) {
      const exampleTmpDir = mkdtempSync(join(tmpdir(), `wc-tools-example-${name}-`));
      try {
        writeFileSync(join(exampleTmpDir, 'mcpwc.config.json'), content);
        vi.stubEnv('MCP_WC_PROJECT_ROOT', exampleTmpDir);

        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
          expect(
            () => loadConfig(),
            `examples/${name}/mcpwc.config.json caused loadConfig() to throw`,
          ).not.toThrow();

          const config = loadConfig();
          expect(config, `examples/${name}: loadConfig() returned falsy`).toBeTruthy();
          expect(typeof config.cemPath, `examples/${name}: cemPath should be a string`).toBe(
            'string',
          );
        } finally {
          stderrSpy.mockRestore();
        }
      } finally {
        vi.unstubAllEnvs();
        rmSync(exampleTmpDir, { recursive: true, force: true });
      }
    }
  });

  describe('specific examples', () => {
    it('shoelace example sets componentPrefix to sl-', () => {
      const shoelacePath = join(EXAMPLES_DIR, 'shoelace', 'mcpwc.config.json');
      const parsed = JSON.parse(readFileSync(shoelacePath, 'utf-8'));
      expect(parsed.componentPrefix).toBe('sl-');
    });

    it('lit example has a cemPath field', () => {
      const litPath = join(EXAMPLES_DIR, 'lit', 'mcpwc.config.json');
      const parsed = JSON.parse(readFileSync(litPath, 'utf-8'));
      expect(parsed.cemPath).toBeTruthy();
    });

    it('stencil example points to dist/custom-elements directory', () => {
      const stencilPath = join(EXAMPLES_DIR, 'stencil', 'mcpwc.config.json');
      const parsed = JSON.parse(readFileSync(stencilPath, 'utf-8'));
      expect(parsed.cemPath).toContain('custom-elements');
    });

    it('fast example sets componentPrefix to fluent-', () => {
      const fastPath = join(EXAMPLES_DIR, 'fast', 'mcpwc.config.json');
      const parsed = JSON.parse(readFileSync(fastPath, 'utf-8'));
      expect(parsed.componentPrefix).toBe('fluent-');
    });

    it('spectrum example sets componentPrefix to sp-', () => {
      const spectrumPath = join(EXAMPLES_DIR, 'spectrum', 'mcpwc.config.json');
      const parsed = JSON.parse(readFileSync(spectrumPath, 'utf-8'));
      expect(parsed.componentPrefix).toBe('sp-');
    });
  });
});
