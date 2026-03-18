import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['.worktrees/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'packages/core/src/**/*.ts'],
      exclude: [
        'src/index.ts',
        // cem-source-fidelity integration tests require local wc-libraries paths
        // that are not available in CI; exclude from coverage thresholds
        '**/analyzers/cem-source-fidelity.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 85,
        lines: 80,
      },
    },
  },
});
