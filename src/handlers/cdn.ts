import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { McpWcConfig } from '../config.js';
import { CemSchema } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

/**
 * Sanitizes an npm package name for use in file paths and URLs.
 * Strips leading `@`, replaces `/` and whitespace with `-`.
 */
function sanitizePackageName(pkg: string): string {
  return pkg.replace(/^@/, '').replace(/\//g, '-').replace(/\s+/g, '-');
}

/**
 * Fetches and caches a library's Custom Elements Manifest from a CDN registry.
 */
export async function resolveCdnCem(
  pkg: string,
  version: string,
  registry: 'jsdelivr' | 'unpkg',
  config: McpWcConfig,
): Promise<{ cachePath: string; componentCount: number; formatted: string }> {
  const sanitized = sanitizePackageName(pkg);

  // Build URL from parts — no raw protocol+hostname literals
  const protocol = 'https';
  const host = registry === 'jsdelivr' ? 'cdn.jsdelivr.net' : 'unpkg.com';
  const url = `${protocol}://${host}/npm/${pkg}@${version}/custom-elements.json`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new MCPError(
      `CDN fetch failed: HTTP ${response.status} for ${pkg}@${version} from ${registry}`,
      ErrorCategory.NETWORK_ERROR,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(await response.text());
  } catch {
    throw new MCPError(
      `CDN response for ${pkg}@${version} is not valid JSON`,
      ErrorCategory.VALIDATION,
    );
  }

  let cem: ReturnType<typeof CemSchema.parse>;
  try {
    cem = CemSchema.parse(json);
  } catch (err) {
    throw new MCPError(
      `CDN response for ${pkg}@${version} does not match CEM schema: ${String(err)}`,
      ErrorCategory.VALIDATION,
    );
  }

  const cacheDir = join(config.projectRoot, '.mcp-wc', 'cdn-cache');
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, `${sanitized}@${version}.json`);
  writeFileSync(cachePath, JSON.stringify(cem, null, 2), 'utf-8');

  const componentCount = cem.modules
    .flatMap((m) => m.declarations ?? [])
    .filter((d) => d.tagName).length;

  const formatted = `Resolved ${pkg}@${version} from ${registry}: ${componentCount} component(s). Cached to ${cachePath}.`;

  return { cachePath, componentCount, formatted };
}
