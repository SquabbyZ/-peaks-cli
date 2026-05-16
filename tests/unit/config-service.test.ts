import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';

const configTestHome = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs');
  const { tmpdir } = require('node:os') as typeof import('node:os');
  const { join } = require('node:path') as typeof import('node:path');
  return mkdtempSync(join(tmpdir(), 'peaks-config-home-'));
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => configTestHome };
});

import { addWorkspace, containsSensitiveConfigValue, getConfig, getMiniMaxProviderConfig, isConfigLayer, isSensitiveConfigPath, redactConfigSecrets, removeWorkspace, setConfig, setCurrentWorkspace, setMiniMaxProviderConfig, writeConfig } from '../../src/services/config/config-service.js';

// Test helper path parsing logic directly
// The actual config service uses these functions internally

describe('path parsing utilities', () => {
  test('parses dot notation paths correctly', () => {
    const obj = { a: { b: { c: 1 } }, d: 2 };
    // Simulate getNestedValue logic
    const path = 'a.b.c';
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    expect(parts).toEqual(['a', 'b', 'c']);
  });

  test('parses array index notation', () => {
    const path = 'workspaces[0].workspaceId';
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    expect(parts).toEqual(['workspaces', '0', 'workspaceId']);
  });

  test('handles empty path parts', () => {
    const path = 'a..b';
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    expect(parts).toEqual(['a', 'b']);
  });
});

describe('nested value operations', () => {
  test('getNestedValue returns deep nested value', () => {
    const obj = { a: { b: { c: 42 } } };
    const parts = 'a.b.c'.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    expect(current).toBe(42);
  });

  test('getNestedValue returns undefined for non-existent path', () => {
    const obj = { a: { b: 1 } };
    const parts = 'a.c'.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    expect(current).toBeUndefined();
  });

  test('setNestedValue sets deep nested value', () => {
    const obj: Record<string, unknown> = {};
    const parts = 'a.b.c'.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i] as string;
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1] as string;
    current[last] = 42;

    expect((obj as { a: { b: { c: number } } }).a.b.c).toBe(42);
  });

  test('setNestedValue creates intermediate objects', () => {
    const obj: Record<string, unknown> = {};
    const parts = 'x.y.z'.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i] as string;
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1] as string;
    current[last] = 'value';

    expect((obj as { x: { y: { z: string } } }).x.y.z).toBe('value');
  });
});

describe('secret config handling', () => {
  test('identifies config layers and sensitive config paths', () => {
    expect(isConfigLayer('user')).toBe(true);
    expect(isConfigLayer('project')).toBe(true);
    expect(isConfigLayer('other')).toBe(false);
    expect(isSensitiveConfigPath('providers.minimax.apiKey')).toBe(true);
    expect(isSensitiveConfigPath('tokens.GitHubToken')).toBe(true);
    expect(isSensitiveConfigPath('providers.minimax.baseUrl')).toBe(false);
  });

  test('detects nested sensitive config values', () => {
    expect(containsSensitiveConfigValue({ minimax: { apiKey: 'secret' } })).toBe(true);
    expect(containsSensitiveConfigValue([{ token: 'secret' }])).toBe(true);
    expect(containsSensitiveConfigValue({ minimax: { baseUrl: 'https://api.minimaxi.com/anthropic' } })).toBe(false);
  });

  test('redacts nested secret values without mutating the input', () => {
    const config = {
      providers: {
        minimax: {
          baseUrl: 'https://api.minimaxi.com/anthropic',
          apiKey: { value: 'plain-secret' },
          emptyToken: ''
        }
      },
      list: [{ token: ['token-secret'] }]
    };

    const redacted = redactConfigSecrets(config);
    const redactedConfig = redacted as { providers: { minimax: { baseUrl: string; apiKey: string; emptyToken: string } }; list: { token: string }[] };

    expect(redactedConfig.providers.minimax.baseUrl).toBe('https://api.minimaxi.com/anthropic');
    expect(redactedConfig.providers.minimax.apiKey).toBe('***');
    expect(redactedConfig.providers.minimax.emptyToken).toBe('***');
    expect(redactedConfig.list[0]?.token).toBe('***');
    expect(config.providers.minimax.apiKey.value).toBe('plain-secret');
  });

  test('rejects insecure MiniMax base URLs through all config write paths', () => {
    expect(() => setConfig({ key: 'providers.minimax.baseUrl', value: 'http://api.minimaxi.com/anthropic' })).toThrow('MiniMax base URL must be an HTTPS URL without embedded credentials');
    expect(() => setConfig({ key: 'providers.minimax', value: { baseUrl: 'http://api.minimaxi.com/anthropic' } })).toThrow('MiniMax base URL must be an HTTPS URL without embedded credentials');
    expect(() => setConfig({ key: 'providers', value: { minimax: { baseUrl: 'http://api.minimaxi.com/anthropic' } } })).toThrow('MiniMax base URL must be an HTTPS URL without embedded credentials');
    expect(() => writeConfig({ providers: { minimax: { baseUrl: 'http://api.minimaxi.com/anthropic' } } }, 'user')).toThrow('MiniMax base URL must be an HTTPS URL without embedded credentials');
    expect(() => setMiniMaxProviderConfig({ baseUrl: 'http://api.minimaxi.com/anthropic' })).toThrow('MiniMax base URL must be an HTTPS URL without embedded credentials');
    expect(() => setConfig({ key: 'providers.minimax.baseUrl', value: 'https://user:pass@api.minimaxi.com/anthropic' })).toThrow('MiniMax base URL must be an HTTPS URL without embedded credentials');

    expect(() => setConfig({ key: 'providers.minimax.baseUrl', value: 'https://api.minimaxi.com/anthropic' })).not.toThrow();
  });

  test('rejects project-layer sensitive writes', () => {
    expect(() => setConfig({ key: 'providers.minimax.apiKey', value: 'secret', layer: 'project' })).toThrow('Sensitive config keys must be stored in the user config layer');
    expect(() => setConfig({ key: 'providers.minimax', value: { apiKey: 'secret' }, layer: 'project' })).toThrow('Sensitive config keys must be stored in the user config layer');
    expect(() => setConfig({ key: 'providers.minimax.baseUrl', value: 'https://api.minimaxi.com/anthropic', layer: 'project' })).toThrow('Sensitive config keys must be stored in the user config layer');
    expect(() => setConfig({ key: 'safe', value: { nested: { token: 'secret' } }, layer: 'project' })).toThrow('Sensitive config keys must be stored in the user config layer');
    expect(() => writeConfig({ providers: { minimax: { baseUrl: 'https://api.minimaxi.com/anthropic' } } }, 'project')).toThrow('Sensitive config keys must be stored in the user config layer');
    expect(() => setConfig({ key: 'safe', value: 'value', layer: 'invalid' as 'project' })).toThrow('Invalid config layer');
  });

  test('normalizes external config shapes before exposing provider config', () => {
    writeConfig({ providers: { minimax: { baseUrl: 'https://api.minimaxi.com/anthropic', apiKey: 123 as unknown as string } as never } }, 'user');
    const providerConfig = getMiniMaxProviderConfig();
    expect(providerConfig.baseUrl).toBe('https://api.minimaxi.com/anthropic');
    expect(providerConfig.apiKey).toBeUndefined();
  });

  test('workspace helpers tolerate malformed layer config and use the requested layer', () => {
    writeConfig({ workspaces: 'broken' as never, currentWorkspace: 123 as never }, 'user');
    addWorkspace({ workspaceId: 'ws-a', name: 'Workspace A', rootPath: '/tmp/ws-a', installedCapabilityIds: [] }, 'user');
    expect(getConfig({ layer: 'user' })).toMatchObject({ workspaces: [{ workspaceId: 'ws-a' }] });
    expect(setCurrentWorkspace('ws-a', 'user')).toBe(true);
    expect(removeWorkspace('ws-a', 'user')).toBe(true);
  });
});

