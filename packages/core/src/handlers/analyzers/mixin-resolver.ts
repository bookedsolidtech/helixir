/**
 * Mixin & Inheritance Chain Resolver — follows CEM superclass/mixin declarations
 * to read the FULL source chain of a component, not just its leaf file.
 *
 * This solves the fundamental blind spot in single-file scanning: libraries like
 * Lion and Vaadin implement accessibility patterns in shared mixins and base classes,
 * not in each component file. Without following the chain, the scanner misses 80%+
 * of actual a11y engineering.
 *
 * Resolution strategy:
 *   1. CEM `declaration.mixins[].module` — relative path within the repo
 *   2. CEM `declaration.mixins[].package` — npm package path, resolved to node_modules
 *      or sibling packages in a monorepo
 *   3. CEM `declaration.superclass.module`/`.package` — same resolution
 *   4. Source file `import` statement following — regex-based import extraction
 *
 * Zero new dependencies. Works with any monorepo structure.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { existsSync } from 'node:fs';
import type { CemDeclaration } from '../cem.js';
import { getInheritanceChain } from '../cem.js';
import type { SourceA11yMarkers } from './source-accessibility.js';
import { scanSourceForA11yPatterns } from './source-accessibility.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedSource {
  /** Name of the class/mixin */
  name: string;
  /** Where this source came from in the chain */
  type: 'component' | 'superclass' | 'mixin' | 'import';
  /** Absolute file path that was read */
  filePath: string;
  /** Raw source content */
  content: string;
  /** Patterns detected in this specific file */
  markers: SourceA11yMarkers;
}

export interface InheritanceChainResult {
  /** All resolved source files in the chain */
  sources: ResolvedSource[];
  /** Aggregated markers across ALL files in the chain */
  aggregatedMarkers: SourceA11yMarkers;
  /** Number of files in the chain that were successfully resolved */
  resolvedCount: number;
  /** Names of mixins/superclasses that could NOT be resolved */
  unresolved: string[];
  /** Architecture classification based on the chain shape */
  architecture: 'inline' | 'mixin-heavy' | 'controller-based' | 'hybrid';
}

// ─── File Resolution ─────────────────────────────────────────────────────────

/**
 * Tries to read a file, returning null if it doesn't exist or fails.
 */
async function tryRead(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Resolves a CEM module/package path to an actual file on disk.
 *
 * Handles several patterns seen in real-world CEMs:
 *   - "/packages/accordion/src/vaadin-accordion-mixin.js" (Vaadin absolute-style)
 *   - "components/form-core/src/FormControlMixin.js" (Lion relative)
 *   - "@vaadin/a11y-base/src/active-mixin.js" (npm package path)
 *   - "@lion/ui/form-core.js" (npm barrel export path)
 */
async function resolveModulePath(
  modulePath: string,
  projectRoot: string,
  componentFilePath: string | null,
): Promise<string | null> {
  // Normalize: strip leading slash if present
  const normalized = modulePath.startsWith('/') ? modulePath.slice(1) : modulePath;

  // Strategy 1: Direct relative to project root (common for monorepo internal paths)
  const candidates: string[] = [];

  // Try .js as-is
  candidates.push(resolve(projectRoot, normalized));
  // Try .ts equivalent
  candidates.push(resolve(projectRoot, normalized.replace(/\.js$/, '.ts')));

  // Strategy 2: If it's a scoped package path like @vaadin/a11y-base/src/active-mixin.js
  // Try resolving relative to project root by stripping the @scope/package prefix
  // and looking in the monorepo packages/ directory
  if (modulePath.startsWith('@')) {
    const parts = modulePath.split('/');
    // @scope/pkg/rest/of/path → try packages/pkg/rest/of/path
    if (parts.length >= 3) {
      const pkgName = parts[1] ?? '';
      const rest = parts.slice(2).join('/');
      candidates.push(resolve(projectRoot, 'packages', pkgName, rest));
      candidates.push(resolve(projectRoot, 'packages', pkgName, rest.replace(/\.js$/, '.ts')));
      // Also try the full scoped name as directory
      candidates.push(resolve(projectRoot, 'node_modules', modulePath));
      candidates.push(resolve(projectRoot, 'node_modules', modulePath.replace(/\.js$/, '.ts')));
    }
  }

  // Strategy 3: If component file path is known, try relative to its directory
  if (componentFilePath) {
    const compDir = dirname(componentFilePath);
    candidates.push(resolve(compDir, normalized));
    candidates.push(resolve(compDir, normalized.replace(/\.js$/, '.ts')));
  }

  // Strategy 4: Try common monorepo patterns
  // Lion uses: components/form-core/src/FormControlMixin.js
  // Vaadin uses: packages/component-base/src/element-mixin.js
  for (const prefix of ['', 'src/', 'lib/']) {
    candidates.push(resolve(projectRoot, prefix, normalized));
    candidates.push(resolve(projectRoot, prefix, normalized.replace(/\.js$/, '.ts')));
  }

  // Deduplicate and try each — only allow paths within projectRoot
  const resolvedRoot = resolve(projectRoot);
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (!candidate.startsWith(resolvedRoot + sep)) continue;
    const content = await tryRead(candidate);
    if (content !== null) return candidate;
  }

  return null;
}

