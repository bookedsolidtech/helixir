module.exports = {
  globs: ['src/**/*.ts', 'packages/core/src/**/*.ts'],
  exclude: [
    'src/**/*.test.ts',
    'src/**/*.spec.ts',
    'src/**/__tests__/**',
    'packages/core/src/**/*.test.ts',
    'packages/core/src/**/*.spec.ts',
    'packages/core/src/**/__tests__/**',
    'tests/**',
    '**/*.d.ts',
  ],
  outdir: '.',
  packagejson: true,
};