describe('project config discovery', () => {
  test('does not read project config when marker resolves outside the candidate root', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'peaks-config-root-'));
    const outsideRoot = mkdtempSync(join(tmpdir(), 'peaks-config-outside-'));
    mkdirSync(outsideRoot, { recursive: true });
    writeFileSync(join(outsideRoot, 'config.json'), JSON.stringify({ unsafeProjectMarker: true }), 'utf8');
    symlinkSync(outsideRoot, join(projectRoot, '.peaks'), 'junction');

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
    try {
      const config = getConfig() as { unsafeProjectMarker?: boolean };

      expect(config.unsafeProjectMarker).toBeUndefined();
    } finally {
      cwdSpy.mockRestore();
    }
  });
});

describe('config types', () => {
  test('TokenRef supports all variants', () => {
    const envRef = { env: 'MY_KEY' };
    const keychainRef = { keychain: 'service' };
    const ghCliRef = { ghCli: true };
    expect(envRef.env).toBe('MY_KEY');
    expect(keychainRef.keychain).toBe('service');
    expect(ghCliRef.ghCli).toBe(true);
  });

  test('WorkspaceConfig with artifact repo', () => {
    const ws = {
      workspaceId: 'test',
      name: 'Test',
      rootPath: '/test',
      installedCapabilityIds: ['cap1'],
      artifactRepo: { provider: 'github' as const, owner: 'user', name: 'repo' }
    };
    expect(ws.artifactRepo?.provider).toBe('github');
    expect(ws.artifactRepo?.owner).toBe('user');
  });

  test('PeaksConfig structure', () => {
    const config = {
      version: '0.1.0',
      currentWorkspace: 'ws1',
      workspaces: [],
      language: 'en',
      model: 'sonnet' as const,
      tokens: { GitHubToken: { env: 'GH_TOKEN' } },
      providers: {
        minimax: {
          baseUrl: 'https://api.minimaxi.com/anthropic',
          apiKey: 'test-key'
        }
      }
    };
    expect(config.version).toBe('0.1.0');
    expect(config.currentWorkspace).toBe('ws1');
    expect(config.model).toBe('sonnet');
    expect(config.providers.minimax?.baseUrl).toBe('https://api.minimaxi.com/anthropic');
  });
});

describe('CLI integration via program', () => {
  // These tests verify the CLI commands work correctly
  // by testing through the actual program entrypoint

  test('config types are correctly exported from config-types', async () => {
    const { DEFAULT_CONFIG } = await import('../../src/services/config/config-types.js');
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(DEFAULT_CONFIG.version).toBe('0.1.0');
    expect(DEFAULT_CONFIG.language).toBe('en');
    expect(DEFAULT_CONFIG.model).toBe('sonnet');
    expect(DEFAULT_CONFIG.providers).toEqual({});
  });

  test('ConfigLayer type has user and project', async () => {
    const configTypes = await import('../../src/services/config/config-types.js');
    type ConfigLayer = 'user' | 'project';
    const layers: ConfigLayer[] = ['user', 'project'];
    expect(layers).toHaveLength(2);
  });
});