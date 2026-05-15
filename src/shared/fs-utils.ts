import { isWindows } from './platform.js';
import { symlinkSync as nodeSymlinkSync, readlinkSync } from 'node:fs';

export function createSymlinkSync(target: string, linkPath: string): void {
  nodeSymlinkSync(target, linkPath, isWindows ? 'junction' : 'dir');
}

export function readSymlinkTarget(linkPath: string): string | null {
  try {
    return readlinkSync(linkPath);
  } catch {
    return null;
  }
}
