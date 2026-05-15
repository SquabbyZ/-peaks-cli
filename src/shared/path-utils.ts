import { isWindows } from './platform.js';

export const SEP = isWindows ? '\\' : '/';

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function pathsEqual(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

export function localPath(p: string): string {
  return isWindows ? p.replace(/\//g, '\\') : p;
}

export function getTempDir(): string {
  return process.env.TEMP ?? process.env.TMP ??
    (isWindows ? 'C:\\Temp' : '/tmp');
}