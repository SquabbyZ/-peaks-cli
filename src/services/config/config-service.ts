import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { repoRoot } from '../../shared/paths.js';
import { homedir } from 'node:os';
import type { ConfigGetOptions, ConfigLayer, ConfigSetOptions, MiniMaxProviderConfig, ModelProviderConfig, PeaksConfig, TokenRef, WorkspaceConfig } from './config-types.js';
import { DEFAULT_CONFIG } from './config-types.js';

function getUserConfigPath(): string {
  return resolve(homedir(), '.peaks', 'config.json');
}

function isInsidePath(childPath: string, parentPath: string): boolean {
  const relativePath = relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isSafeProjectConfigMarker(projectRoot: string): boolean {
  const peaksPath = resolve(projectRoot, '.peaks');
  const markerPath = resolve(peaksPath, 'config.json');
  try {
    const projectRootReal = realpathSync(projectRoot);
    const peaksReal = realpathSync(peaksPath);
    const markerReal = realpathSync(markerPath);
    if (!isInsidePath(peaksReal, projectRootReal)) return false;
    if (!isInsidePath(markerReal, projectRootReal)) return false;
    return isInsidePath(markerReal, peaksReal);
  } catch {
    return false;
  }
}

function findProjectRoot(startPath: string): string | null {
  let current = resolve(startPath);
  let parent = dirname(current);

  while (current !== parent) {
    if (existsSync(resolve(current, '.peaks', 'config.json')) && isSafeProjectConfigMarker(current)) {
      return current;
    }
    parent = current;
    current = dirname(parent);
  }

  const fallbackRoot = resolve(repoRoot);
  return existsSync(resolve(fallbackRoot, '.peaks', 'config.json')) && isSafeProjectConfigMarker(fallbackRoot) ? fallbackRoot : null;
}

function getProjectConfigPath(projectRoot: string | null): string | null {
  if (!projectRoot) return null;
  if (!isSafeProjectConfigMarker(projectRoot)) return null;
  return resolve(projectRoot, '.peaks', 'config.json');
}

function readJsonFile(path: string | null): Partial<PeaksConfig> | null {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Partial<PeaksConfig>;
  } catch {
    return null;
  }
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] as string;
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1] as string;
  current[last] = value;
}

function removeProjectProviderSecrets(config: Partial<PeaksConfig>): Partial<PeaksConfig> {
  const { providers, ...safeConfig } = config;
  return safeConfig;
}

export function isConfigLayer(value: string): value is ConfigLayer {
  return value === 'user' || value === 'project';
}

export function isSensitiveConfigPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized.includes('apikey') || normalized.includes('api-key') || normalized.includes('token') || normalized.includes('secret') || normalized.includes('password');
}

function isProviderConfigPath(path: string): boolean {
  return path === 'providers' || path.startsWith('providers.');
}

function isSecretKey(key: string): boolean {
  return isSensitiveConfigPath(key);
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username.length === 0 && url.password.length === 0;
  } catch {
    return false;
  }
}

function getMiniMaxBaseUrlCandidate(key: string, value: unknown): unknown {
  if (key === 'providers.minimax.baseUrl') {
    return value;
  }
  if (key === 'providers.minimax' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return (value as Partial<MiniMaxProviderConfig>).baseUrl;
  }
  if (key === 'providers' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return (value as Partial<ModelProviderConfig>).minimax?.baseUrl;
  }
  return undefined;
}

function validateMiniMaxBaseUrl(value: unknown): void {
  if (value !== undefined && (typeof value !== 'string' || !isHttpsUrl(value))) {
    throw new Error('MiniMax base URL must be an HTTPS URL without embedded credentials');
  }
}

