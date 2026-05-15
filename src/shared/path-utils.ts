import { sep } from 'node:path';
import { tmpdir } from 'node:os';
import { platform, type Platform } from './platform.js';

export const SEP = sep;

const localPathConverters: Record<Platform, (p: string) => string> = {
  win32: (p) => p.replace(/\//g, '\\'),
  darwin: (p) => p,
  linux: (p) => p
};

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function pathsEqual(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

export function localPath(p: string, targetPlatform: Platform = platform): string {
  return localPathConverters[targetPlatform](p);
}

export function getTempDir(options?: { env?: NodeJS.ProcessEnv }): string {
  const env = options?.env ?? process.env;
  if (env.TEMP) return env.TEMP;
  if (env.TMP) return env.TMP;
  return tmpdir();
}