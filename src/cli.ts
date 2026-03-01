import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// --- Framework detection ---

interface Framework {
  name: string;
  packages: string[];
}

const FRAMEWORKS: Framework[] = [
  { name: 'Lit 3.x', packages: ['lit'] },
  { name: 'Stencil', packages: ['@stencil/core'] },
  { name: 'Shoelace', packages: ['@shoelace-style/shoelace'] },
  { name: 'FAST Element', packages: ['@microsoft/fast-element'] },
  { name: 'Haunted', packages: ['haunted'] },
  { name: 'Hybrids', packages: ['hybrids'] },
  { name: 'Catalyst', packages: ['@github/catalyst'] },
];

function detectFramework(projectRoot: string): string | null {
  const pkgPath = resolve(projectRoot, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
    const deps: Record<string, string> = {
      ...((pkg['dependencies'] as Record<string, string>) ?? {}),
      ...((pkg['devDependencies'] as Record<string, string>) ?? {}),
      ...((pkg['peerDependencies'] as Record<string, string>) ?? {}),
    };
    for (const fw of FRAMEWORKS) {
      if (fw.packages.some((p) => p in deps)) return fw.name;
    }
    return null;
  } catch {
    return null;
  }
}

// --- CEM auto-discovery ---

const CEM_CANDIDATES = [
  'custom-elements.json',
  'dist/custom-elements.json',
  'dist/custom-elements-manifest.json',
  'custom-elements-manifest.json',
  '.storybook/custom-elements.json',
];

function discoverCem(projectRoot: string): string | null {
  for (const candidate of CEM_CANDIDATES) {
    if (existsSync(resolve(projectRoot, candidate))) return candidate;
  }
  return null;
}

// --- Init flow ---

export async function runInit(projectRoot: string = process.cwd()): Promise<void> {
  const isTTY = Boolean(process.stdin.isTTY);

  // For non-TTY (piped) input, read all stdin upfront to avoid readline
  // race conditions where both newlines are consumed before the second
  // question() callback is registered.
  const inputLines: string[] = [];
  let lineIdx = 0;

  if (!isTTY) {
    await new Promise<void>((res) => {
      let buf = '';
      process.stdin.on('data', (chunk: Buffer | string) => {
        buf += chunk.toString();
      });
      process.stdin.on('end', () => {
        inputLines.push(...buf.split('\n'));
        res();
      });
      process.stdin.resume();
    });
  }

  const rl = isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;

  async function prompt(question: string): Promise<string> {
    if (!isTTY) {
      const answer = inputLines[lineIdx++] ?? '';
      // Echo question + answer so output matches interactive appearance
      process.stdout.write(question + answer + '\n');
      return answer;
    }
    if (rl === null) return '';
    return new Promise((res) => rl.question(question, res));
  }

  try {
    // Step 1: Detect framework
    const framework = detectFramework(projectRoot);
    if (framework) {
      process.stdout.write(`\u2713 Detected: ${framework} (found in package.json)\n`);
    } else {
      process.stdout.write('  No known framework detected in package.json\n');
    }

    // Step 2: Auto-discover CEM
    const discovered = discoverCem(projectRoot);
    let cemPath: string;

    if (discovered) {
      const answer = await prompt(`\u2713 Found CEM: ${discovered}. Use this? [Y/n] `);
      const use = answer.trim() === '' || /^y/i.test(answer.trim());
      if (use) {
        cemPath = discovered;
      } else {
        const custom = await prompt('  Enter CEM path: ');
        cemPath = custom.trim() || 'custom-elements.json';
      }
    } else {
      const custom = await prompt(
        '  CEM not auto-detected. Enter path (default: custom-elements.json): ',
      );
      cemPath = custom.trim() || 'custom-elements.json';
    }

    // Step 3: Ask about design tokens
    const tokensAnswer = await prompt(
      '  Do you have a design tokens file? (e.g. tokens.json) [path or skip]: ',
    );
    const tokensPath = tokensAnswer.trim() || null;

    // Step 4: Write mcpwc.config.json
    const configObj = {
      cemPath,
      projectRoot,
      componentPrefix: '',
      healthHistoryDir: '.mcp-wc/health',
      tsconfigPath: 'tsconfig.json',
      tokensPath,
    };

    const configPath = resolve(projectRoot, 'mcpwc.config.json');
    writeFileSync(configPath, JSON.stringify(configObj, null, 2) + '\n');
    process.stdout.write(`\u2713 Written: mcpwc.config.json\n`);

    // Step 5: Print copy-paste snippets
    const snippet = {
      mcpServers: {
        'wc-mcp': {
          command: 'npx',
          args: ['wc-mcp'],
          cwd: projectRoot,
        },
      },
    };

    const snippetJson = JSON.stringify(snippet, null, 2);

    process.stdout.write(`
Add this to your Claude Desktop config (~/.claude/claude_desktop_config.json):

${snippetJson}

For Cursor (~/.cursor/mcp.json) or VS Code (.vscode/mcp.json), use the same snippet.
`);
  } finally {
    rl?.close();
  }
}
