import { describe, it, expect, vi, afterEach } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { generateMigrationGuide } from '../../packages/core/src/handlers/migration.js';
import { CemSchema } from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';
import { GitOperations } from '../../packages/core/src/shared/git.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

vi.mock('../../packages/core/src/shared/git.js', () => ({
  GitOperations: vi.fn(),
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

// Load fixture CEMs
const CEM_V1: Cem = CemSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'cem-v1.json'), 'utf-8')),
);

const CEM_V2: Cem = CemSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'cem-v2.json'), 'utf-8')),
);

function makeConfig(): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: FIXTURES_DIR,
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

function mockGitShow(returnValue: () => Promise<string>) {
  vi.mocked(GitOperations).mockImplementation(
    (function(this: any) {
      this.gitShow = async (_ref: string, _filePath: string) => returnValue();
    }) as any,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// generateMigrationGuide
// ---------------------------------------------------------------------------

describe('generateMigrationGuide', () => {
  it('returns isNew: true when component did not exist on base branch', async () => {
    const emptyCem = { schemaVersion: '1.0.0', modules: [] };
    mockGitShow(async () => JSON.stringify(emptyCem));

    const guide = await generateMigrationGuide('my-button', 'main', makeConfig(), CEM_V2);

    expect(guide.isNew).toBe(true);
    expect(guide.tagName).toBe('my-button');
    expect(guide.baseBranch).toBe('main');
    expect(guide.markdown).toContain('new');
  });

  it('returns isNew: false and lists no changes when base and current are identical', async () => {
    mockGitShow(async () => JSON.stringify(CEM_V2));

    const guide = await generateMigrationGuide('my-button', 'main', makeConfig(), CEM_V2);

    expect(guide.isNew).toBe(false);
    expect(guide.markdown).toContain('No changes detected');
  });

  it('mentions removed property in the migration guide', async () => {
    // v1 has "type" property, v2 does not — so "type" is a breaking removal
    mockGitShow(async () => JSON.stringify(CEM_V1));

    const guide = await generateMigrationGuide('my-button', 'main', makeConfig(), CEM_V2);

    expect(guide.isNew).toBe(false);
    expect(guide.markdown).toContain('type');
    expect(guide.markdown.toLowerCase()).toContain('removed');
  });

  it('mentions type-changed property in the migration guide', async () => {
    // v1 has size: "'sm' | 'md'", v2 has size: "'small' | 'medium' | 'large'"
    mockGitShow(async () => JSON.stringify(CEM_V1));

    const guide = await generateMigrationGuide('my-button', 'main', makeConfig(), CEM_V2);

    expect(guide.markdown).toContain('size');
    expect(guide.markdown.toLowerCase()).toContain('type');
  });

  it('mentions removed event in the migration guide', async () => {
    // v1 has "my-legacy-event", v2 does not
    mockGitShow(async () => JSON.stringify(CEM_V1));

    const guide = await generateMigrationGuide('my-button', 'main', makeConfig(), CEM_V2);

    expect(guide.markdown).toContain('my-legacy-event');
    expect(guide.markdown.toLowerCase()).toContain('removed');
  });

  it('lists non-breaking additions', async () => {
    // v2 has "variant" property not present in v1 — this is an addition
    mockGitShow(async () => JSON.stringify(CEM_V1));

    const guide = await generateMigrationGuide('my-button', 'main', makeConfig(), CEM_V2);

    expect(guide.markdown).toContain('Non-Breaking Additions');
    expect(guide.markdown).toContain('variant');
  });

  it('includes a top-level heading with the tag name', async () => {
    mockGitShow(async () => JSON.stringify(CEM_V1));

    const guide = await generateMigrationGuide('my-button', 'main', makeConfig(), CEM_V2);

    expect(guide.markdown).toContain('# Migration Guide');
    expect(guide.markdown).toContain('my-button');
  });

  it('includes a Breaking Changes section heading', async () => {
    mockGitShow(async () => JSON.stringify(CEM_V1));

    const guide = await generateMigrationGuide('my-button', 'main', makeConfig(), CEM_V2);

    expect(guide.markdown).toContain('## Breaking Changes');
  });

  it('returns isNew: true when git show throws (missing base CEM)', async () => {
    mockGitShow(async () => {
      throw new Error('git show failed');
    });

    const guide = await generateMigrationGuide('my-button', 'main', makeConfig(), CEM_V2);

    expect(guide.isNew).toBe(true);
  });
});
