import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveCdnCem } from '../../packages/core/src/handlers/cdn.js';
import { MCPError, ErrorCategory } from '../../packages/core/src/shared/error-handling.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

const VALID_CEM = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/components/button.js',
      declarations: [{ kind: 'class', name: 'SlButton', tagName: 'sl-button' }],
    },
  ],
};

function makeConfig(): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: '/tmp/test-project',
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

function stubFetch(opts: {
  ok?: boolean;
  status?: number;
  body?: string;
  contentLength?: number | null;
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      headers: {
        get: (name: string) => {
          if (name === 'content-length') {
            return opts.contentLength !== undefined && opts.contentLength !== null
              ? String(opts.contentLength)
              : null;
          }
          return null;
        },
      },
      body: undefined, // no ReadableStream in tests; falls back to response.text()
      text: vi.fn().mockResolvedValue(opts.body ?? JSON.stringify(VALID_CEM)),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveCdnCem', () => {
  it('happy path: returns cachePath, componentCount, formatted', async () => {
    stubFetch({ body: JSON.stringify(VALID_CEM) });
    const result = await resolveCdnCem(
      '@shoelace-style/shoelace',
      '2.15.0',
      'jsdelivr',
      makeConfig(),
    );
    expect(result.componentCount).toBe(1);
    expect(result.cachePath).toContain('shoelace-style-shoelace@2.15.0.json');
    expect(result.formatted).toContain('shoelace');
    expect(result.formatted).toContain('1 component');
  });

  it('formatted message does not contain an absolute path when cache is written', async () => {
    const { mkdirSync, writeFileSync } = await import('fs');
    vi.mocked(mkdirSync).mockImplementation(() => undefined);
    vi.mocked(writeFileSync).mockImplementation(() => undefined);
    stubFetch({ body: JSON.stringify(VALID_CEM) });
    const config = makeConfig();
    const result = await resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', config);
    // formatted must not expose the absolute projectRoot path
    expect(result.formatted).not.toContain(config.projectRoot);
    expect(result.formatted).not.toMatch(/Cached to \//);
  });

  it('404 response: throws MCPError with NETWORK_ERROR', async () => {
    stubFetch({ ok: false, status: 404 });
    await expect(
      resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', makeConfig()),
    ).rejects.toMatchObject({ category: ErrorCategory.NETWORK_ERROR });
  });

  it('404 response error is an MCPError instance', async () => {
    stubFetch({ ok: false, status: 404 });
    const err = await resolveCdnCem(
      '@shoelace-style/shoelace',
      '2.15.0',
      'jsdelivr',
      makeConfig(),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MCPError);
  });

  it('bad JSON: throws MCPError with VALIDATION', async () => {
    stubFetch({ body: 'not valid json {{{{' });
    await expect(
      resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', makeConfig()),
    ).rejects.toMatchObject({ category: ErrorCategory.VALIDATION });
  });

  it('invalid CEM schema: throws MCPError with VALIDATION', async () => {
    // Valid JSON but missing required `modules` field
    stubFetch({ body: JSON.stringify({ schemaVersion: '1.0.0' }) });
    await expect(
      resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', makeConfig()),
    ).rejects.toMatchObject({ category: ErrorCategory.VALIDATION });
  });

  it('package name sanitization: @scope/pkg becomes scope-pkg in cache filename', async () => {
    stubFetch({ body: JSON.stringify(VALID_CEM) });
    const result = await resolveCdnCem('@scope/pkg', 'latest', 'jsdelivr', makeConfig());
    expect(result.cachePath).toContain('scope-pkg@latest.json');
    expect(result.cachePath).not.toContain('@scope');
  });

  it('uses unpkg host when registry is unpkg', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: undefined,
      text: vi.fn().mockResolvedValue(JSON.stringify(VALID_CEM)),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await resolveCdnCem('@scope/pkg', 'latest', 'unpkg', makeConfig());
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('unpkg.com');
  });

  describe('Finding #4: strict semver version validation', () => {
    it('rejects version strings with traversal-like sequences', async () => {
      await expect(
        resolveCdnCem('@shoelace-style/shoelace', '../evil', 'jsdelivr', makeConfig()),
      ).rejects.toMatchObject({ category: ErrorCategory.VALIDATION });
    });

    it('rejects version strings with special characters beyond semver', async () => {
      await expect(
        resolveCdnCem('@shoelace-style/shoelace', '1.0.0; rm -rf', 'jsdelivr', makeConfig()),
      ).rejects.toMatchObject({ category: ErrorCategory.VALIDATION });
    });

    it('accepts strict semver with pre-release', async () => {
      stubFetch({ body: JSON.stringify(VALID_CEM) });
      const result = await resolveCdnCem(
        '@shoelace-style/shoelace',
        '2.15.0-beta.1',
        'jsdelivr',
        makeConfig(),
      );
      expect(result.componentCount).toBe(1);
    });

    it('accepts "latest" as a valid version', async () => {
      stubFetch({ body: JSON.stringify(VALID_CEM) });
      const result = await resolveCdnCem(
        '@shoelace-style/shoelace',
        'latest',
        'jsdelivr',
        makeConfig(),
      );
      expect(result.componentCount).toBe(1);
    });

    it('rejects version with caret (not strict semver)', async () => {
      await expect(
        resolveCdnCem('@shoelace-style/shoelace', '^2.15.0', 'jsdelivr', makeConfig()),
      ).rejects.toMatchObject({ category: ErrorCategory.VALIDATION });
    });
  });

  describe('Finding #5: npm package name validation', () => {
    it('rejects package names with null bytes', async () => {
      await expect(
        resolveCdnCem('pkg\0evil', '1.0.0', 'jsdelivr', makeConfig()),
      ).rejects.toMatchObject({ category: ErrorCategory.VALIDATION });
    });

    it('rejects package names with newlines', async () => {
      await expect(
        resolveCdnCem('pkg\nevil', '1.0.0', 'jsdelivr', makeConfig()),
      ).rejects.toMatchObject({ category: ErrorCategory.VALIDATION });
    });

    it('rejects package names with spaces', async () => {
      await expect(
        resolveCdnCem('pkg evil', '1.0.0', 'jsdelivr', makeConfig()),
      ).rejects.toMatchObject({ category: ErrorCategory.VALIDATION });
    });

    it('rejects uppercase package names', async () => {
      await expect(
        resolveCdnCem('MyPackage', '1.0.0', 'jsdelivr', makeConfig()),
      ).rejects.toMatchObject({ category: ErrorCategory.VALIDATION });
    });

    it('accepts valid scoped package names', async () => {
      stubFetch({ body: JSON.stringify(VALID_CEM) });
      await expect(
        resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', makeConfig()),
      ).resolves.toBeDefined();
    });
  });

  describe('Finding #7: CDN URL prefix assertion', () => {
    it('fetches from jsdelivr CDN prefix', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: undefined,
        text: vi.fn().mockResolvedValue(JSON.stringify(VALID_CEM)),
      });
      vi.stubGlobal('fetch', fetchSpy);
      await resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', makeConfig());
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\//);
    });

    it('fetches from unpkg CDN prefix', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: undefined,
        text: vi.fn().mockResolvedValue(JSON.stringify(VALID_CEM)),
      });
      vi.stubGlobal('fetch', fetchSpy);
      await resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'unpkg', makeConfig());
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toMatch(/^https:\/\/unpkg\.com\/@/);
      expect(calledUrl).not.toContain('unpkg.com/npm/');
    });
  });

  describe('Finding #8: CDN cache write error handling', () => {
    it('returns success without cachePath when cache write fails', async () => {
      const { mkdirSync, writeFileSync } = await import('fs');
      vi.mocked(mkdirSync).mockImplementation(() => {
        throw new Error('ENOSPC: no space left');
      });
      vi.mocked(writeFileSync).mockImplementation(() => {});

      stubFetch({ body: JSON.stringify(VALID_CEM) });
      const result = await resolveCdnCem(
        '@shoelace-style/shoelace',
        '2.15.0',
        'jsdelivr',
        makeConfig(),
      );
      expect(result.componentCount).toBe(1);
      expect(result.cachePath).toBeUndefined();
    });
  });

  describe('Security: CDN response size cap', () => {
    it('rejects response when Content-Length exceeds 10 MB', async () => {
      stubFetch({ contentLength: 11 * 1024 * 1024 });
      await expect(
        resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', makeConfig()),
      ).rejects.toMatchObject({ category: ErrorCategory.VALIDATION });
    });

    it('error message mentions the 10 MB limit', async () => {
      stubFetch({ contentLength: 11 * 1024 * 1024 });
      const err = await resolveCdnCem(
        '@shoelace-style/shoelace',
        '2.15.0',
        'jsdelivr',
        makeConfig(),
      ).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(MCPError);
      expect((err as MCPError).message).toMatch(/10 MB/);
    });

    it('accepts response within 10 MB limit', async () => {
      stubFetch({ body: JSON.stringify(VALID_CEM), contentLength: 1024 });
      const result = await resolveCdnCem(
        '@shoelace-style/shoelace',
        '2.15.0',
        'jsdelivr',
        makeConfig(),
      );
      expect(result.componentCount).toBe(1);
    });

    it('rejects streaming body that exceeds 10 MB without Content-Length', async () => {
      const CHUNK_SIZE = 6 * 1024 * 1024; // 6 MB each, two chunks = 12 MB total
      const chunk = new Uint8Array(CHUNK_SIZE);
      let call = 0;
      const reader = {
        read: vi.fn().mockImplementation(async () => {
          call++;
          if (call === 1) return { done: false, value: chunk };
          if (call === 2) return { done: false, value: chunk };
          return { done: true, value: undefined };
        }),
        cancel: vi.fn().mockResolvedValue(undefined),
        releaseLock: vi.fn(),
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: { get: () => null },
          body: { getReader: () => reader },
          text: vi.fn(),
        }),
      );
      await expect(
        resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', makeConfig()),
      ).rejects.toMatchObject({ category: ErrorCategory.VALIDATION });
    });
  });

  describe('Security: 3xx redirect rejection (redirect: error)', () => {
    it('calls fetch with redirect: error option', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: undefined,
        text: vi.fn().mockResolvedValue(JSON.stringify(VALID_CEM)),
      });
      vi.stubGlobal('fetch', fetchSpy);
      await resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', makeConfig());
      const fetchOptions = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(fetchOptions.redirect).toBe('error');
    });

    it('throws when CDN returns a 3xx redirect (fetch throws TypeError with redirect: error)', async () => {
      // When redirect: 'error' is set and a redirect response is received, fetch throws a TypeError.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch: redirect was not allowed')),
      );
      await expect(
        resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', makeConfig()),
      ).rejects.toThrow(TypeError);
    });

    it('redirect error propagates without being silently swallowed', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('opaqueredirect')));
      const err = await resolveCdnCem(
        '@shoelace-style/shoelace',
        '2.15.0',
        'jsdelivr',
        makeConfig(),
      ).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TypeError);
    });
  });

  describe('Security: error message path stripping', () => {
    it('formatted success message uses relative cache path, not absolute projectRoot', async () => {
      stubFetch({ body: JSON.stringify(VALID_CEM) });
      const config = makeConfig(); // projectRoot: '/tmp/test-project'
      const result = await resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', config);
      // Must not expose the absolute project root in the success message
      expect(result.formatted).not.toContain(config.projectRoot);
      // Should contain a relative path component instead
      expect(result.formatted).toContain('.mcp-wc/cdn-cache');
    });
  });

  describe('Finding #28: CDN edge cases', () => {
    it('propagates fetch abort error when request times out', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
          ),
      );
      await expect(
        resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', makeConfig()),
      ).rejects.toThrow();
    });

    it('returns success without cachePath when writeFileSync fails (disk full)', async () => {
      const { mkdirSync, writeFileSync } = await import('fs');
      vi.mocked(mkdirSync).mockImplementation(() => undefined);
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      stubFetch({ body: JSON.stringify(VALID_CEM) });
      const result = await resolveCdnCem(
        '@shoelace-style/shoelace',
        '2.15.0',
        'jsdelivr',
        makeConfig(),
      );
      expect(result.componentCount).toBe(1);
      expect(result.cachePath).toBeUndefined();
    });

    it('concurrent requests for same package both resolve successfully', async () => {
      stubFetch({ body: JSON.stringify(VALID_CEM) });
      const config = makeConfig();
      const [r1, r2] = await Promise.all([
        resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', config),
        resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', config),
      ]);
      expect(r1.componentCount).toBe(1);
      expect(r2.componentCount).toBe(1);
    });

    it('URL-encodes scoped package names correctly in CDN URL', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: undefined,
        text: vi.fn().mockResolvedValue(JSON.stringify(VALID_CEM)),
      });
      vi.stubGlobal('fetch', fetchSpy);
      await resolveCdnCem('@my-scope/my-pkg', '1.0.0', 'jsdelivr', makeConfig());
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      // The URL should contain the scoped name properly — @ retained, / retained
      expect(calledUrl).toContain('@my-scope/my-pkg');
      expect(calledUrl).toContain('1.0.0');
    });
  });
});
