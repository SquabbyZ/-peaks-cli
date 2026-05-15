import { describe, expect, test } from 'vitest';
import { platform, isWindows, isMac, isLinux } from '../../src/shared/platform.js';

describe('platform detection', () => {
  test('platform is one of supported values', () => {
    expect(['win32', 'darwin', 'linux']).toContain(platform);
  });

  test('isWindows is boolean', () => {
    expect(typeof isWindows).toBe('boolean');
  });

  test('isMac is boolean', () => {
    expect(typeof isMac).toBe('boolean');
  });

  test('isLinux is boolean', () => {
    expect(typeof isLinux).toBe('boolean');
  });

  test('only one platform is true', () => {
    const platforms = [isWindows, isMac, isLinux];
    expect(platforms.filter(Boolean)).toHaveLength(1);
  });
});