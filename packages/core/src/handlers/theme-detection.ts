import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

import type { McpWcConfig } from '../config.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

export type ThemingApproach =
  | 'token-based'
  | 'class-based'
  | 'data-attribute'
  | 'media-query'
  | 'none';

export interface ThemeDetectionResult {
  themingApproach: ThemingApproach;
  darkModeReady: boolean;
  colorSchemeSet: boolean;
  tokenCategories: string[];
  themeSwitchingMechanism: string;
  recommendations: string[];
}

const SCANNABLE_EXTENSIONS = new Set(['.css', '.ts', '.js', '.html', '.scss', '.less']);
const MAX_FILE_SIZE = 512_000; // 512KB — skip unusually large files

const SKIP_SEGMENT_RE = /(?:^|[/\\])(?:node_modules|\.git|build|dist|coverage|\.cache)(?:[/\\]|$)/;

const PREFERS_COLOR_SCHEME_RE = /prefers-color-scheme/;
const COLOR_SCHEME_PROP_RE = /color-scheme\s*:/;
const DATA_THEME_RE = /\[data-theme/;
const THEME_CLASS_RE =
  /\.(?:[\w-]*theme-dark[\w-]*|[\w-]*dark-theme[\w-]*|sl-theme-dark|md-theme-dark|theme-dark|dark-mode)/;
const THEME_SELECTOR_RE =
  /\.(?:sl-theme-|md-theme-|fluent-theme-|theme-|is-dark|is-light|dark|light)/;
const VAR_USAGE_RE = /var\(--[\w-]+/;
const CSS_CUSTOM_PROP_DEF_RE = /--[\w-]+\s*:/g;
const THEME_FILE_RE = /(?:light|dark|theme)\.(?:css|scss|less)$/i;
const RELATIVE_VALUE_RE = /--[\w-]+\s*:\s*[^;{]*?[\d.]+(?:rem|em)\b/;
const ABSOLUTE_VALUE_RE = /--[\w-]+\s*:\s*[^;{]*?[\d.]+px\b/;

const TOKEN_CATEGORY_PATTERNS: ReadonlyArray<{ category: string; pattern: RegExp }> = [
  { category: 'color', pattern: /--[\w-]+color[\w-]*/i },
  { category: 'spacing', pattern: /--[\w-]+(?:space|spacing|gap|padding|margin)[\w-]*/i },
  { category: 'typography', pattern: /--[\w-]+(?:font|text|type|letter|line-height)[\w-]*/i },
  { category: 'elevation', pattern: /--[\w-]+(?:shadow|elevation|z-index)[\w-]*/i },
  { category: 'border-radius', pattern: /--[\w-]+(?:radius|rounded)[\w-]*/i },
];

/** Collects all scannable files under `root`, skipping ignored directories. */
async function collectFiles(root: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = (await readdir(root, { recursive: true })) as string[];
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new MCPError(`projectRoot not found: ${root}`, ErrorCategory.FILESYSTEM);
    }
    throw err;
  }

  const files: string[] = [];
  for (const rel of entries) {
    if (SKIP_SEGMENT_RE.test(rel)) continue;
    if (!SCANNABLE_EXTENSIONS.has(extname(rel))) continue;
    files.push(join(root, rel));
  }
  return files;
}

/** Reads a file, returning empty string if the file is too large. */
async function safeReadFile(filePath: string): Promise<string> {
  try {
    const info = await stat(filePath);
    if (info.size > MAX_FILE_SIZE) return '';
    return await readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

interface ScanAccumulator {
  hasVarUsage: boolean;
  hasPrefersDark: boolean;
  hasColorScheme: boolean;
  hasDataTheme: boolean;
  hasThemeClass: boolean;
  hasThemeSelector: boolean;
  hasThemeFile: boolean;
  tokenPropNames: string[];
  hasRelativeUnits: boolean;
  hasAbsoluteUnits: boolean;
}

function analyseContent(content: string, filePath: string, acc: ScanAccumulator): void {
  if (THEME_FILE_RE.test(basename(filePath))) acc.hasThemeFile = true;
  if (VAR_USAGE_RE.test(content)) acc.hasVarUsage = true;
  if (PREFERS_COLOR_SCHEME_RE.test(content)) acc.hasPrefersDark = true;
  if (COLOR_SCHEME_PROP_RE.test(content)) acc.hasColorScheme = true;
  if (DATA_THEME_RE.test(content)) acc.hasDataTheme = true;
  if (THEME_CLASS_RE.test(content)) acc.hasThemeClass = true;
  if (THEME_SELECTOR_RE.test(content)) acc.hasThemeSelector = true;
  if (RELATIVE_VALUE_RE.test(content)) acc.hasRelativeUnits = true;
  if (ABSOLUTE_VALUE_RE.test(content)) acc.hasAbsoluteUnits = true;

  const matches = content.match(CSS_CUSTOM_PROP_DEF_RE);
  if (matches) {
    for (const m of matches) {
      acc.tokenPropNames.push(m.replace(/\s*:$/, ''));
    }
  }
}

function detectCategories(propNames: string[]): string[] {
  const found = new Set<string>();
  for (const name of propNames) {
    for (const { category, pattern } of TOKEN_CATEGORY_PATTERNS) {
      if (pattern.test(name)) {
        found.add(category);
        break;
      }
    }
  }
  return Array.from(found).sort();
}

function determineApproach(acc: ScanAccumulator): ThemingApproach {
  // Token-based: explicit var() usage with custom property definitions
  if (acc.hasVarUsage && acc.tokenPropNames.length > 0) return 'token-based';
  // Data-attribute: [data-theme] selectors (more specific than class-based)
  if (acc.hasDataTheme) return 'data-attribute';
  // Class-based: theme class selectors or dedicated theme files
  if (acc.hasThemeClass || acc.hasThemeSelector || acc.hasThemeFile) return 'class-based';
  // Media-query only: prefers-color-scheme but no other mechanism
  if (acc.hasPrefersDark) return 'media-query';
  return 'none';
}

function describeSwitchingMechanism(acc: ScanAccumulator, approach: ThemingApproach): string {
  if (approach === 'none') return 'No theme switching mechanism detected.';

  const parts: string[] = [];

  if (acc.hasDataTheme) parts.push('Set `data-theme` attribute on a container element.');
  if (acc.hasThemeClass || acc.hasThemeFile) {
    parts.push(
      'Toggle a theme class (e.g. `.theme-dark`, `.sl-theme-dark`) on `<html>` or a container element.',
    );
  }
  if (acc.hasPrefersDark) {
    parts.push(
      'Respects `prefers-color-scheme` OS setting automatically via `@media (prefers-color-scheme: dark)`.',
    );
  }
  if (acc.hasColorScheme) {
    parts.push('Sets `color-scheme` CSS property to coordinate native browser UI.');
  }
  if (approach === 'token-based' && parts.length === 0) {
    parts.push(
      'Override CSS custom properties on a container element or `:root` to switch themes.',
    );
  }

  return parts.join(' ');
}

function buildRecommendations(acc: ScanAccumulator, approach: ThemingApproach): string[] {
  const recs: string[] = [];

  if (approach === 'none') {
    recs.push(
      'Introduce CSS custom properties for colors, spacing, and typography to enable theming.',
    );
    recs.push('Add a `prefers-color-scheme` media query or theme class to support dark mode.');
    return recs;
  }

  if (!acc.hasPrefersDark) {
    recs.push(
      'Add `@media (prefers-color-scheme: dark)` to respect system dark mode preference automatically.',
    );
  }
  if (!acc.hasColorScheme) {
    recs.push(
      'Set `color-scheme: light dark` (or `light` / `dark`) on `:root` or `:host` to align native browser controls.',
    );
  }
  if (acc.hasAbsoluteUnits && !acc.hasRelativeUnits) {
    recs.push(
      'Replace `px` token values with `rem`/`em` to support user font-size preferences and better scaling.',
    );
  }
  if (approach === 'class-based' && acc.tokenPropNames.length === 0) {
    recs.push(
      'Migrate from class-based theming to CSS custom property tokens for finer-grained consumer customization.',
    );
  }
  if (
    approach === 'token-based' &&
    !acc.hasThemeClass &&
    !acc.hasDataTheme &&
    !acc.hasPrefersDark
  ) {
    recs.push(
      'Define a theme-switching mechanism (class, data-attribute, or media query) in addition to your token system.',
    );
  }

  return recs;
}

/**
 * Scans the component library at `config.projectRoot` and returns a summary
 * of its theming capabilities.
 */
export async function detectThemeSupport(config: McpWcConfig): Promise<ThemeDetectionResult> {
  const root = config.projectRoot;

  const files = await collectFiles(root);

  const acc: ScanAccumulator = {
    hasVarUsage: false,
    hasPrefersDark: false,
    hasColorScheme: false,
    hasDataTheme: false,
    hasThemeClass: false,
    hasThemeSelector: false,
    hasThemeFile: false,
    tokenPropNames: [],
    hasRelativeUnits: false,
    hasAbsoluteUnits: false,
  };

  for (const filePath of files) {
    const content = await safeReadFile(filePath);
    if (content) analyseContent(content, filePath, acc);
  }

  const themingApproach = determineApproach(acc);
  const darkModeReady =
    acc.hasPrefersDark || acc.hasThemeClass || acc.hasDataTheme || acc.hasThemeFile;
  const tokenCategories = detectCategories(acc.tokenPropNames);
  const themeSwitchingMechanism = describeSwitchingMechanism(acc, themingApproach);
  const recommendations = buildRecommendations(acc, themingApproach);

  return {
    themingApproach,
    darkModeReady,
    colorSchemeSet: acc.hasColorScheme,
    tokenCategories,
    themeSwitchingMechanism,
    recommendations,
  };
}
