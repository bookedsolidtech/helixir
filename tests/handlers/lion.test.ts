import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'fs';
import { CemSchema, listAllComponents, parseCem } from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';
import { validateUsage } from '../../packages/core/src/handlers/validate.js';

const fixturesDir = join(import.meta.dirname, '../__fixtures__');

function loadCem(filename: string): Cem {
  return CemSchema.parse(JSON.parse(readFileSync(join(fixturesDir, filename), 'utf-8')));
}

const lionCem = loadCem('lion-custom-elements.json');

describe('Lion fixture — listAllComponents', () => {
  it('returns 4 components', () => {
    const components = listAllComponents(lionCem);
    expect(components).toHaveLength(4);
    expect(components).toContain('lion-button');
    expect(components).toContain('lion-input');
    expect(components).toContain('lion-dialog');
    expect(components).toContain('lion-select-rich');
  });
});

describe('Lion fixture — getComponentDocs (parseCem)', () => {
  it('lion-input has modelValue property', () => {
    const meta = parseCem('lion-input', lionCem);
    const memberNames = meta.members.map((m) => m.name);
    expect(memberNames).toContain('modelValue');
  });

  it('lion-input has errorMessage property', () => {
    const meta = parseCem('lion-input', lionCem);
    const memberNames = meta.members.map((m) => m.name);
    expect(memberNames).toContain('errorMessage');
  });

  it('lion-input has feedback slot', () => {
    const meta = parseCem('lion-input', lionCem);
    const slotNames = meta.slots.map((s) => s.name);
    expect(slotNames).toContain('feedback');
  });
});

describe('Lion fixture — ARIA attributes on lion-button', () => {
  it('lion-button CEM fixture contains ARIA-related attribute entries in raw JSON', () => {
    // Read raw JSON to access the `attributes` array (not part of the Zod CEM schema)
    const raw = JSON.parse(
      readFileSync(join(fixturesDir, 'lion-custom-elements.json'), 'utf-8'),
    ) as {
      modules: Array<{
        declarations?: Array<{
          tagName?: string;
          attributes?: Array<{ name: string }>;
        }>;
      }>;
    };

    let buttonDecl: { tagName?: string; attributes?: Array<{ name: string }> } | undefined;
    for (const mod of raw.modules) {
      for (const decl of mod.declarations ?? []) {
        if (decl.tagName === 'lion-button') {
          buttonDecl = decl;
        }
      }
    }

    expect(buttonDecl).toBeDefined();
    const attrNames = (buttonDecl?.attributes ?? []).map((a) => a.name);
    expect(attrNames).toContain('aria-disabled');
    expect(attrNames).toContain('aria-pressed');
    expect(attrNames).toContain('role');
  });
});

describe('Lion fixture — validateUsage', () => {
  it('valid lion-dialog with content slot passes', () => {
    const result = validateUsage(
      'lion-dialog',
      '<lion-dialog><div slot="content">Hello</div></lion-dialog>',
      lionCem,
    );
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('invalid lion-dialog with nonexistent slot produces error', () => {
    const result = validateUsage(
      'lion-dialog',
      '<lion-dialog><div slot="nonexistent">Hello</div></lion-dialog>',
      lionCem,
    );
    expect(result.valid).toBe(false);
    const errors = result.issues.filter((i) => i.level === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toMatch(/nonexistent/);
  });
});