function validateProviderConfig(partial: Partial<PeaksConfig>): void {
  validateMiniMaxBaseUrl(partial.providers?.minimax?.baseUrl);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toWorkspaceConfig(value: unknown): WorkspaceConfig | null {
  if (!isRecord(value)) return null;
  const { workspaceId, name, rootPath, installedCapabilityIds } = value;
  if (typeof workspaceId !== 'string' || typeof name !== 'string' || typeof rootPath !== 'string' || !Array.isArray(installedCapabilityIds) || !installedCapabilityIds.every((id) => typeof id === 'string')) {
    return null;
  }
  let artifactRepo: WorkspaceConfig['artifactRepo'];
  if (isRecord(value.artifactRepo) && (value.artifactRepo.provider === 'github' || value.artifactRepo.provider === 'gitlab') && typeof value.artifactRepo.owner === 'string' && typeof value.artifactRepo.name === 'string') {
    artifactRepo = { provider: value.artifactRepo.provider, owner: value.artifactRepo.owner, name: value.artifactRepo.name };
  }
  return artifactRepo ? { workspaceId, name, rootPath, installedCapabilityIds, artifactRepo } : { workspaceId, name, rootPath, installedCapabilityIds };
}

function toWorkspaceConfigs(value: unknown): WorkspaceConfig[] {
  return Array.isArray(value) ? value.map(toWorkspaceConfig).filter((workspace): workspace is WorkspaceConfig => workspace !== null) : [];
}

function toMiniMaxProviderConfig(value: unknown): MiniMaxProviderConfig {
  if (!isRecord(value)) return {};
  return {
    ...(typeof value.baseUrl === 'string' ? { baseUrl: value.baseUrl } : {}),
    ...(typeof value.apiKey === 'string' ? { apiKey: value.apiKey } : {})
  };
}

function toModelProviderConfig(value: unknown): ModelProviderConfig {
  if (!isRecord(value)) return {};
  return { minimax: toMiniMaxProviderConfig(value.minimax) };
}

function getProjectWritePath(): string {
  const projectPath = getProjectConfigPath(findProjectRoot(process.cwd()));
  if (!projectPath) {
    throw new Error('Project config not found');
  }
  return projectPath;
}

export function containsSensitiveConfigValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsSensitiveConfigValue);
  }
  if (value === null || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).some(([key, entry]) => isSecretKey(key) || containsSensitiveConfigValue(entry));
}

export type RedactedConfigValue = string | number | boolean | null | RedactedConfigValue[] | { [key: string]: RedactedConfigValue };

export function redactConfigSecrets(value: unknown): RedactedConfigValue {
  if (Array.isArray(value)) {
    return value.map((item) => redactConfigSecrets(item));
  }
  if (value === null || typeof value !== 'object') {
    return value as RedactedConfigValue;
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, isSecretKey(key) ? '***' : redactConfigSecrets(entry)]));
}

export type MiniMaxProviderStatus = {
  provider: 'minimax';
  configured: boolean;
  baseUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  storage: 'user-plaintext-v1';
  nextActions: string[];
};

function createMiniMaxProviderStatus(config: MiniMaxProviderConfig): MiniMaxProviderStatus {
  const baseUrlConfigured = typeof config.baseUrl === 'string' && config.baseUrl.trim().length > 0;
  const apiKeyConfigured = typeof config.apiKey === 'string' && config.apiKey.trim().length > 0;
  return {
    provider: 'minimax',
    configured: baseUrlConfigured && apiKeyConfigured,
    baseUrlConfigured,
    apiKeyConfigured,
    storage: 'user-plaintext-v1',
    nextActions: baseUrlConfigured && apiKeyConfigured ? [] : ['Run peaks config provider minimax set --base-url <url> --api-key <key>']
  };
}

export function getMiniMaxProviderConfig(): MiniMaxProviderConfig {
  return toMiniMaxProviderConfig(readJsonFile(getUserConfigPath())?.providers?.minimax);
}

export function getMiniMaxProviderStatus(): MiniMaxProviderStatus {
  return createMiniMaxProviderStatus(getMiniMaxProviderConfig());
}

export function setMiniMaxProviderConfig(input: MiniMaxProviderConfig): MiniMaxProviderStatus {
  validateMiniMaxBaseUrl(input.baseUrl);
  const userConfig = readJsonFile(getUserConfigPath()) ?? {};
  const existingProviders = toModelProviderConfig(userConfig.providers);
  const providers: ModelProviderConfig = {
    ...existingProviders,
    minimax: {
      ...existingProviders.minimax,
      ...input
    }
  };
  writeConfig({ providers }, 'user');
  return createMiniMaxProviderStatus(providers.minimax ?? {});
}

export function readConfig(projectRoot?: string | null): PeaksConfig {
  const detectedRoot = projectRoot ?? findProjectRoot(process.cwd());
  const userPath = getUserConfigPath();
  const projectPath = getProjectConfigPath(detectedRoot);

  const userConfig = readJsonFile(userPath) ?? {};
  const projectConfig = removeProjectProviderSecrets(readJsonFile(projectPath) ?? {});

  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    ...projectConfig
  } as PeaksConfig;
}

export function writeConfig(partial: Partial<PeaksConfig>, layer: ConfigLayer = 'user'): void {
  if (!isConfigLayer(layer)) {
    throw new Error('Invalid config layer');
  }
  if (layer === 'project' && (partial.providers !== undefined || containsSensitiveConfigValue(partial))) {
    throw new Error('Sensitive config keys must be stored in the user config layer');
  }
  validateProviderConfig(partial);

  if (layer === 'project') {
    const projectPath = getProjectWritePath();
    ensureDir(dirname(projectPath));
    const existing = readJsonFile(projectPath) ?? {};
    const merged = { ...existing, ...partial };
    writeFileSync(projectPath, JSON.stringify(merged, null, 2), 'utf-8');
    return;
  }

  const userPath = getUserConfigPath();
  ensureDir(dirname(userPath));
  const userPathDir = dirname(userPath);
  ensureDir(userPathDir);
  const existing = readJsonFile(userPath) ?? {};
  const merged = { ...existing, ...partial };
  writeFileSync(userPath, JSON.stringify(merged, null, 2), 'utf-8');
}

