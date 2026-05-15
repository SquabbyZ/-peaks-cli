import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { createSymlinkSync, readSymlinkTarget } from '../../src/shared/fs-utils.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('createSymlinkSync', () => {
  const testDir = join(process.env.TEMP ?? '/tmp', `fs-utils-test-${Date.now()}`);
  beforeEach(() => mkdirSync(testDir, { recursive: true }));
  afterEach(() => {
    try { rmSync(testDir, { recursive: true }); } catch { /* ignore */ }
  });

  test('creates symlink on unix or junction on windows', () => {
    const target = join(testDir, 'target.txt');
    const link = join(testDir, 'link.txt');
    writeFileSync(target, 'content', 'utf-8');
    createSymlinkSync(target, link);
    expect(readSymlinkTarget(link)).toBeTruthy();
  });
});

describe('readSymlinkTarget', () => {
  test('returns null for non-existent path', () => {
    expect(readSymlinkTarget('/non/existent')).toBeNull();
  });
});
