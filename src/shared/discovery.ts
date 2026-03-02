import { existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const STATIC_CANDIDATES = [
  'custom-elements.json',
  'dist/custom-elements.json',
  'src/custom-elements.json',
  'node_modules/@shoelace-style/shoelace/dist/custom-elements.json',
];

const GLOB_PATTERNS = [
  'packages/*/custom-elements.json',
  'node_modules/@spectrum-web-components/*/custom-elements.json',
  'node_modules/@microsoft/fast-*/custom-elements.json',
];

function expandGlobPattern(projectRoot: string, pattern: string): string[] {
  const parts = pattern.split('/');
  const wildcardIdx = parts.findIndex((p) => p === '*');
  if (wildcardIdx === -1) return [];

  const prefix = parts.slice(0, wildcardIdx).join('/');
  const suffix = parts.slice(wildcardIdx + 1).join('/');
  const prefixDir = resolve(projectRoot, prefix);

  if (!existsSync(prefixDir)) return [];

  try {
    const entries = readdirSync(prefixDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => join(prefix, e.name, suffix))
      .filter((p) => existsSync(resolve(projectRoot, p)));
  } catch {
    return [];
  }
}

export function discoverCemPath(projectRoot: string): string | null {
  const found: string[] = [];

  for (const candidate of STATIC_CANDIDATES) {
    if (existsSync(resolve(projectRoot, candidate))) {
      found.push(candidate);
    }
  }

  for (const pattern of GLOB_PATTERNS) {
    found.push(...expandGlobPattern(projectRoot, pattern));
  }

  if (found.length === 0) {
    return null;
  }

  if (found.length > 1) {
    process.stderr.write(
      `[wc-tools] Warning: Multiple custom-elements.json files found. Using first: ${found[0]}\n` +
        `  Candidates: ${found.join(', ')}\n` +
        `  Set cemPath in mcpwc.config.json to suppress this warning.\n`,
    );
  }

  return found[0] ?? null;
}

/**
 * Resolves an array of CEM path patterns (which may contain `*` wildcards) to
 * concrete relative paths that exist on disk, relative to `projectRoot`.
 * Static paths are returned as-is if they exist; glob patterns are expanded.
 */
export function resolveGlobCemPaths(patterns: string[], projectRoot: string): string[] {
  const result: string[] = [];
  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      result.push(...expandGlobPattern(projectRoot, pattern));
    } else if (existsSync(resolve(projectRoot, pattern))) {
      result.push(pattern);
    }
  }
  return result;
}

export const FRIENDLY_CEM_ERROR =
  `Error: No custom-elements.json found.\n` +
  `Tried: custom-elements.json, dist/custom-elements.json, src/custom-elements.json\n\n` +
  `Generate one with:\n` +
  `  Lit:      npx @custom-elements-manifest/analyzer analyze\n` +
  `  Stencil:  stencil build (set outputTargets type: 'docs-custom-elements-manifest')\n` +
  `  Shoelace: npm install @shoelace-style/shoelace (CEM included in package)\n\n` +
  `Or set cemPath in mcpwc.config.json to point to your manifest.\n`;
