/**
 * Shared test helpers for Phase-2 dimension scorer tests.
 *
 * The defect-corpus fixtures under `tests/__fixtures__/defect-corpus/`
 * use a flat `parent/` + `subclass/` layout — they are NOT laid out as
 * a `packages/<pkg>/custom-elements.json` library, so the Phase-1
 * detector cannot resolve their source files automatically. These
 * helpers run the same regex set the detector uses, against the
 * subclass's sibling `.styles.ts` + `.ts` files, and build a
 * `HelixAaaEvidence` object identical in shape to what the detector
 * would produce against a properly-laid-out helix repo.
 *
 * Keeping these regexes in lockstep with the ones in
 * `packages/core/src/handlers/evidence/helix-aaa-evidence.ts` is a
 * conscious test-side duplication. The point of the fixture pass is
 * to validate the scorers given the SAME evidence shape, not to
 * re-validate the detector itself.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  HelixAaaEvidence,
  HelixAaaMeta,
  SourceChecks,
  VerdictSnapshot,
} from '../../../packages/core/src/handlers/evidence/helix-aaa-evidence.js';
import type { CemDeclaration } from '../../../packages/core/src/handlers/cem.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFECT_CORPUS_ROOT = resolve(HERE, '../../__fixtures__/defect-corpus');

// Regexes — keep in lockstep with helix-aaa-evidence.ts.
const STATIC_FORM_ASSOCIATED_RE = /static\s+(override\s+)?formAssociated\s*=\s*true/;
const ATTACH_INTERNALS_RE = /\.attachInternals\s*\(\s*\)/;
const SET_VALIDITY_RE = /\.setValidity\s*\(/;
const FOCUS_VISIBLE_2PX_RE =
  /:focus-visible[\s\S]{0,200}outline:\s*(?:var\(--hx-focus-ring-width(?:[^)]*\))?|2px)\s+solid\s+var\(--hx-(?:[\w-]*-)?focus-ring-color/;
const FOCUS_VISIBLE_LOOSE_RE = /:focus-visible[\s\S]{0,200}outline:/;
const FORCED_COLORS_RE = /@media\s*\(\s*forced-colors\s*:\s*active\s*\)/;

export interface DefectFixture {
  expected: {
    classId: string;
    subclassTagName: string;
    parentTagName: string;
    dimensions: Record<
      string,
      {
        scoreMax?: number;
        confidenceIn?: string[];
        issueIncludes?: string;
        verdict?: string;
      }
    >;
  };
  /** First class-declaration in the subclass CEM. */
  subclassDecl: CemDeclaration;
  /** Per-the spec, also expose the parent CEM decl for parent-aware tests. */
  parentDecl?: CemDeclaration;
  /** Resolved source path for the subclass component .ts. */
  subclassSourcePath: string;
}

export function loadDefectFixture(folder: string): DefectFixture {
  const root = resolve(DEFECT_CORPUS_ROOT, folder);
  const expected = JSON.parse(
    readFileSync(resolve(root, 'expected.json'), 'utf-8'),
  ) as DefectFixture['expected'];

  const subclassCem = JSON.parse(
    readFileSync(resolve(root, 'subclass', 'custom-elements.json'), 'utf-8'),
  ) as {
    modules: Array<{ path: string; declarations: CemDeclaration[] }>;
  };
  const subclassMod = subclassCem.modules[0];
  if (!subclassMod) {
    throw new Error(`fixture ${folder}: subclass CEM has no modules`);
  }
  const subclassDecl = subclassMod.declarations.find(
    (d): d is CemDeclaration => d.kind === 'class',
  );
  if (!subclassDecl) {
    throw new Error(`fixture ${folder}: no class declaration in subclass CEM`);
  }

  let parentDecl: CemDeclaration | undefined;
  try {
    const parentCem = JSON.parse(
      readFileSync(resolve(root, 'parent', 'custom-elements.json'), 'utf-8'),
    ) as { modules: Array<{ declarations: CemDeclaration[] }> };
    parentDecl = parentCem.modules[0]?.declarations.find(
      (d): d is CemDeclaration => d.kind === 'class',
    );
  } catch {
    parentDecl = undefined;
  }

  const subclassSourcePath = resolve(root, subclassMod.path);
  return { expected, subclassDecl, parentDecl, subclassSourcePath };
}

