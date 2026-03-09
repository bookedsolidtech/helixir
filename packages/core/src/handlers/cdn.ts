import { mkdirSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import type { McpWcConfig } from '../config.js';
import { CemSchema, loadCdnCem } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

/**
 * Valid npm package name regex per the npm naming rules:
 * - Scoped: @scope/name where scope and name are [a-z0-9._-]
 * - Unscoped: [a-z0-9][a-z0-9._-]*
 * Null bytes, newlines, and filesystem-invalid characters are excluded.
 */
const NPM_PACKAGE_NAME_REGEX = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9._-]*$/;

/**
 * Strict semver regex: digits.digits.digits with optional pre-release and build metadata.
 * The special tag "latest" is also accepted.
 */
const STRICT_SEMVER_REGEX = /^(?:latest|\d+\.\d+\.\d+(?:-[a-zA-Z0-9._-]+)?(?:\+[a-zA-Z0-9._-]+)?)$/;

/**
 * Validates and sanitizes an npm package name.
 * Rejects null bytes, newlines, and anything not matching the npm naming spec.
 */
function validatePackageName(pkg: string): string {
  if (!NPM_PACKAGE_NAME_REGEX.test(pkg)) {
    throw new MCPError(
      `Invalid npm package name: "${pkg}". Must follow npm naming rules.`,
      ErrorCategory.VALIDATION,
    );
  }
  return pkg;
}

/**
 * Sanitizes an npm package name for use in file paths and URLs.
 * Strips leading `@`, replaces `/` and whitespace with `-`.
 */
function sanitizePackageName(pkg: string): string {
  return pkg.replace(/^@/, '').replace(/\//g, '-').replace(/\s+/g, '-');
}

/**
 * Validates a version string for use in file paths and CDN URLs.
 * If not "latest", enforces strict semver format to prevent path traversal and URL manipulation.
 */
function sanitizeVersion(version: string): string {
  if (!STRICT_SEMVER_REGEX.test(version)) {
    throw new MCPError(
      `Invalid version string: "${version}". Must be "latest" or a valid semver (e.g. 1.2.3, 1.2.3-beta.1).`,
      ErrorCategory.VALIDATION,
    );
  }
  return version;
}

/**
 * Fetches and caches a library's Custom Elements Manifest from a CDN registry.
 * Tries the provided cemPath (or default root path), then falls back to
 * dist/custom-elements.json and lib/custom-elements.json before failing.
 * @param cemPath - Optional explicit path within the package. If omitted, auto-discovers.
 * @param register - When true, registers the fetched CEM into the multi-CEM store.
 *                   Defaults to false so a preview fetch does not permanently mutate server state.
 */
export async function resolveCdnCem(
  pkg: string,
  version: string,
  registry: 'jsdelivr' | 'unpkg',
  config: McpWcConfig,
  register = false,
  cemPath?: string,
): Promise<{
  cachePath?: string;
  componentCount: number;
  formatted: string;
  registered: boolean;
  libraryId: string;
}> {
  validatePackageName(pkg);
  const sanitized = sanitizePackageName(pkg);
  const safeVersion = sanitizeVersion(version);

  // Build base URL using percent-encoded package name and version to prevent URL injection.
  const protocol = 'https';
  const host = registry === 'jsdelivr' ? 'cdn.jsdelivr.net' : 'unpkg.com';
  const expectedPrefix =
    registry === 'jsdelivr' ? `${protocol}://${host}/npm/` : `${protocol}://${host}/`;
  const encodedPkg = encodeURIComponent(pkg).replace('%40', '@').replace('%2F', '/');
  const baseUrl = `${expectedPrefix}${encodedPkg}@${encodeURIComponent(safeVersion)}`;

  // Paths to try in order. If cemPath is provided, only try that path.
  const pathsToTry = cemPath
    ? [cemPath]
    : ['custom-elements.json', 'dist/custom-elements.json', 'lib/custom-elements.json'];

  let response: Response | null = null;
  let lastStatus = 0;

  for (const path of pathsToTry) {
    const url = `${baseUrl}/${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal, redirect: 'error' });
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      response = res;
      break;
    }
    lastStatus = res.status;
  }

  if (!response) {
    throw new MCPError(
      `CDN fetch failed: no CEM found for ${pkg}@${version} from ${registry} (last HTTP ${lastStatus}). Tried: ${pathsToTry.join(', ')}`,
      ErrorCategory.NETWORK_ERROR,
    );
  }

  // Narrow response to Response type (no longer null)
  const safeResponse: Response = response;

  const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB

  // Reject before reading if Content-Length header advertises an oversized body.
  const contentLengthHeader = safeResponse.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const declared = parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      throw new MCPError(
        `CDN response for ${pkg}@${version} exceeds the 10 MB size limit (Content-Length: ${declared} bytes). Refusing to read.`,
        ErrorCategory.VALIDATION,
      );
    }
  }

  // Stream body with a running byte counter; abort and reject if limit is exceeded.
  let rawBody: string;
  if (safeResponse.body) {
    const reader = safeResponse.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new MCPError(
            `CDN response for ${pkg}@${version} exceeds the 10 MB size limit. Refusing to read.`,
            ErrorCategory.VALIDATION,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    // Merge chunks into a single buffer for decoding.
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    rawBody = new TextDecoder().decode(merged);
  } else {
    // Fallback for environments without streaming support (e.g. test mocks).
    rawBody = await safeResponse.text();
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
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
  // Use safeVersion (validated, no path separators) to prevent cache path traversal.
  const cachePath = join(cacheDir, `${sanitized}@${safeVersion}.json`);

  let cacheWritten = false;
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(cem, null, 2), 'utf-8');
    cacheWritten = true;
  } catch (err) {
    process.stderr.write(`[wc-tools] CDN cache write failed (non-fatal): ${String(err)}\n`);
  }

  const componentCount = cem.modules
    .flatMap((m) => m.declarations ?? [])
    .filter((d) => d.tagName).length;

  const libraryId = sanitized;

  // Load into in-memory CDN CEM registry when register=true.
  if (register) {
    loadCdnCem(libraryId, cem);
  }

  const formatted = cacheWritten
    ? `Resolved ${pkg}@${version} from ${registry}: ${componentCount} component(s). Library ID: "${libraryId}". Cached to ${relative(config.projectRoot, cachePath)}.`
    : `Resolved ${pkg}@${version} from ${registry}: ${componentCount} component(s). Library ID: "${libraryId}".`;

  return cacheWritten
    ? { cachePath, componentCount, formatted, registered: register, libraryId }
    : { componentCount, formatted, registered: register, libraryId };
}
