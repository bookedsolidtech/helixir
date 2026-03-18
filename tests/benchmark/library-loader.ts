/**
 * Library Loader — loads custom-elements.json from wc-libraries and helix,
 * parses them via Zod CemSchema, and extracts component declarations.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CemSchema } from '../../packages/core/src/handlers/cem.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const WC_LIBRARIES_ROOT = '/Volumes/Development/booked/wc-libraries';
const HELIX_CEM_PATH =
  '/Volumes/Development/booked/helix/packages/hx-library/custom-elements.json';

export const LIBRARY_NAMES = [
  'material',
  'spectrum',
  'vaadin',
  'fluentui',
  'carbon',
  'ui5',
  'calcite',
  'porsche',
  'ionic',
  'wired',
  'elix',
] as const;

export type LibraryName = (typeof LIBRARY_NAMES)[number] | 'helix';

export interface LibraryEntry {
  name: LibraryName;
  cemPath: string;
  prefix: string;
}

export interface LoadedLibrary {
  name: LibraryName;
  cem: ReturnType<typeof CemSchema.parse>;
  declarations: ReturnType<typeof CemSchema.parse>['modules'][number]['declarations'];
  componentCount: number;
  config: McpWcConfig;
  error?: undefined;
}

export interface FailedLibrary {
  name: LibraryName;
  error: string;
}

export type LibraryResult = LoadedLibrary | FailedLibrary;

// ─── Prefix Map ─────────────────────────────────────────────────────────────

const PREFIX_MAP: Record<LibraryName, string> = {
  material: 'md-',
  spectrum: 'sp-',
  vaadin: 'vaadin-',
  fluentui: 'fluent-',
  carbon: 'cds-',
  ui5: 'ui5-',
  calcite: 'calcite-',
  porsche: 'p-',
  ionic: 'ion-',
  wired: 'wired-',
  elix: 'elix-',
  helix: 'hx-',
};

// ─── Library Registry ───────────────────────────────────────────────────────

function getLibraryEntries(): LibraryEntry[] {
  const entries: LibraryEntry[] = LIBRARY_NAMES.map((name) => ({
    name,
    cemPath: resolve(WC_LIBRARIES_ROOT, name, 'custom-elements.json'),
    prefix: PREFIX_MAP[name],
  }));

  entries.push({
    name: 'helix',
    cemPath: HELIX_CEM_PATH,
    prefix: PREFIX_MAP.helix,
  });

  return entries;
}

// ─── Loader Functions ───────────────────────────────────────────────────────

function makeLibraryConfig(entry: LibraryEntry): McpWcConfig {
  return {
    cemPath: entry.cemPath,
    projectRoot: entry.cemPath.replace('/custom-elements.json', ''),
    componentPrefix: entry.prefix,
    healthHistoryDir: '.health-history',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

export function loadLibrary(entry: LibraryEntry): LibraryResult {
  try {
    const raw = readFileSync(entry.cemPath, 'utf-8');
    const json = JSON.parse(raw);
    const cem = CemSchema.parse(json);

    const allDeclarations = cem.modules.flatMap((m) => m.declarations ?? []);
    const componentDeclarations = allDeclarations.filter((d) => d.tagName !== undefined);

    return {
      name: entry.name,
      cem,
      declarations: componentDeclarations,
      componentCount: componentDeclarations.length,
      config: makeLibraryConfig(entry),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: entry.name,
      error: `Failed to load ${entry.name}: ${message}`,
    };
  }
}

export function loadAllLibraries(): {
  loaded: LoadedLibrary[];
  failed: FailedLibrary[];
} {
  const entries = getLibraryEntries();
  const results = entries.map(loadLibrary);

  const loaded: LoadedLibrary[] = [];
  const failed: FailedLibrary[] = [];

  for (const r of results) {
    if ('error' in r && r.error !== undefined) {
      failed.push(r as FailedLibrary);
    } else {
      loaded.push(r as LoadedLibrary);
    }
  }

  return { loaded, failed };
}

export function isLoadedLibrary(result: LibraryResult): result is LoadedLibrary {
  return !('error' in result && result.error !== undefined);
}

export { getLibraryEntries };
