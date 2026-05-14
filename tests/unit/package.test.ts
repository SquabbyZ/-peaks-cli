import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const packagePath = resolve('package.json');
const binPath = resolve('bin', 'peaks.js');

describe('package publishing configuration', () => {
  test('publishes the CLI bin and its compiled entrypoint', async () => {
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as {
      bin: { peaks: string };
      files: string[];
      scripts: { prepack: string };
    };
    const binSource = await readFile(binPath, 'utf8');

    expect(packageJson.bin.peaks).toBe('./bin/peaks.js');
    expect(packageJson.files).toContain('bin/peaks.js');
    expect(packageJson.files).toContain('dist/src/cli/index.js');
    expect(packageJson.scripts.prepack).toBe('npm run build');
    expect(binSource).toContain("../dist/src/cli/index.js");
  });
});
