export type Platform = 'win32' | 'darwin' | 'linux';

function detectPlatform(): Platform {
  const p = process.platform;
  if (p === 'win32') return 'win32';
  if (p === 'darwin') return 'darwin';
  return 'linux';
}

export const platform: Platform = detectPlatform();
export const isWindows = platform === 'win32';
export const isMac = platform === 'darwin';
export const isLinux = platform === 'linux';