export function getConfig(options: ConfigGetOptions = {}): unknown {
  const projectRoot = findProjectRoot(process.cwd());
  const userConfig = readJsonFile(getUserConfigPath()) ?? {};
  const projectConfig = removeProjectProviderSecrets(readJsonFile(getProjectConfigPath(projectRoot)) ?? {});
  const source = options.layer === 'user' ? userConfig : options.layer === 'project' ? projectConfig : { ...userConfig, ...projectConfig };
  const config = source as Record<string, unknown>;

  if (options.key !== undefined) {
    return getNestedValue(config, options.key);
  }

  return config;
}

export function setConfig(options: ConfigSetOptions): void {
  const layer = options.layer ?? 'user';
  if (!isConfigLayer(layer)) {
    throw new Error('Invalid config layer');
  }
  if (layer === 'project' && (isProviderConfigPath(options.key) || isSensitiveConfigPath(options.key) || containsSensitiveConfigValue(options.value))) {
    throw new Error('Sensitive config keys must be stored in the user config layer');
  }
  validateMiniMaxBaseUrl(getMiniMaxBaseUrlCandidate(options.key, options.value));

  const targetPath = layer === 'project' ? getProjectWritePath() : getUserConfigPath();

  ensureDir(dirname(targetPath));
  const existing = readJsonFile(targetPath) ?? {};
  const updated = { ...existing };
  setNestedValue(updated, options.key, options.value);
  writeFileSync(targetPath, JSON.stringify(updated, null, 2), 'utf-8');
}

export function getWorkspaceConfig(workspaceId: string, projectRoot?: string | null): WorkspaceConfig | null {
  const config = readConfig(projectRoot ?? findProjectRoot(process.cwd()));
  return config.workspaces.find((w) => w.workspaceId === workspaceId) ?? null;
}

function readLayerConfig(layer: ConfigLayer): { currentWorkspace: string | null; workspaces: WorkspaceConfig[] } {
  const config = getConfig({ layer });
  return isRecord(config)
    ? {
      currentWorkspace: typeof config.currentWorkspace === 'string' ? config.currentWorkspace : null,
      workspaces: toWorkspaceConfigs(config.workspaces)
    }
    : { currentWorkspace: null, workspaces: [] };
}

export function addWorkspace(workspace: WorkspaceConfig, layer: ConfigLayer = 'user'): void {
  const config = readLayerConfig(layer);
  const workspaces = config.workspaces;
  const existing = workspaces.findIndex((w) => w.workspaceId === workspace.workspaceId);
  const updatedWorkspaces = existing >= 0
    ? workspaces.map((existingWorkspace) => existingWorkspace.workspaceId === workspace.workspaceId ? workspace : existingWorkspace)
    : [...workspaces, workspace];
  writeConfig({ workspaces: updatedWorkspaces }, layer);
}

export function removeWorkspace(workspaceId: string, layer: ConfigLayer = 'user'): boolean {
  const config = readLayerConfig(layer);
  const workspaces = config.workspaces;
  const idx = workspaces.findIndex((w) => w.workspaceId === workspaceId);
  if (idx < 0) return false;

  const updatedWorkspaces = workspaces.filter((w) => w.workspaceId !== workspaceId);
  const currentWorkspace = config.currentWorkspace === workspaceId ? updatedWorkspaces[0]?.workspaceId ?? null : config.currentWorkspace ?? null;

  writeConfig({ workspaces: updatedWorkspaces, currentWorkspace }, layer);
  return true;
}

export function setCurrentWorkspace(workspaceId: string, layer: ConfigLayer = 'user'): boolean {
  const config = readLayerConfig(layer);
  const workspaces = config.workspaces;
  const exists = workspaces.some((w) => w.workspaceId === workspaceId);
  if (!exists) return false;

  writeConfig({ currentWorkspace: workspaceId }, layer);
  return true;
}

export function getCurrentWorkspaceConfig(): WorkspaceConfig | null {
  const config = readConfig();
  if (!config.currentWorkspace) return null;
  return getWorkspaceConfig(config.currentWorkspace);
}

export type { TokenRef, WorkspaceConfig, PeaksConfig, ConfigLayer };