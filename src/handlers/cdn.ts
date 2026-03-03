import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { McpWcConfig } from '../config.js';
import { CemSchema } from './cem.js';
import { loadCdnCem } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

/**
 * Sanitizes an npm package name for use in file paths and URLs.
 * Strips leading `@`, replaces `/` and whitespace with `-`.
 */
function sanitizePackageName(pkg: string): string {
  return pkg.replace(/^@/, '').replace(/\//g, '-').replace(/\s+/g, '-');
}

/**
 * Sanitizes a version string for use in file paths and CDN URLs.
 * Allows semver characters (digits, dots, hyphens, plus, tilde, caret, alphanumeric)
 * and "latest". Rejects anything else to prevent path traversal and URL manipulation.
 */
function sanitizeVersion(version: string): string {
  if (!/^[a-zA-Z0-9._\-+~^]+$/.test(version)) {
    throw new MCPError(
      `Invalid version string: "${version}". Only semver-compatible characters are allowed.`,
      ErrorCategory.VALIDATION,
    );
  }
  return version;
}

/**
 * Fetches and caches a library's Custom Elements Manifest from a CDN registry.
 * Tries the provided cemPath (or default root path), then falls back to
 * dist/custom-elements.json and lib/custom-elements.json before failing.
 * On success, loads the CEM into the in-memory CDN cache so subsequent tool
 * calls can reference the resolved library.
 */
export async function resolveCdnCem(
  pkg: string,
  version: string,
  registry: 'jsdelivr' | 'unpkg',
  config: McpWcConfig,
  cemPath?: string,
): Promise<{ cachePath: string; componentCount: number; formatted: string; libraryId: string }> {
  const sanitized = sanitizePackageName(pkg);
  const safeVersion = sanitizeVersion(version);

  // Build base URL using percent-encoded package name and version to prevent URL injection.
  const protocol = 'https';
  const host = registry === 'jsdelivr' ? 'cdn.jsdelivr.net' : 'unpkg.com';
  const encodedPkg = encodeURIComponent(pkg).replace('%40', '@').replace('%2F', '/');
  const baseUrl = `${protocol}://${host}/npm/${encodedPkg}@${encodeURIComponent(safeVersion)}`;

  // Paths to try in order. If cemPath is provided, only try that path.
  const pathsToTry = cemPath
    ? [cemPath]
    : ['custom-elements.json', 'dist/custom-elements.json', 'lib/custom-elements.json'];

  let successResponse: Response | null = null;

  for (const path of pathsToTry) {
    const url = `${baseUrl}/${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      successResponse = res;
      break;
    }
  }

  if (!successResponse) {
    throw new MCPError(
      `CDN fetch failed: no CEM found for ${pkg}@${version} from ${registry}. Tried: ${pathsToTry.join(', ')}`,
      ErrorCategory.NETWORK_ERROR,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(await successResponse.text());
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
  // Use safeVersion (validated, no path separators) to prevent cache path traversal.
  const cachePath = join(cacheDir, `${sanitized}@${safeVersion}.json`);
  writeFileSync(cachePath, JSON.stringify(cem, null, 2), 'utf-8');

  // Load into in-memory CDN CEM registry so subsequent tool calls can use this library.
  loadCdnCem(sanitized, cem);

  const componentCount = cem.modules
    .flatMap((m) => m.declarations ?? [])
    .filter((d) => d.tagName).length;

  const libraryId = sanitized;
  const formatted = `Resolved ${pkg}@${version} from ${registry}: ${componentCount} component(s). Library ID: "${libraryId}". Cached to ${cachePath}.`;

  return { cachePath, componentCount, formatted, libraryId };
}
