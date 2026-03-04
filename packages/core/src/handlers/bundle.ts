import type { McpWcConfig } from '../config.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

export interface BundleSizeBreakdown {
  minified: number;
  gzipped: number;
}

export interface BundleSizeEstimates {
  component_only: BundleSizeBreakdown | null;
  full_package: BundleSizeBreakdown | null;
  shared_dependencies: string | null;
}

export interface BundleSizeResult {
  component: string;
  package: string;
  version: string;
  estimates: BundleSizeEstimates;
  source: 'bundlephobia' | 'npm-registry' | 'unavailable';
  cached: boolean;
  note: string;
}

interface CacheEntry {
  result: BundleSizeResult;
  fetchedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_CACHE_SIZE = 500;

// In-memory cache keyed by "<package>@<version>"
const bundleCache = new Map<string, CacheEntry>();

/** Exposed for testing — clears the in-memory cache. */
export function clearBundleCache(): void {
  bundleCache.clear();
}

/** Exposed for testing — returns current cache size. */
export function getBundleCacheSize(): number {
  return bundleCache.size;
}

/**
 * Adds an entry to bundleCache with size-bounded eviction.
 * When the cache exceeds MAX_CACHE_SIZE, the oldest entry (by insertion order) is removed first.
 */
function setBundleCacheEntry(key: string, entry: CacheEntry): void {
  if (!bundleCache.has(key) && bundleCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = bundleCache.keys().next().value;
    if (oldestKey !== undefined) {
      bundleCache.delete(oldestKey);
      process.stderr.write(
        `[wc-tools] bundleCache evicted "${oldestKey}" (cache full at ${MAX_CACHE_SIZE} entries)\n`,
      );
    }
  }
  bundleCache.set(key, entry);
}

interface BundlephobiaResponse {
  gzip: number;
  size: number;
  version: string;
}

interface NpmRegistryResponse {
  'dist-tags'?: { latest?: string };
  dist?: { unpackedSize?: number };
  versions?: Record<string, { dist?: { unpackedSize?: number } }>;
}

/**
 * Derives an npm package name from the configured componentPrefix.
 * Returns null when no mapping can be determined.
 */
function derivePackageFromPrefix(prefix: string): string | null {
  if (!prefix) return null;
  // Common prefix → package mappings for well-known libraries
  const known: Record<string, string> = {
    sl: '@shoelace-style/shoelace',
    'fluent-': '@fluentui/web-components',
    'mwc-': '@material/web',
    'ion-': '@ionic/core',
    'vaadin-': '@vaadin/components',
    'lion-': '@lion/ui',
    'pf-': '@patternfly/elements',
    'carbon-': '@carbon/web-components',
  };
  const lower = prefix.toLowerCase();
  for (const [key, pkg] of Object.entries(known)) {
    if (lower === key || lower.startsWith(key)) return pkg;
  }
  return null;
}

async function fetchBundlephobia(
  pkg: string,
  version: string,
): Promise<{ gzip: number; minified: number; resolvedVersion: string } | null> {
  const encoded = encodeURIComponent(`${pkg}@${version}`);
  const protocol = 'https';
  const host = 'bundlephobia.com';
  const url = `${protocol}://${host}/api/size?package=${encoded}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'error' });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) return null;

  let data: BundlephobiaResponse;
  try {
    const text = await response.text();
    if (text.length > 1_048_576) return null;
    data = JSON.parse(text) as BundlephobiaResponse;
  } catch {
    return null;
  }

  if (typeof data.gzip !== 'number' || typeof data.size !== 'number') return null;

  return { gzip: data.gzip, minified: data.size, resolvedVersion: data.version ?? version };
}

async function fetchNpmRegistrySize(
  pkg: string,
  version: string,
): Promise<{ tarballBytes: number; resolvedVersion: string } | null> {
  const protocol = 'https';
  const host = 'registry.npmjs.org';
  const url = `${protocol}://${host}/${encodeURIComponent(pkg).replace('%40', '@')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'error' });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) return null;

  let data: NpmRegistryResponse;
  try {
    const text = await response.text();
    if (text.length > 1_048_576) return null;
    data = JSON.parse(text) as NpmRegistryResponse;
  } catch {
    return null;
  }

  const resolvedVersion = version === 'latest' ? (data['dist-tags']?.latest ?? 'latest') : version;

  const versionData = data.versions?.[resolvedVersion];
  const unpackedSize = versionData?.dist?.unpackedSize ?? data.dist?.unpackedSize;

  if (typeof unpackedSize !== 'number') return null;

  return { tarballBytes: unpackedSize, resolvedVersion };
}

/**
 * Estimates the bundle size for a given web component tag name.
 *
 * @param tagName - The custom element tag name (e.g. "sl-button")
 * @param config  - Loaded MCP config (used to derive the npm package name)
 * @param packageOverride - Optional explicit npm package name (skips auto-detection)
 * @param version - Package version to query; defaults to "latest"
 */
export async function estimateBundleSize(
  tagName: string,
  config: McpWcConfig,
  packageOverride?: string,
  version = 'latest',
): Promise<BundleSizeResult> {
  // Determine package name
  const pkg = packageOverride ?? derivePackageFromPrefix(config.componentPrefix);
  if (!pkg) {
    throw new MCPError(
      `Cannot determine npm package name for tag <${tagName}>. ` +
        `Set componentPrefix in mcpwc.config.json or provide the package explicitly.`,
      ErrorCategory.VALIDATION,
    );
  }

  const cacheKey = `${pkg}@${version}`;
  const cached = bundleCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ...cached.result, component: tagName, cached: true };
  }

  // Try bundlephobia first
  const bp = await fetchBundlephobia(pkg, version);
  if (bp) {
    const result: BundleSizeResult = {
      component: tagName,
      package: pkg,
      version: bp.resolvedVersion,
      estimates: {
        component_only: null,
        full_package: { minified: bp.minified, gzipped: bp.gzip },
        shared_dependencies:
          'Actual component size depends on tree-shaking and bundler configuration.',
      },
      source: 'bundlephobia',
      cached: false,
      note: 'Sizes are estimates. Actual bundle size depends on your bundler and tree-shaking config.',
    };
    setBundleCacheEntry(cacheKey, { result, fetchedAt: Date.now() });
    return result;
  }

  // Fallback: npm registry tarball size
  const npm = await fetchNpmRegistrySize(pkg, version);
  if (npm) {
    const result: BundleSizeResult = {
      component: tagName,
      package: pkg,
      version: npm.resolvedVersion,
      estimates: {
        component_only: null,
        full_package: {
          // Tarball unpackedSize is uncompressed; estimate gzip as ~30% of unpacked
          minified: npm.tarballBytes,
          gzipped: Math.round(npm.tarballBytes * 0.3),
        },
        shared_dependencies: null,
      },
      source: 'npm-registry',
      cached: false,
      note: 'Sizes derived from npm registry tarball. Install size — not minified bundle size. Actual bundle size will differ.',
    };
    setBundleCacheEntry(cacheKey, { result, fetchedAt: Date.now() });
    return result;
  }

  // Both sources unavailable
  const result: BundleSizeResult = {
    component: tagName,
    package: pkg,
    version,
    estimates: {
      component_only: null,
      full_package: null,
      shared_dependencies: null,
    },
    source: 'unavailable',
    cached: false,
    note: 'Bundle size data is currently unavailable. bundlephobia and npm registry could not be reached.',
  };
  return result;
}
