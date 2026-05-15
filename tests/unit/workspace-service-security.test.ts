import { beforeEach, describe, expect, test, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { WorkspaceConfig } from '../../src/services/config/config-types.js';

let currentWorkspace: WorkspaceConfig | null = null;
let localDirExists = false;
let execError: Error | null = null;
type ExecCall = { command: string; args: string[]; cwd?: string };
const execCalls: ExecCall[] = [];

vi.mock('../../src/services/config/config-service.js', () => ({
  getCurrentWorkspaceConfig: () => currentWorkspace,
  readConfig: () => ({ workspaces: currentWorkspace ? [currentWorkspace] : [] })
}));

vi.mock('../../src/shared/fs.js', () => ({
  pathExists: () => Promise.resolve(localDirExists)
}));

vi.mock('../../src/shared/process.js', () => ({
  execCommand: async (command: string, args: string[], options?: { cwd?: string }) => {
    const call: ExecCall = options?.cwd ? { command, args, cwd: options.cwd } : { command, args };
    execCalls.push(call);
    if (execError) throw execError;
    return 'ok';
  }
}));

const { executeArtifactSync } = await import('../../src/services/artifacts/workspace-service.js');

describe('executeArtifactSync security', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    localDirExists = false;
    execError = null;
    execCalls.length = 0;
    currentWorkspace = {
      workspaceId: 'ws-secure',
      name: 'Secure Workspace',
      rootPath: join(tmpdir(), `peaks-secure-${Date.now()}`),
      artifactRepo: { provider: 'github', owner: 'acme', name: 'artifact-repo' },
      installedCapabilityIds: []
    };
  });

  test('does not expose GH_TOKEN in returned sync details', async () => {
    vi.stubEnv('GH_TOKEN', 'secret-token');

    const result = await executeArtifactSync();

    expect(result.success).toBe(true);
    expect(result.remoteUrl).toBe('https://github.com/acme/artifact-repo.git');
    expect(result.commands.join('\n')).not.toContain('secret-token');
    expect(result.commands).toContain(`git clone https://github.com/acme/artifact-repo.git "${join((currentWorkspace as WorkspaceConfig).rootPath, '.peaks-artifacts')}"`);
    expect(execCalls[0]).toEqual({
      command: 'git',
      args: ['clone', 'https://x-access-token:secret-token@github.com/acme/artifact-repo.git', join((currentWorkspace as WorkspaceConfig).rootPath, '.peaks-artifacts')]
    });
  });

  test('redacts GH_TOKEN from sync errors', async () => {
    vi.stubEnv('GH_TOKEN', 'secret-token');
    execError = new Error('fatal: https://x-access-token:secret-token@github.com/acme/artifact-repo.git failed');

    const result = await executeArtifactSync();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Clone failed: fatal: https://x-access-token:***@github.com/acme/artifact-repo.git failed');
    expect(result.error).not.toContain('secret-token');
    expect(result.remoteUrl).toBe('https://github.com/acme/artifact-repo.git');
  });
});
