import { resolve, dirname } from 'path';

import ts from 'typescript';

import type { McpWcConfig } from '../config.js';
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

function formatDiagnostic(diagnostic: ts.Diagnostic): DiagnosticResult {
  const file = diagnostic.file?.fileName ?? '';
  const { line, character } =
    diagnostic.file && diagnostic.start !== undefined
      ? ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start)
      : { line: 0, character: 0 };
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  const severity =
    diagnostic.category === ts.DiagnosticCategory.Error
      ? 'error'
      : diagnostic.category === ts.DiagnosticCategory.Warning
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
  compilerOptions: ts.CompilerOptions;
} {
  const tsconfigAbsPath = resolve(config.projectRoot, config.tsconfigPath);
  const configFile = ts.readConfigFile(tsconfigAbsPath, ts.sys.readFile);

  if (configFile.error) {
    const msg = ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n');
    throw new Error(`Failed to read tsconfig: ${msg}`);
  }

  const basePath = dirname(tsconfigAbsPath);
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, basePath);

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
  FilePathSchema.parse(filePath);

  const absoluteFilePath = resolve(config.projectRoot, filePath);
  const { compilerOptions } = parseTsConfig(config);

  const program = ts.createProgram([absoluteFilePath], compilerOptions);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  return Array.from(diagnostics)
    .filter((d) => d.file !== undefined)
    .map(formatDiagnostic);
}

/**
 * Run a full TypeScript diagnostic pass on the entire project.
 * Returns error and warning counts along with the full diagnostic arrays.
 */
export function getProjectDiagnostics(config: McpWcConfig): ProjectDiagnosticsResult {
  const { fileNames, compilerOptions } = parseTsConfig(config);

  const program = ts.createProgram(fileNames, compilerOptions);
  const diagnostics = ts.getPreEmitDiagnostics(program);

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
