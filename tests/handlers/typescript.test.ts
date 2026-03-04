import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { McpWcConfig } from '../../packages/core/src/config.js';
import { getFileDiagnostics, getProjectDiagnostics } from '../../packages/core/src/handlers/typescript.js';
import { FilePathSchema } from '../../packages/core/src/shared/validation.js';

let tempDir: string;

function makeConfig(projectRoot: string): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot,
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

beforeAll(() => {
  tempDir = resolve(tmpdir(), `wc-tools-ts-test-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  writeFileSync(
    resolve(tempDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'bundler',
        noEmit: true,
      },
      include: ['**/*.ts'],
    }),
  );

  // File with a known type error
  writeFileSync(
    resolve(tempDir, 'error.ts'),
    `const x: number = "this is a string"; // type error\n`,
  );

  // Clean file with no errors
  writeFileSync(resolve(tempDir, 'clean.ts'), `const x: number = 42;\n`);
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('getFileDiagnostics', { timeout: 15_000 }, () => {
  it('detects a type error in a file with errors', () => {
    const config = makeConfig(tempDir);
    const diagnostics = getFileDiagnostics(config, 'error.ts');
    expect(diagnostics.length).toBeGreaterThan(0);
    const error = diagnostics.find((d) => d.severity === 'error');
    expect(error).toBeDefined();
    expect(error?.file).toContain('error.ts');
    expect(error?.line).toBeGreaterThan(0);
    expect(error?.column).toBeGreaterThan(0);
    expect(typeof error?.message).toBe('string');
    expect(error?.message.length).toBeGreaterThan(0);
  });

  it('returns zero diagnostics for a clean file', () => {
    const config = makeConfig(tempDir);
    const diagnostics = getFileDiagnostics(config, 'clean.ts');
    expect(diagnostics).toEqual([]);
  });

  it('returns DiagnosticResult objects with the correct shape', () => {
    const config = makeConfig(tempDir);
    const diagnostics = getFileDiagnostics(config, 'error.ts');
    for (const d of diagnostics) {
      expect(typeof d.file).toBe('string');
      expect(typeof d.line).toBe('number');
      expect(typeof d.column).toBe('number');
      expect(typeof d.message).toBe('string');
      expect(['error', 'warning', 'info']).toContain(d.severity);
    }
  });

  it('blocks path traversal via FilePathSchema', () => {
    const config = makeConfig(tempDir);
    expect(() => getFileDiagnostics(config, '../outside.ts')).toThrow();
    expect(() => getFileDiagnostics(config, 'a/../../b.ts')).toThrow();
  });

  it('blocks absolute paths via FilePathSchema', () => {
    const config = makeConfig(tempDir);
    expect(() => getFileDiagnostics(config, '/etc/passwd')).toThrow();
  });
});

describe('getProjectDiagnostics', { timeout: 15_000 }, () => {
  it('detects errors in a project with type errors', () => {
    const config = makeConfig(tempDir);
    const result = getProjectDiagnostics(config);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.errors.length).toBe(result.errorCount);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.warnings.length).toBe(result.warningCount);
  });

  it('returns the correct result shape', () => {
    const config = makeConfig(tempDir);
    const result = getProjectDiagnostics(config);
    expect(typeof result.errorCount).toBe('number');
    expect(typeof result.warningCount).toBe('number');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('returns zero errors for a clean project', () => {
    // Create a separate temp dir with only a clean file
    const cleanDir = resolve(tmpdir(), `wc-tools-ts-clean-${Date.now()}`);
    mkdirSync(cleanDir, { recursive: true });

    writeFileSync(
      resolve(cleanDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2020',
          module: 'ESNext',
          moduleResolution: 'bundler',
          noEmit: true,
        },
        include: ['**/*.ts'],
      }),
    );
    writeFileSync(resolve(cleanDir, 'index.ts'), `const x: number = 42;\n`);

    try {
      const config = makeConfig(cleanDir);
      const result = getProjectDiagnostics(config);
      expect(result.errorCount).toBe(0);
      expect(result.errors).toEqual([]);
    } finally {
      rmSync(cleanDir, { recursive: true, force: true });
    }
  });
});

describe('FilePathSchema path traversal', () => {
  it('rejects paths with ..', () => {
    expect(() => FilePathSchema.parse('../outside.ts')).toThrow();
    expect(() => FilePathSchema.parse('a/../../b.ts')).toThrow();
  });

  it('rejects absolute paths', () => {
    expect(() => FilePathSchema.parse('/etc/passwd')).toThrow();
    expect(() => FilePathSchema.parse('/tmp/some-file.ts')).toThrow();
  });

  it('accepts valid relative paths', () => {
    expect(() => FilePathSchema.parse('src/foo.ts')).not.toThrow();
    expect(() => FilePathSchema.parse('error.ts')).not.toThrow();
    expect(() => FilePathSchema.parse('a/b/c.ts')).not.toThrow();
  });
});
