import { readFile, access } from 'node:fs/promises';
import { z } from 'zod';
import { MCPError, ErrorCategory } from './error-handling.js';

export class SafeFileOperations {
  /**
   * Reads and parses a JSON file, then validates it against the provided Zod schema.
   *
   * @throws MCPError with FILESYSTEM category if the file cannot be read
   * @throws MCPError with VALIDATION category if parsing or schema validation fails
   */
  async readJSON<T>(filePath: string, schema: z.ZodType<T>): Promise<T> {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch (err) {
      throw new MCPError(
        `Failed to read file "${filePath}": ${String(err)}`,
        ErrorCategory.FILESYSTEM,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new MCPError(
        `Failed to parse JSON from "${filePath}": ${String(err)}`,
        ErrorCategory.VALIDATION,
      );
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new MCPError(
        `Schema validation failed for "${filePath}": ${result.error.message}`,
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
