import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const __dirname = new URL('.', import.meta.url).pathname;

export default defineConfig({
  resolve: {
    alias: {
      // Map helixir/core imports to the local core source during testing.
      // At runtime (published package), helixir/core resolves through the
      // installed helixir package's built exports.
      'helixir/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**'],
  },
});
