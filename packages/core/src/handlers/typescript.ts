import { resolve, dirname } from 'path';

import type * as TSType from 'typescript';

import type { McpWcConfig } from '../config.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';
import { FilePathSchema } from '../shared/validation.js';

export interface DiagnosticResult {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ProjectDiagnosticsResult {
  errorCount: number;
  warningCount: number;
  errors: DiagnosticResult[];
  warnings: DiagnosticResult[];
}

let ts: typeof TSType | null = null;
try {
  const mod = await import('typescript');
  ts = (mod.default ?? mod) as typeof TSType;
} catch {
  ts = null;
}

/** Returns `true` if the `typescript` package is installed and available at runtime, `false` otherwise. */
export function isTypescriptAvailable(): boolean {
  return ts !== null;
}

function requireTs(): typeof TSType {
  if (ts === null) {
    throw new MCPError(
      'TypeScript diagnostics require TypeScript to be installed.\n' +
        'Run: npm install typescript --save-dev\n' +
        'Then restart helixir.',
      ErrorCategory.VALIDATION,
    );
  }
  return ts;
}

function formatDiagnostic(diagnostic: TSType.Diagnostic): DiagnosticResult {
  const tsModule = requireTs();
  const file = diagnostic.file?.fileName ?? '';
  const { line, character } =
    diagnostic.file && diagnostic.start !== undefined
      ? tsModule.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start)
      : { line: 0, character: 0 };
  const message = tsModule.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  const severity =
    diagnostic.category === tsModule.DiagnosticCategory.Error
      ? 'error'
      : diagnostic.category === tsModule.DiagnosticCategory.Warning
        ? 'warning'
        : 'info';

  return {
    file,
    line: line + 1,
    column: character + 1,
    message,
    severity,
  };
}

function parseTsConfig(config: McpWcConfig): {
  fileNames: string[];
  compilerOptions: TSType.CompilerOptions;
} {
  const tsModule = requireTs();
  const tsconfigAbsPath = resolve(config.projectRoot, config.tsconfigPath);
  const configFile = tsModule.readConfigFile(tsconfigAbsPath, tsModule.sys.readFile);

  if (configFile.error) {
    const msg = tsModule.flattenDiagnosticMessageText(configFile.error.messageText, '\n');
    throw new MCPError(`Failed to read tsconfig: ${msg}`, ErrorCategory.FILESYSTEM);
  }

  const basePath = dirname(tsconfigAbsPath);
  const parsedConfig = tsModule.parseJsonConfigFileContent(
    configFile.config,
    tsModule.sys,
    basePath,
  );

  return {
    fileNames: parsedConfig.fileNames,
    compilerOptions: parsedConfig.options,
  };
}

/**
 * Run TypeScript diagnostics on a single file.
 * filePath must pass FilePathSchema validation (no path traversal, no absolute paths).
 */
export function getFileDiagnostics(config: McpWcConfig, filePath: string): DiagnosticResult[] {
  const tsModule = requireTs();
  FilePathSchema.parse(filePath);

  const absoluteFilePath = resolve(config.projectRoot, filePath);
  const { compilerOptions } = parseTsConfig(config);

  const program = tsModule.createProgram([absoluteFilePath], compilerOptions);
  const diagnostics = tsModule.getPreEmitDiagnostics(program);

  return Array.from(diagnostics)
    .filter((d) => d.file !== undefined)
    .map(formatDiagnostic);
}

/**
 * Run a full TypeScript diagnostic pass on the entire project.
 * Returns error and warning counts along with the full diagnostic arrays.
 */
export function getProjectDiagnostics(config: McpWcConfig): ProjectDiagnosticsResult {
  const tsModule = requireTs();
  const { fileNames, compilerOptions } = parseTsConfig(config);

  const program = tsModule.createProgram(fileNames, compilerOptions);
  const diagnostics = tsModule.getPreEmitDiagnostics(program);

  const formatted = Array.from(diagnostics)
    .filter((d) => d.file !== undefined)
    .map(formatDiagnostic);

  const errors = formatted.filter((d) => d.severity === 'error');
  const warnings = formatted.filter((d) => d.severity === 'warning');

  return {
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
  };
}