// ─── Import Following ────────────────────────────────────────────────────────

/**
 * Known accessibility-related mixin/controller names across WC ecosystems.
 * When we see these imported, we follow the import to scan the mixin source.
 */
const A11Y_IMPORT_PATTERNS = [
  /(?:Focus|Keyboard|Active|Disabled|Tabindex|Aria|A11y|Accessible|Screen\s*Reader)/i,
  /(?:FormControl|FormAssociated|FormField|Validation|Validate)/i,
  /(?:Overlay|Dialog|Modal|Popup|Tooltip|Dropdown)/i,
  /(?:Listbox|Combobox|Select|Menu|Autocomplete)/i,
  /(?:Roving|TabIndex|FocusTrap|FocusRing)/i,
  /(?:LiveRegion|Announce|Alert|Status)/i,
  /(?:InteractionState|InputControl|FieldControl)/i,
  /(?:DelegateFocus|SlottedInput|InputMixin)/i,
  /Controller(?:Mixin)?/,
  /Mixin$/,
];

interface ImportInfo {
  names: string[];
  path: string;
}

/**
 * Extracts import statements from source code and filters to a11y-relevant ones.
 */
function extractA11yImports(source: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // Match: import { Foo, Bar } from './path';
  // Match: import { Foo } from '@scope/pkg/path';
  // Match: import Foo from './path';
  const importRegex = /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(source)) !== null) {
    const namedImports = match[1];
    const defaultImport = match[2];
    const importPath = match[3] ?? '';

    const names: string[] = [];
    if (namedImports) {
      names.push(
        ...namedImports
          .split(',')
          .map((n) => (n.trim().split(/\s+as\s+/)[0] ?? '').trim())
          .filter(Boolean),
      );
    }
    if (defaultImport) {
      names.push(defaultImport);
    }

    // Check if any imported name matches our a11y patterns
    const isA11yRelevant = names.some((name) =>
      A11Y_IMPORT_PATTERNS.some((pattern) => pattern.test(name)),
    );

    if (isA11yRelevant) {
      imports.push({ names, path: importPath });
    }
  }

  return imports;
}

// ─── Chain Resolution ────────────────────────────────────────────────────────

/**
 * Resolves the full inheritance chain for a component, reading source files
 * for the component itself, its superclass, all mixins, and a11y-relevant imports.
 *
 * @param componentSource - The already-read component source code
 * @param componentFilePath - Absolute path to the component's source file
 * @param decl - The CEM declaration for this component
 * @param projectRoot - Root directory for resolving relative paths
 * @param maxDepth - Maximum import-following depth (prevents infinite loops)
 */
export async function resolveInheritanceChain(
  componentSource: string,
  componentFilePath: string,
  decl: CemDeclaration,
  projectRoot: string,
  maxDepth: number = 3,
): Promise<InheritanceChainResult> {
  const sources: ResolvedSource[] = [];
  const unresolved: string[] = [];
  const visitedPaths = new Set<string>();

  // 1. Component's own source (already read)
  visitedPaths.add(componentFilePath);
  const componentMarkers = scanSourceForA11yPatterns(componentSource);
  sources.push({
    name: decl.name,
    type: 'component',
    filePath: componentFilePath,
    content: componentSource,
    markers: componentMarkers,
  });

  // 2. CEM-declared superclass and mixins
  const chain = getInheritanceChain(decl);

  for (const entry of chain) {
    if (!entry.modulePath) {
      unresolved.push(entry.name);
      continue;
    }

    const resolvedPath = await resolveModulePath(entry.modulePath, projectRoot, componentFilePath);
    if (!resolvedPath || visitedPaths.has(resolvedPath)) {
      if (!resolvedPath) unresolved.push(entry.name);
      continue;
    }

    visitedPaths.add(resolvedPath);
    const content = await tryRead(resolvedPath);
    if (!content) {
      unresolved.push(entry.name);
      continue;
    }

    const markers = scanSourceForA11yPatterns(content);
    sources.push({
      name: entry.name,
      type: entry.type,
      filePath: resolvedPath,
      content,
      markers,
    });

    // Follow a11y-relevant imports from this mixin/superclass (depth-limited)
    if (maxDepth > 0) {
      const importSources = await followA11yImports(
        content,
        resolvedPath,
        projectRoot,
        visitedPaths,
        maxDepth - 1,
      );
      sources.push(...importSources);
    }
  }

  // 3. Follow a11y-relevant imports from the component source itself
  const componentImportSources = await followA11yImports(
    componentSource,
    componentFilePath,
    projectRoot,
    visitedPaths,
    maxDepth,
  );
  sources.push(...componentImportSources);

  // 4. Aggregate markers
  const aggregatedMarkers = aggregateMarkers(sources.map((s) => s.markers));

  // 5. Classify architecture
  const architecture = classifyArchitecture(sources);

  return {
    sources,
    aggregatedMarkers,
    resolvedCount: sources.length,
    unresolved,
    architecture,
  };
}

