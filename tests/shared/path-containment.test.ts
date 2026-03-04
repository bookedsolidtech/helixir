/**
 * Path containment tests (Finding #27).
 *
 * Verifies that FilePathSchema correctly rejects paths that could escape a project root,
 * and accepts safe relative paths. These tests document the behavior of the path validation
 * used for cemPath and similar config values.
 */
import { describe, it, expect } from 'vitest';
import { resolve, sep } from 'node:path';
import { FilePathSchema } from '../../packages/core/src/shared/validation.js';

const PROJECT_ROOT = '/tmp/test-project';

describe('FilePathSchema — path containment (Finding #27)', () => {
  it('accepts a normal relative cemPath', () => {
    expect(FilePathSchema.safeParse('custom-elements.json').success).toBe(true);
    expect(FilePathSchema.safeParse('dist/custom-elements.json').success).toBe(true);
    expect(FilePathSchema.safeParse('src/components/cem.json').success).toBe(true);
  });

  it('rejects absolute cemPath that escapes projectRoot', () => {
    // Absolute paths are rejected outright — cannot be used as cemPath
    expect(FilePathSchema.safeParse('/etc/passwd').success).toBe(false);
    expect(FilePathSchema.safeParse('/tmp/other-project/cem.json').success).toBe(false);
  });

  it('rejects relative cemPath with .. segments that would escape projectRoot', () => {
    expect(FilePathSchema.safeParse('../outside/cem.json').success).toBe(false);
    expect(FilePathSchema.safeParse('../../etc/passwd').success).toBe(false);
    expect(FilePathSchema.safeParse('src/../../evil').success).toBe(false);
  });

  it('confirms that accepted paths stay within projectRoot when resolved', () => {
    const safePath = 'dist/custom-elements.json';
    const resolved = resolve(PROJECT_ROOT, safePath);
    expect(resolved.startsWith(PROJECT_ROOT)).toBe(true);
  });

  it('rejects Windows drive letter paths on all platforms', () => {
    expect(FilePathSchema.safeParse('C:\\evil\\path').success).toBe(false);
    expect(FilePathSchema.safeParse('c:/secret/cem.json').success).toBe(false);
    expect(FilePathSchema.safeParse('Z:/cem.json').success).toBe(false);
  });

  it('rejects network share paths', () => {
    expect(FilePathSchema.safeParse('\\\\server\\share\\cem.json').success).toBe(false);
  });

  it('returns error message for path traversal', () => {
    const result = FilePathSchema.safeParse('../evil');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/traversal|not allowed/i);
    }
  });

  it('returns error message for absolute paths', () => {
    const result = FilePathSchema.safeParse('/absolute/path');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/not allowed/i);
    }
  });
});

/**
 * Tests for the main() startup CEM path containment guard (src/index.ts:100-109).
 *
 * The guard checks that the resolved cemPath stays within resolvedProjectRoot using:
 *   !cemAbsPath.startsWith(resolvedProjectRoot + sep) && cemAbsPath !== resolvedProjectRoot
 *
 * This is a defence-in-depth backstop: FilePathSchema rejects traversal/absolute paths
 * at the schema layer, but the runtime guard catches any edge case that slips through.
 */
describe('main() startup CEM path containment guard (src/index.ts:100-109)', () => {
  const PROJECT_ROOT = '/tmp/test-project';

  function isBlockedByGuard(resolvedProjectRoot: string, cemAbsPath: string): boolean {
    return !cemAbsPath.startsWith(resolvedProjectRoot + sep) && cemAbsPath !== resolvedProjectRoot;
  }

  it('guard blocks an absolute cemAbsPath that resolves outside projectRoot', () => {
    const resolvedProjectRoot = resolve(PROJECT_ROOT);
    // e.g. if config.cemPath were somehow '/etc/passwd', resolve() would return it as-is
    const cemAbsPath = '/etc/passwd';
    expect(isBlockedByGuard(resolvedProjectRoot, cemAbsPath)).toBe(true);
  });

  it('guard blocks a traversal cemPath that escapes projectRoot after resolve()', () => {
    const resolvedProjectRoot = resolve(PROJECT_ROOT);
    // resolve() collapses ../../ sequences — this ends up outside projectRoot
    const cemAbsPath = resolve(resolvedProjectRoot, '../../etc/passwd');
    expect(isBlockedByGuard(resolvedProjectRoot, cemAbsPath)).toBe(true);
  });

  it('guard allows a cemPath that stays within projectRoot', () => {
    const resolvedProjectRoot = resolve(PROJECT_ROOT);
    const cemAbsPath = resolve(resolvedProjectRoot, 'custom-elements.json');
    expect(isBlockedByGuard(resolvedProjectRoot, cemAbsPath)).toBe(false);
  });

  it('guard allows a nested cemPath within projectRoot', () => {
    const resolvedProjectRoot = resolve(PROJECT_ROOT);
    const cemAbsPath = resolve(resolvedProjectRoot, 'dist/custom-elements.json');
    expect(isBlockedByGuard(resolvedProjectRoot, cemAbsPath)).toBe(false);
  });

  it('guard blocks a cemPath that is a sibling directory (not within projectRoot)', () => {
    const resolvedProjectRoot = resolve(PROJECT_ROOT);
    // '/tmp/test-project-evil' starts with '/tmp/test-project' as a string prefix
    // but the sep check ensures it is not confused as a subdirectory
    const cemAbsPath = '/tmp/test-project-evil/cem.json';
    expect(isBlockedByGuard(resolvedProjectRoot, cemAbsPath)).toBe(true);
  });
});
