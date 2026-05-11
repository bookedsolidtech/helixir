#!/usr/bin/env node
// scripts/block-local-publish.mjs
//
// Wired into package.json `prepublishOnly` so `pnpm publish` (or `npm publish`)
// invoked locally without going through the CI release flow fails fast with a
// clear message. CI runs (GitHub Actions, gitlab-ci, etc.) export `CI=true` so
// they pass through.
//
// The published-package flow is:
//   PR merged to main → changeset-bot opens "chore: version packages" → merge
//   that → publish.yml runs → `pnpm changeset publish` invokes prepublishOnly
//   per package → CI=true → this script exits 0 → real publish proceeds.
//
// If you want to publish locally for a real reason (registry mirror test,
// emergency hotfix), set HELIXIR_ALLOW_LOCAL_PUBLISH=1 explicitly.

const isCi = process.env.CI === 'true' || process.env.CI === '1';
const allowLocal = process.env.HELIXIR_ALLOW_LOCAL_PUBLISH === '1';

if (isCi || allowLocal) {
  process.exit(0);
}

console.error('');
console.error('  ✘ Local publish blocked.');
console.error('');
console.error('  helixir releases via the GitHub Actions publish workflow:');
console.error('    1. Merge changes to dev → staging → main');
console.error('    2. changeset-bot opens the version PR on main');
console.error('    3. Merge the version PR → publish workflow runs `changeset publish`');
console.error('');
console.error('  To override (for a registry-mirror smoke test, for example):');
console.error('    HELIXIR_ALLOW_LOCAL_PUBLISH=1 pnpm publish');
console.error('');
process.exit(1);