/**
 * Follows a11y-relevant imports from a source file, recursively up to maxDepth.
 */
async function followA11yImports(
  source: string,
  sourceFilePath: string,
  projectRoot: string,
  visitedPaths: Set<string>,
  depth: number,
): Promise<ResolvedSource[]> {
  if (depth < 0) return [];

  const results: ResolvedSource[] = [];
  const imports = extractA11yImports(source);

  for (const imp of imports) {
    // Resolve the import path relative to the source file
    let resolvedPath: string | null = null;

    if (imp.path.startsWith('.')) {
      // Relative import
      const dir = dirname(sourceFilePath);
      const candidates = [
        resolve(dir, imp.path),
        resolve(dir, imp.path + '.js'),
        resolve(dir, imp.path + '.ts'),
        resolve(dir, imp.path.replace(/\.js$/, '.ts')),
        resolve(dir, imp.path, 'index.js'),
        resolve(dir, imp.path, 'index.ts'),
      ];
      for (const candidate of candidates) {
        if (!visitedPaths.has(candidate) && existsSync(candidate)) {
          resolvedPath = candidate;
          break;
        }
      }
    } else {
      // Package/absolute import
      resolvedPath = await resolveModulePath(imp.path, projectRoot, sourceFilePath);
      if (resolvedPath && visitedPaths.has(resolvedPath)) resolvedPath = null;
    }

    if (!resolvedPath) continue;
    visitedPaths.add(resolvedPath);

    const content = await tryRead(resolvedPath);
    if (!content) continue;

    const markers = scanSourceForA11yPatterns(content);
    const name = imp.names.join(', ');
    results.push({
      name,
      type: 'import',
      filePath: resolvedPath,
      content,
      markers,
    });

    // Recurse into this file's imports too
    if (depth > 0) {
      const deeper = await followA11yImports(
        content,
        resolvedPath,
        projectRoot,
        visitedPaths,
        depth - 1,
      );
      results.push(...deeper);
    }
  }

  return results;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

/**
 * Merges multiple marker sets with OR logic — if ANY file in the chain
 * has the pattern, the aggregate is true.
 */
function aggregateMarkers(markerSets: SourceA11yMarkers[]): SourceA11yMarkers {
  const result: SourceA11yMarkers = {
    ariaBindings: false,
    roleAssignments: false,
    keyboardHandling: false,
    focusManagement: false,
    formInternals: false,
    liveRegions: false,
    screenReaderSupport: false,
  };

  for (const markers of markerSets) {
    for (const key of Object.keys(result) as (keyof SourceA11yMarkers)[]) {
      if (markers[key]) result[key] = true;
    }
  }

  return result;
}

// ─── Architecture Classification ─────────────────────────────────────────────

/**
 * Classifies the component's architecture based on where a11y patterns live.
 */
function classifyArchitecture(
  sources: ResolvedSource[],
): 'inline' | 'mixin-heavy' | 'controller-based' | 'hybrid' {
  const component = sources.find((s) => s.type === 'component');
  const mixins = sources.filter((s) => s.type === 'mixin' || s.type === 'superclass');
  const imports = sources.filter((s) => s.type === 'import');

  if (!component) return 'inline';

  // Count how many a11y categories are found in each location
  const componentCategories = countTrueMarkers(component.markers);
  const mixinCategories = mixins.reduce((sum, s) => sum + countTrueMarkers(s.markers), 0);
  const importCategories = imports.reduce((sum, s) => sum + countTrueMarkers(s.markers), 0);

  const totalExternal = mixinCategories + importCategories;

  if (totalExternal === 0) return 'inline';
  if (componentCategories <= 1 && mixinCategories >= 3) return 'mixin-heavy';
  if (componentCategories <= 1 && importCategories >= 3) return 'controller-based';
  return 'hybrid';
}

function countTrueMarkers(markers: SourceA11yMarkers): number {
  return Object.values(markers).filter(Boolean).length;
}
