import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { ConfigGetOptions, ConfigLayer, ConfigSetOptions, PeaksConfig, TokenRef, WorkspaceConfig } from './config-types.js';
import { DEFAULT_CONFIG } from './config-types.js';

function getUserConfigPath(): string {
  return resolve(homedir(), '.peaks', 'config.json');
}

function findProjectRoot(startPath: string): string | null {
  let current = resolve(startPath);
  let parent = dirname(current);

  while (current !== parent) {
    if (existsSync(resolve(current, '.peaks', 'config.json'))) {
      return current;
    }
    parent = current;
    current = dirname(parent);
  }

  return null;
}

function getProjectConfigPath(projectRoot: string | null): string | null {
  if (!projectRoot) return null;
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

export function readConfig(projectRoot?: string | null): PeaksConfig {
  const detectedRoot = projectRoot ?? findProjectRoot(process.cwd());
  const userPath = getUserConfigPath();
  const projectPath = getProjectConfigPath(detectedRoot);

  const userConfig = readJsonFile(userPath) ?? {};
  const projectConfig = readJsonFile(projectPath) ?? {};

  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    ...projectConfig
  } as PeaksConfig;
}

export function writeConfig(partial: Partial<PeaksConfig>, layer: ConfigLayer = 'user'): void {
  const userPath = getUserConfigPath();
  const projectRoot = findProjectRoot(process.cwd());
  const projectPath = getProjectConfigPath(projectRoot);

  if (layer === 'project' && projectPath) {
    ensureDir(dirname(projectPath));
    const existing = readJsonFile(projectPath) ?? {};
    const merged = { ...existing, ...partial };
    writeFileSync(projectPath, JSON.stringify(merged, null, 2), 'utf-8');
    return;
  }

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
  const projectConfig = readJsonFile(getProjectConfigPath(projectRoot)) ?? {};

  const merged: Record<string, unknown> = { ...userConfig, ...projectConfig };

  if (options.key !== undefined) {
    return getNestedValue(merged, options.key);
  }

  return merged;
}

export function setConfig(options: ConfigSetOptions): void {
  const projectRoot = findProjectRoot(process.cwd());
  const userPath = getUserConfigPath();
  const projectPath = getProjectConfigPath(projectRoot);

  const targetPath = options.layer === 'project' && projectPath ? projectPath : userPath;

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

export function addWorkspace(workspace: WorkspaceConfig, layer: ConfigLayer = 'user'): void {
  const config = readConfig();
  const existing = config.workspaces.findIndex((w) => w.workspaceId === workspace.workspaceId);
  if (existing >= 0) {
    config.workspaces[existing] = workspace;
  } else {
    config.workspaces = [...config.workspaces, workspace];
  }
  writeConfig({ workspaces: config.workspaces }, layer);
}

export function removeWorkspace(workspaceId: string, layer: ConfigLayer = 'user'): boolean {
  const config = readConfig();
  const idx = config.workspaces.findIndex((w) => w.workspaceId === workspaceId);
  if (idx < 0) return false;

  config.workspaces = config.workspaces.filter((w) => w.workspaceId !== workspaceId);

  if (config.currentWorkspace === workspaceId) {
    config.currentWorkspace = config.workspaces[0]?.workspaceId ?? null;
  }

  writeConfig({ workspaces: config.workspaces, currentWorkspace: config.currentWorkspace }, layer);
  return true;
}

export function setCurrentWorkspace(workspaceId: string): boolean {
  const config = readConfig();
  const exists = config.workspaces.some((w) => w.workspaceId === workspaceId);
  if (!exists) return false;

  writeConfig({ currentWorkspace: workspaceId });
  return true;
}

export function getCurrentWorkspaceConfig(): WorkspaceConfig | null {
  const config = readConfig();
  if (!config.currentWorkspace) return null;
  return getWorkspaceConfig(config.currentWorkspace);
}

export type { TokenRef, WorkspaceConfig, PeaksConfig, ConfigLayer };