export function readSourceChecksForFixture(
  subclassSourcePath: string,
  /** Whether to also consider the parent's styles array (cascade order). */
  includeParentStyles: boolean = false,
  parentStylesPath?: string,
): SourceChecks | undefined {
  let tsContent: string;
  try {
    tsContent = readFileSync(subclassSourcePath, 'utf-8');
  } catch {
    return undefined;
  }
  // Strip JS comments from both TS and styles content. The defect
  // fixtures explicitly mention symbols like `.setValidity()` and
  // `@media (forced-colors: active)` inside comments — those would
  // otherwise falsely trip the detector's regex-only signal extraction.
  tsContent = tsContent.replace(/\/\*[\s\S]*?\*\//g, '');
  tsContent = tsContent.replace(/(^|[^:])\/\/.*$/gm, '$1');
  const stylesPath = subclassSourcePath.replace(/\.ts$/, '.styles.ts');
  let stylesContent = '';
  try {
    stylesContent = readFileSync(stylesPath, 'utf-8');
  } catch {
    stylesContent = '';
  }

  if (includeParentStyles && parentStylesPath) {
    try {
      const parentContent = readFileSync(parentStylesPath, 'utf-8');
      stylesContent = `${parentContent}\n${stylesContent}`;
    } catch {
      // ignore
    }
  }

  // Strip JS-style comments from styles before regex matching — the
  // fixture for class 19 carries a `/* No @media (forced-colors: active)
  // block */` annotation that would otherwise falsely trigger the
  // forced-colors regex. The detector itself does not strip comments,
  // but our fixture pass mirrors what a real CSS extractor would do.
  stylesContent = stylesContent.replace(/\/\*[\s\S]*?\*\//g, '');
  stylesContent = stylesContent.replace(/(^|[^:])\/\/.*$/gm, '$1');

  // Detect "outline removal" cases — a :focus-visible block whose
  // outline is `none|0|unset` is a degraded rule, not a present rule.
  // The Phase-1 detector currently rolls this into `hasFocusVisibleRule`
  // via its loose regex; the fixture helper narrows the signal so the
  // class-17 defect (focus-ring-degraded subclass) is visible to scorers.
  const OUTLINE_REMOVED_RE =
    /:focus-visible[\s\S]{0,200}outline:\s*(?:none|0(?:px)?|unset|initial|revert)\s*[;}]/;
  const outlineRemoved = OUTLINE_REMOVED_RE.test(stylesContent);

  const hasLoose = FOCUS_VISIBLE_LOOSE_RE.test(stylesContent);
  const has2px = FOCUS_VISIBLE_2PX_RE.test(stylesContent);
  return {
    hasStaticFormAssociated: STATIC_FORM_ASSOCIATED_RE.test(tsContent),
    hasAttachInternals: ATTACH_INTERNALS_RE.test(tsContent),
    hasSetValidityCall: SET_VALIDITY_RE.test(tsContent),
    // Treat "outline removed" as the absence of a meaningful rule.
    hasFocusVisibleRule: (has2px || hasLoose) && !outlineRemoved,
    has2pxOutlineRule: has2px,
    hasForcedColorsBlock: FORCED_COLORS_RE.test(stylesContent),
  };
}

export function buildEvidence(
  decl: CemDeclaration,
  opts: {
    sourceChecks?: SourceChecks;
    verdictSnapshot?: VerdictSnapshot;
    auditMdPath?: string;
    auditMdFresh?: boolean;
  } = {},
): HelixAaaEvidence {
  const raw = (decl as { helixMeta?: unknown }).helixMeta;
  const helixMeta = (raw && typeof raw === 'object' ? (raw as HelixAaaMeta) : undefined) as
    | HelixAaaMeta
    | undefined;
  const result: HelixAaaEvidence = {};
  if (helixMeta) result.helixMeta = helixMeta;
  if (opts.sourceChecks) result.sourceChecks = opts.sourceChecks;
  if (opts.verdictSnapshot) result.verdictSnapshot = opts.verdictSnapshot;
  if (opts.auditMdPath !== undefined) result.auditMdPath = opts.auditMdPath;
  if (opts.auditMdFresh !== undefined) result.auditMdFresh = opts.auditMdFresh;
  return result;
}

export function bareDecl(tagName = 'x-bare'): CemDeclaration {
  return {
    kind: 'class',
    name: 'XBare',
    tagName,
    members: [],
    events: [],
    slots: [],
    cssParts: [],
    cssProperties: [],
  } as CemDeclaration;
}
