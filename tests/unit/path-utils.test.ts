import { describe, expect, test } from 'vitest';
import { tmpdir } from 'node:os';
import { getTempDir, localPath, normalizePath, pathsEqual } from '../../src/shared/path-utils.js';

describe('normalizePath', () => {
  test('converts backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\foo')).toBe('C:/Users/foo');
  });

  test('keeps forward slashes unchanged', () => {
    expect(normalizePath('/home/foo')).toBe('/home/foo');
  });
});

describe('pathsEqual', () => {
  test('returns true for same paths', () => {
    expect(pathsEqual('/foo/bar', '/foo/bar')).toBe(true);
  });

  test('returns true for paths with different separators', () => {
    expect(pathsEqual('/foo/bar', '\\foo\\bar')).toBe(true);
  });

  test('returns false for different paths', () => {
    expect(pathsEqual('/foo/bar', '/foo/baz')).toBe(false);
  });
});

describe('localPath', () => {
  test('converts to backslashes for Windows', () => {
    expect(localPath('C:/Users/foo', 'win32')).toBe('C:\\Users\\foo');
  });

  test('keeps forward slashes for non-Windows platforms', () => {
    expect(localPath('C:/Users/foo', 'darwin')).toBe('C:/Users/foo');
    expect(localPath('C:/Users/foo', 'linux')).toBe('C:/Users/foo');
  });
});

describe('getTempDir', () => {
  test('returns TEMP from process.env when no override is provided', () => {
    const previousTemp = process.env.TEMP;
    process.env.TEMP = 'C:\\Temp';

    expect(getTempDir()).toBe('C:\\Temp');

    if (previousTemp === undefined) {
      delete process.env.TEMP;
    } else {
      process.env.TEMP = previousTemp;
    }
  });

  test('returns TEMP when override env has TEMP', () => {
    expect(getTempDir({ env: { TEMP: 'C:\\Temp' } as NodeJS.ProcessEnv })).toBe('C:\\Temp');
  });

  test('returns TMP when TEMP is missing', () => {
    expect(getTempDir({ env: { TMP: '/tmp/custom' } as NodeJS.ProcessEnv })).toBe('/tmp/custom');
  });

  test('falls back to the system temp directory', () => {
    expect(getTempDir({ env: {} as NodeJS.ProcessEnv })).toBe(tmpdir());
  });
});
