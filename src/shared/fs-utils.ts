import { isWindows } from './platform.js';
import { symlinkSync as nodeSymlinkSync, readlinkSync } from 'node:fs';

export function createSymlinkSync(target: string, linkPath: string): void {
  if (isWindows) {
    nodeSymlinkSync(target, linkPath, 'junction');
  } else {
    nodeSymlinkSync(target, linkPath);
  }
}

export function readSymlinkTarget(linkPath: string): string | null {
  try {
    return readlinkSync(linkPath);
  } catch {
    return null;
  }
}
