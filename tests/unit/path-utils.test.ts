import { describe, expect, test } from 'vitest';
import { normalizePath, pathsEqual, localPath, getTempDir } from '../../src/shared/path-utils.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  test('converts to backslashes on Windows', () => {
    const result = localPath('C:/Users/foo');
    expect(result).toBe('C:\\Users\\foo');
  });
});

describe('getTempDir', () => {
  test('returns temp directory', () => {
    const temp = getTempDir();
    expect(temp).toBeTruthy();
    expect(temp.length).toBeGreaterThan(0);
  });
});
