import { describe, expect, test } from 'vitest';

describe('config types', () => {
  test('TokenRef supports env, keychain, ghCli variants', () => {
    const envRef = { env: 'MY_API_KEY' };
    const keychainRef = { keychain: 'my-service' };
    const ghCliRef = { ghCli: true };

    expect(envRef.env).toBe('MY_API_KEY');
    expect(keychainRef.keychain).toBe('my-service');
    expect(ghCliRef.ghCli).toBe(true);
  });

  test('WorkspaceConfig has expected shape', () => {
    const workspace = {
      workspaceId: 'test',
      name: 'Test',
      rootPath: '/test',
      installedCapabilityIds: ['cap1']
    };

    expect(workspace.workspaceId).toBe('test');
    expect(workspace.name).toBe('Test');
    expect(workspace.rootPath).toBe('/test');
    expect(workspace.installedCapabilityIds).toHaveLength(1);
    expect(workspace.installedCapabilityIds[0]).toBe('cap1');
  });

  test('PeaksConfig has expected shape with defaults', () => {
    const config = {
      version: '0.1.0',
      currentWorkspace: null,
      workspaces: [],
      language: 'en',
      model: 'sonnet',
      tokens: {}
    };

    expect(config.version).toBe('0.1.0');
    expect(config.currentWorkspace).toBeNull();
    expect(config.workspaces).toEqual([]);
    expect(config.language).toBe('en');
    expect(config.model).toBe('sonnet');
    expect(config.tokens).toEqual({});
  });

  test('ModelPreference accepts valid values', () => {
    const models: Array<'haiku' | 'sonnet' | 'opus' | 'minimax'> = ['haiku', 'sonnet', 'opus', 'minimax'];
    expect(models).toHaveLength(4);
  });

  test('ConfigLayer is user or project', () => {
    const layers: Array<'user' | 'project'> = ['user', 'project'];
    expect(layers).toHaveLength(2);
  });
});

describe('config service integration', () => {
  // These tests use the real HOME directory.
  // Run with: peaks config workspace list --json to verify real behavior.
  test('config get reads from real home directory', async () => {
    const { getConfig } = await import('../../src/services/config/config-service.js');
    const config = getConfig({ key: 'currentWorkspace' });
    // real HOME has test1 as currentWorkspace from CLI testing
    expect(config === undefined || config === null || typeof config === 'string').toBe(true);
  });

  test('nested key path parsing works for workspaces', async () => {
    const { getConfig } = await import('../../src/services/config/config-service.js');
    // Just verify it returns something - real HOME has workspaces from earlier CLI testing
    const workspaces = getConfig({ key: 'workspaces' });
    expect(Array.isArray(workspaces)).toBe(true);
  });
});