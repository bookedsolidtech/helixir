import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectThemeSupport } from '../../packages/core/src/handlers/theme-detection.js';
import { MCPError, ErrorCategory } from '../../packages/core/src/shared/error-handling.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// --- helpers ---

function makeConfig(projectRoot: string): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot,
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    cdnAutoloader: null,
    cdnStylesheet: null,
    watch: false,
  };
}

async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'helixir-theme-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, content, 'utf-8');
  }
  return root;
}

const roots: string[] = [];
afterAll(async () => {
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
});

async function project(files: Record<string, string>): Promise<string> {
  const root = await makeProject(files);
  roots.push(root);
  return root;
}

// --- token-based approach (Shoelace-like) ---

describe('detect_theme_support — token-based (Shoelace-like)', () => {
  it('detects token-based approach with class switching', async () => {
    const root = await project({
      'src/themes/light.css': `
        :root, :host, .sl-theme-light {
          color-scheme: light;
          --sl-color-primary-600: hsl(198, 100%, 40%);
          --sl-spacing-medium: 1rem;
          --sl-font-sans: 'Inter', sans-serif;
          --sl-shadow-medium: 0 2px 8px rgba(0,0,0,0.1);
          --sl-border-radius-medium: 4px;
        }
      `,
      'src/themes/dark.css': `
        :host, .sl-theme-dark {
          color-scheme: dark;
          --sl-color-primary-600: hsl(198, 100%, 60%);
          --sl-spacing-medium: 1rem;
        }
      `,
      'src/components/button.ts': `
        class SlButton extends LitElement {
          static styles = css\`
            :host {
              display: inline-block;
              font-family: var(--sl-font-sans);
              color: var(--sl-color-primary-600);
              padding: var(--sl-spacing-medium);
              border-radius: var(--sl-border-radius-medium);
            }
          \`;
        }
      `,
    });

    const result = await detectThemeSupport(makeConfig(root));

    expect(result.themingApproach).toBe('token-based');
    expect(result.darkModeReady).toBe(true);
    expect(result.colorSchemeSet).toBe(true);
    expect(result.tokenCategories).toContain('color');
    expect(result.tokenCategories).toContain('spacing');
    expect(result.tokenCategories).toContain('typography');
    expect(result.tokenCategories).toContain('elevation');
    expect(result.tokenCategories).toContain('border-radius');
    expect(result.themeSwitchingMechanism).toMatch(/theme/i);
  });
});

// --- token-based approach (Material Web-like) ---

describe('detect_theme_support — token-based (Material Web-like)', () => {
  it('detects token-based approach with media query switching', async () => {
    const root = await project({
      'src/tokens.css': `
        :root {
          --md-sys-color-primary: #6750A4;
          --md-sys-color-surface: #FFFBFE;
          --md-sys-typescale-body-large-size: 1rem;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --md-sys-color-primary: #D0BCFF;
            --md-sys-color-surface: #1C1B1F;
          }
        }
      `,
      'src/components/md-button.ts': `
        class MdButton extends LitElement {
          static styles = css\`
            :host {
              background: var(--md-sys-color-primary);
            }
          \`;
        }
      `,
    });

    const result = await detectThemeSupport(makeConfig(root));

    expect(result.themingApproach).toBe('token-based');
    expect(result.darkModeReady).toBe(true);
    expect(result.tokenCategories).toContain('color');
    expect(result.themeSwitchingMechanism).toMatch(/prefers-color-scheme/i);
  });
});

// --- class-based approach ---

describe('detect_theme_support — class-based', () => {
  it('detects class-based approach when theme classes are used without token var()', async () => {
    const root = await project({
      'src/styles/themes.css': `
        .theme-dark .button {
          background: #333;
          color: #fff;
        }
        .theme-dark .card {
          background: #222;
        }
      `,
      'src/components/button.html': `
        <div class="button">Click me</div>
      `,
    });

    const result = await detectThemeSupport(makeConfig(root));

    expect(result.themingApproach).toBe('class-based');
    expect(result.darkModeReady).toBe(true);
  });
});

// --- data-attribute approach ---

describe('detect_theme_support — data-attribute', () => {
  it('detects data-attribute approach', async () => {
    const root = await project({
      'src/styles/theme.css': `
        [data-theme="dark"] {
          background: #000;
          color: #fff;
        }
        [data-theme="light"] {
          background: #fff;
          color: #000;
        }
      `,
    });

    const result = await detectThemeSupport(makeConfig(root));

    expect(result.themingApproach).toBe('data-attribute');
    expect(result.themeSwitchingMechanism).toMatch(/data-theme/i);
  });
});

