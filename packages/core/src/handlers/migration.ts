import type { McpWcConfig } from '../config.js';
import { diffCem } from './cem.js';
import type { Cem } from './cem.js';

export interface MigrationGuide {
  tagName: string;
  baseBranch: string;
  isNew: boolean;
  markdown: string;
}

function parseBreakingChange(breaking: string): {
  kind: 'property_removed' | 'property_type_changed' | 'event_removed' | 'unknown';
  raw: string;
  name?: string;
  oldType?: string;
  newType?: string;
} {
  if (breaking.startsWith('Property removed: ')) {
    return {
      kind: 'property_removed',
      raw: breaking,
      name: breaking.slice('Property removed: '.length),
    };
  }

  if (breaking.startsWith('Property type changed: ')) {
    const detail = breaking.slice('Property type changed: '.length);
    const match = /^(.+) \((.+) → (.+)\)$/.exec(detail);
    if (match) {
      return {
        kind: 'property_type_changed',
        raw: breaking,
        name: match[1],
        oldType: match[2],
        newType: match[3],
      };
    }
    return { kind: 'property_type_changed', raw: breaking, name: detail };
  }

  if (breaking.startsWith('Event removed: ')) {
    return { kind: 'event_removed', raw: breaking, name: breaking.slice('Event removed: '.length) };
  }

  return { kind: 'unknown', raw: breaking };
}

function renderBreakingSection(breaking: string[]): string {
  const sections: string[] = [];

  for (const change of breaking) {
    const parsed = parseBreakingChange(change);

    if (parsed.kind === 'property_removed') {
      sections.push(
        [
          `### Removed: \`${parsed.name}\` property`,
          '',
          `The \`${parsed.name}\` property has been removed. Update any usages to remove or replace it.`,
          '',
          `Before: \`<component ${parsed.name}="...">\``,
          `After:  Remove the \`${parsed.name}\` attribute.`,
        ].join('\n'),
      );
    } else if (parsed.kind === 'property_type_changed') {
      sections.push(
        [
          `### Type changed: \`${parsed.name}\` property`,
          '',
          `The type of \`${parsed.name}\` changed from \`${parsed.oldType}\` to \`${parsed.newType}\`.`,
          '',
          `Update \`${parsed.name}\` from \`${parsed.oldType}\` to \`${parsed.newType}\`.`,
        ].join('\n'),
      );
    } else if (parsed.kind === 'event_removed') {
      sections.push(
        [
          `### Removed: \`${parsed.name}\` event`,
          '',
          `The \`${parsed.name}\` event has been removed. Remove all listeners for this event.`,
          '',
          `Before: \`element.addEventListener('${parsed.name}', handler)\``,
          `After:  Remove the event listener.`,
        ].join('\n'),
      );
    } else {
      sections.push(`### Breaking change\n\n${parsed.raw}`);
    }
  }

  return sections.join('\n\n');
}

function renderAdditionsSection(additions: string[]): string {
  return additions.map((a) => `- ${a}`).join('\n');
}

export async function generateMigrationGuide(
  tagName: string,
  baseBranch: string,
  config: McpWcConfig,
  cem: Cem,
): Promise<MigrationGuide> {
  const diff = await diffCem(tagName, baseBranch, config, cem);

  if (diff.isNew) {
    const markdown = [
      `# Migration Guide: \`${tagName}\``,
      '',
      `This component is **new** on the current branch compared to \`${baseBranch}\`. No migration needed.`,
    ].join('\n');
    return { tagName, baseBranch, isNew: true, markdown };
  }

  const lines: string[] = [`# Migration Guide: \`${tagName}\``];

  if (diff.breaking.length === 0 && diff.additions.length === 0) {
    lines.push('', `No changes detected between this branch and \`${baseBranch}\`.`);
  } else {
    if (diff.breaking.length > 0) {
      lines.push('', '## Breaking Changes', '', renderBreakingSection(diff.breaking));
    }
    if (diff.additions.length > 0) {
      lines.push('', '## Non-Breaking Additions', '', renderAdditionsSection(diff.additions));
    }
  }

  const markdown = lines.join('\n');
  return { tagName, baseBranch, isNew: false, markdown };
}
