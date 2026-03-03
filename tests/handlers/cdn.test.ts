import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { resolveCdnCem } from '../../src/handlers/cdn.js';
import { getMergedCem, clearCdnCemCache } from '../../src/handlers/cem.js';
import { listAllComponents } from '../../src/handlers/cem.js';
import { MCPError, ErrorCategory } from '../../src/shared/error-handling.js';
import type { McpWcConfig } from '../../src/config.js';
import type { Cem } from '../../src/handlers/cem.js';

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

function stubFetch(opts: { ok?: boolean; status?: number; body?: string }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      text: vi.fn().mockResolvedValue(opts.body ?? JSON.stringify(VALID_CEM)),
    }),
  );
}

beforeEach(() => {
  clearCdnCemCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearCdnCemCache();
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
      text: vi.fn().mockResolvedValue(JSON.stringify(VALID_CEM)),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await resolveCdnCem('@scope/pkg', 'latest', 'unpkg', makeConfig());
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('unpkg.com');
  });

  it('returns libraryId in result', async () => {
    stubFetch({ body: JSON.stringify(VALID_CEM) });
    const result = await resolveCdnCem(
      '@shoelace-style/shoelace',
      '2.15.0',
      'jsdelivr',
      makeConfig(),
    );
    expect(result.libraryId).toBe('shoelace-style-shoelace');
  });

  it('optional cemPath: uses specified path instead of root', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify(VALID_CEM)),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await resolveCdnCem(
      '@scope/pkg',
      'latest',
      'jsdelivr',
      makeConfig(),
      'dist/custom-elements.json',
    );
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('dist/custom-elements.json');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fallback: tries dist/ when root returns 404', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 404, text: vi.fn() });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: vi.fn().mockResolvedValue(JSON.stringify(VALID_CEM)),
        });
      }),
    );
    const result = await resolveCdnCem('@scope/pkg', 'latest', 'jsdelivr', makeConfig());
    expect(result.componentCount).toBe(1);
    expect(callCount).toBe(2);
  });

  it('fallback: throws NETWORK_ERROR when all paths return 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, text: vi.fn() }));
    await expect(
      resolveCdnCem('@scope/pkg', 'latest', 'jsdelivr', makeConfig()),
    ).rejects.toMatchObject({ category: ErrorCategory.NETWORK_ERROR });
  });
});

describe('CDN CEM in-memory cache integration', () => {
  const LOCAL_CEM: Cem = {
    schemaVersion: '1.0.0',
    modules: [
      {
        kind: 'javascript-module',
        path: 'src/my-button.js',
        declarations: [{ kind: 'class', name: 'MyButton', tagName: 'my-button' }],
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

  it('after resolveCdnCem, getMergedCem includes CDN components', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify(VALID_CEM)),
      }),
    );

    await resolveCdnCem('@shoelace-style/shoelace', '2.15.0', 'jsdelivr', makeConfig());

    const merged = getMergedCem(LOCAL_CEM);
    const components = listAllComponents(merged);

    expect(components).toContain('sl-button');
    expect(components).toContain('my-button');
  });

  it('before resolveCdnCem, getMergedCem returns local CEM unchanged', () => {
    const merged = getMergedCem(LOCAL_CEM);
    expect(merged).toBe(LOCAL_CEM);
  });
});