// --- media-query only approach ---

describe('detect_theme_support — media-query only', () => {
  it('detects media-query approach when no tokens or class selectors exist', async () => {
    const root = await project({
      'src/styles/base.css': `
        body {
          background: white;
          color: black;
        }
        @media (prefers-color-scheme: dark) {
          body {
            background: #111;
            color: #eee;
          }
        }
      `,
    });

    const result = await detectThemeSupport(makeConfig(root));

    expect(result.themingApproach).toBe('media-query');
    expect(result.darkModeReady).toBe(true);
    expect(result.themeSwitchingMechanism).toMatch(/prefers-color-scheme/i);
  });
});

// --- none approach (Lion-like) ---

describe('detect_theme_support — none (Lion-like)', () => {
  it('returns none when no theming patterns are found', async () => {
    const root = await project({
      'src/components/lion-input.ts': `
        class LionInput extends LitElement {
          // unstyled — consumer provides all styles
          render() {
            return html\`<input />\`;
          }
        }
      `,
    });

    const result = await detectThemeSupport(makeConfig(root));

    expect(result.themingApproach).toBe('none');
    expect(result.darkModeReady).toBe(false);
    expect(result.colorSchemeSet).toBe(false);
    expect(result.tokenCategories).toHaveLength(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});

// --- colorSchemeSet ---

describe('detect_theme_support — colorSchemeSet', () => {
  it('sets colorSchemeSet to true when color-scheme property is present', async () => {
    const root = await project({
      'src/tokens.css': `
        :root {
          color-scheme: light dark;
          --color-bg: white;
        }
      `,
    });

    const result = await detectThemeSupport(makeConfig(root));

    expect(result.colorSchemeSet).toBe(true);
  });

  it('sets colorSchemeSet to false when color-scheme property is absent', async () => {
    const root = await project({
      'src/tokens.css': `
        :root {
          --color-bg: white;
        }
      `,
    });

    const result = await detectThemeSupport(makeConfig(root));

    expect(result.colorSchemeSet).toBe(false);
  });
});

// --- recommendations ---

describe('detect_theme_support — recommendations', () => {
  it('recommends adding prefers-color-scheme when missing from a token-based library', async () => {
    const root = await project({
      'src/tokens.css': `
        :root {
          --color-primary: #0070f3;
          --spacing-md: 1rem;
        }
      `,
      'src/button.ts': `
        class Button extends LitElement {
          static styles = css\`:host { color: var(--color-primary); }\`;
        }
      `,
    });

    const result = await detectThemeSupport(makeConfig(root));

    expect(result.recommendations.some((r) => /prefers-color-scheme/i.test(r))).toBe(true);
  });

  it('recommends rem/em units when only px token values are found', async () => {
    const root = await project({
      'src/tokens.css': `
        :root {
          --spacing-sm: 8px;
          --spacing-md: 16px;
          --font-size-base: 16px;
        }
      `,
      'src/button.ts': `
        class Button extends LitElement {
          static styles = css\`:host { padding: var(--spacing-sm); }\`;
        }
      `,
    });

    const result = await detectThemeSupport(makeConfig(root));

    expect(result.recommendations.some((r) => /rem|em/i.test(r))).toBe(true);
  });
});

// --- error handling ---

describe('detect_theme_support — error handling', () => {
  it('throws MCPError with FILESYSTEM category for a non-existent projectRoot', async () => {
    const config = makeConfig('/tmp/does-not-exist-helixir-xyz-12345');
    await expect(detectThemeSupport(config)).rejects.toThrow(MCPError);
    try {
      await detectThemeSupport(config);
    } catch (err) {
      expect(err).toBeInstanceOf(MCPError);
      expect((err as MCPError).category).toBe(ErrorCategory.FILESYSTEM);
    }
  });
});

// --- node_modules skipping ---

describe('detect_theme_support — ignores node_modules and build directories', () => {
  it('skips node_modules when scanning', async () => {
    const root = await project({
      'node_modules/some-lib/dark.css': `
        .sl-theme-dark {
          --color: black;
          color-scheme: dark;
        }
      `,
      'src/empty.ts': `// no theming here`,
    });

    const result = await detectThemeSupport(makeConfig(root));

    // Should NOT be influenced by node_modules files
    expect(result.themingApproach).toBe('none');
    expect(result.colorSchemeSet).toBe(false);
  });
});
