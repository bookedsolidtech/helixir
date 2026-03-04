import { readFile, access } from 'node:fs/promises';
import { relative } from 'node:path';
import { z } from 'zod';
import { MCPError, ErrorCategory } from './error-handling.js';

export class SafeFileOperations {
  private readonly projectRoot: string | undefined;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot;
  }

  /** Returns a path safe for inclusion in error messages (relative to projectRoot if set). */
  private safePath(filePath: string): string {
    if (this.projectRoot) {
      return relative(this.projectRoot, filePath);
    }
    return filePath;
  }

  /**
   * Reads and parses a JSON file, then validates it against the provided Zod schema.
   *
   * @throws MCPError with FILESYSTEM category if the file cannot be read
   * @throws MCPError with VALIDATION category if parsing or schema validation fails
   */
  async readJSON<T>(filePath: string, schema: z.ZodType<T>): Promise<T> {
    const displayPath = this.safePath(filePath);
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch (err) {
      throw new MCPError(
        `Failed to read file "${displayPath}": ${String(err)}`,
        ErrorCategory.FILESYSTEM,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new MCPError(
        `Failed to parse JSON from "${displayPath}": ${String(err)}`,
        ErrorCategory.VALIDATION,
      );
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new MCPError(
        `Schema validation failed for "${displayPath}": ${result.error.message}`,
        ErrorCategory.VALIDATION,
      );
    }

    return result.data;
  }

  /**
   * Returns true if the file exists and is accessible, false otherwise.
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
