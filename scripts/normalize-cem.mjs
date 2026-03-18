/**
 * Normalizes custom-elements.json for deterministic diffs.
 * Sorts modules by path so CEM generation is stable across OS file orderings.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const cemPath = resolve(process.cwd(), 'custom-elements.json');
const cem = JSON.parse(readFileSync(cemPath, 'utf8'));

cem.modules.sort((a, b) => a.path.localeCompare(b.path));

writeFileSync(cemPath, JSON.stringify(cem, null, 2) + '\n');
