import { existsSync } from 'fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'path';
import type { McpWcConfig } from '../config.js';

export interface FrameworkDetectionResult {
  framework: string | null;
  version: string | null;
  cemGenerator: string | null;
  cemPath: string;
  notes: string | null;
  formatted: string;
}

interface FrameworkDef {
  name: string;
  packages: string[];
  getVersion?: (deps: Record<string, string>) => string | null;
}

const FRAMEWORK_DEFS: FrameworkDef[] = [
  { name: 'Shoelace', packages: ['@shoelace-style/shoelace'] },
  {
    name: 'Lit',
    packages: ['lit', 'lit-element', '@polymer/lit-element'],
    getVersion: (deps) => {
      const ver = deps['lit'] ?? deps['lit-element'] ?? deps['@polymer/lit-element'] ?? null;
      if (!ver) return null;
      const match = ver.match(/\d+/);
      return match ? `${match[0]}.x` : null;
    },
  },
  { name: 'Stencil', packages: ['@stencil/core'] },
  { name: 'FAST', packages: ['@microsoft/fast-element', '@microsoft/fast-foundation'] },
  { name: 'Hybrids', packages: ['hybrids'] },
  { name: 'Haunted', packages: ['haunted'] },
  { name: 'Atomico', packages: ['atomico'] },
];

const CONFIG_FILE_FRAMEWORKS: Array<{ file: string; framework: string }> = [
  { file: 'stencil.config.ts', framework: 'Stencil' },
  { file: 'stencil.config.js', framework: 'Stencil' },
];

const FRAMEWORK_NOTES: Record<string, string> = {
  Shoelace: 'Shoelace is a consumer library. CEM is pre-generated and shipped with the package.',
  Lit: 'Run `npx cem analyze` to regenerate the CEM from source.',
  Stencil: 'Stencil auto-generates CEM during `stencil build`.',
  FAST: 'Run `npx cem analyze` or use the FAST CEM plugin to regenerate.',
  Hybrids: 'Run `npx cem analyze` to regenerate the CEM.',
  Haunted: 'Run `npx cem analyze` to regenerate the CEM.',
  Atomico: 'Run `npx cem analyze` to regenerate the CEM.',
};

const CEM_ANALYZER_CONFIG_FILES = [
  'cem.config.mjs',
  'cem.config.js',
  'custom-elements.config.mjs',
  'custom-elements.config.js',
];

async function readPackageJsonDeps(projectRoot: string): Promise<Record<string, string> | null> {
  const pkgPath = resolve(projectRoot, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as Record<string, unknown>;
    return {
      ...((pkg['dependencies'] as Record<string, string>) ?? {}),
      ...((pkg['devDependencies'] as Record<string, string>) ?? {}),
      ...((pkg['peerDependencies'] as Record<string, string>) ?? {}),
    };
  } catch {
    return null;
  }
}

function formatResult(r: Omit<FrameworkDetectionResult, 'formatted'>): string {
  const lines: string[] = [];
  lines.push(`Framework: ${r.framework ?? 'Unknown'}`);
  if (r.version) lines.push(`Version: ${r.version}`);
  if (r.cemGenerator) lines.push(`CEM Generator: ${r.cemGenerator}`);
  lines.push(`CEM Path: ${r.cemPath}`);
  if (r.notes) lines.push(`Notes: ${r.notes}`);
  return lines.join('\n');
}

export async function detectFramework(config: McpWcConfig): Promise<FrameworkDetectionResult> {
  let framework: string | null = null;
  let version: string | null = null;
  let cemGenerator: string | null = null;

  // 1. Check package.json dependencies
  const deps = await readPackageJsonDeps(config.projectRoot);
  if (deps !== null) {
    for (const def of FRAMEWORK_DEFS) {
      if (def.packages.some((p) => p in deps)) {
        framework = def.name;
        if (def.getVersion) {
          version = def.getVersion(deps);
        }
        break;
      }
    }
  }

  // 2. Check CEM schemaVersion / generator from raw file
  const cemAbsPath = resolve(config.projectRoot, config.cemPath);
  if (existsSync(cemAbsPath)) {
    try {
      const raw = JSON.parse(await readFile(cemAbsPath, 'utf-8')) as Record<string, unknown>;
      if (typeof raw['generator'] === 'string') {
        cemGenerator = raw['generator'];
      }
    } catch {
      // ignore malformed CEM
    }
  }

  // 3. Check framework-specific config files (fallback if package.json didn't match)
  if (!framework) {
    for (const { file, framework: fw } of CONFIG_FILE_FRAMEWORKS) {
      if (existsSync(resolve(config.projectRoot, file))) {
        framework = fw;
        break;
      }
    }
  }

  // 4. Check for CEM analyzer config files to determine generator
  if (!cemGenerator) {
    for (const f of CEM_ANALYZER_CONFIG_FILES) {
      if (existsSync(resolve(config.projectRoot, f))) {
        cemGenerator = '@custom-elements-manifest/analyzer';
        break;
      }
    }
  }

  const notes = framework ? (FRAMEWORK_NOTES[framework] ?? null) : null;
  const partial = { framework, version, cemGenerator, cemPath: config.cemPath, notes };
  return { ...partial, formatted: formatResult(partial) };
}
