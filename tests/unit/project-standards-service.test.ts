import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createProjectStandardsInitPlan, executeProjectStandardsInit, summarizeProjectStandardsInitResult } from '../../src/services/standards/project-standards-service.js';

function createProjectRoot(prefix = 'peaks-standards-project-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('project standards service', () => {
  test('plans project-local standards writes without mutating the repository', () => {
    const projectRoot = createProjectRoot();
    writeFileSync(join(projectRoot, 'tsconfig.json'), '{}', 'utf8');

    const plan = createProjectStandardsInitPlan({ projectRoot });

    expect(plan.apply).toBe(false);
    expect(plan.language).toBe('typescript');
    expect(plan.source.sourceId).toBe('everything-claude-code');
    expect(plan.plannedWrites.map((write) => write.relativePath)).toEqual([
      'CLAUDE.md',
      '.claude/rules/common/code-review.md',
      '.claude/rules/common/coding-style.md',
      '.claude/rules/common/security.md',
      '.claude/rules/typescript/coding-style.md'
    ]);
    expect(plan.plannedWrites.every((write) => write.status === 'planned')).toBe(true);
    expect(existsSync(join(projectRoot, 'CLAUDE.md'))).toBe(false);
    expect(plan.skillPreflight.appliesTo).toEqual(['peaks-rd', 'peaks-qa', 'peaks-solo']);
    expect(plan.skillPreflight.summary).toContain('自动 preflight');
  });

  test('applies only missing standards files and preserves existing project standards', () => {
    const projectRoot = createProjectRoot();
    mkdirSync(join(projectRoot, '.claude', 'rules', 'common'), { recursive: true });
    writeFileSync(join(projectRoot, 'package.json'), '{}', 'utf8');
    writeFileSync(join(projectRoot, '.claude', 'rules', 'common', 'coding-style.md'), 'existing standard', 'utf8');

    const result = executeProjectStandardsInit({ projectRoot, language: 'javascript', apply: true });
    const summary = summarizeProjectStandardsInitResult(result);

    expect(result.language).toBe('javascript');
    expect(readFileSync(join(projectRoot, '.claude', 'rules', 'common', 'coding-style.md'), 'utf8')).toBe('existing standard');
    expect(result.plannedWrites.find((write) => write.relativePath === '.claude/rules/common/coding-style.md')?.status).toBe('exists');
    expect(summary.writtenFiles.map((file) => file.replaceAll('\\', '/'))).toEqual([
      'CLAUDE.md',
      '.claude/rules/common/code-review.md',
      '.claude/rules/common/security.md',
      '.claude/rules/javascript/coding-style.md'
    ]);
    expect(summary.skippedFiles).toEqual(['.claude/rules/common/coding-style.md']);
    expect(readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8')).toContain('peaks-rd');
    expect(readFileSync(join(projectRoot, '.claude', 'rules', 'common', 'code-review.md'), 'utf8')).toContain('everything-claude-code');
  });

  test('detects common project languages and falls back to generic standards', () => {
    const javascriptRoot = createProjectRoot('peaks-standards-javascript-');
    const pythonRoot = createProjectRoot('peaks-standards-python-');
    const goRoot = createProjectRoot('peaks-standards-go-');
    const rustRoot = createProjectRoot('peaks-standards-rust-');
    const genericRoot = createProjectRoot('peaks-standards-generic-');
    writeFileSync(join(javascriptRoot, 'package.json'), '{}', 'utf8');
    writeFileSync(join(pythonRoot, 'pyproject.toml'), '', 'utf8');
    writeFileSync(join(goRoot, 'go.mod'), '', 'utf8');
    writeFileSync(join(rustRoot, 'Cargo.toml'), '', 'utf8');

    expect(createProjectStandardsInitPlan({ projectRoot: javascriptRoot }).language).toBe('javascript');
    expect(createProjectStandardsInitPlan({ projectRoot: pythonRoot }).language).toBe('python');
    expect(createProjectStandardsInitPlan({ projectRoot: goRoot }).language).toBe('go');
    expect(createProjectStandardsInitPlan({ projectRoot: rustRoot }).language).toBe('rust');
    expect(createProjectStandardsInitPlan({ projectRoot: genericRoot }).language).toBe('generic');
  });

  test('rejects invalid language values and unsafe standards directories', () => {
    const invalidLanguageRoot = createProjectRoot('peaks-standards-invalid-language-');
    const unsafeProjectRoot = createProjectRoot();
    const nestedUnsafeProjectRoot = createProjectRoot('peaks-standards-nested-unsafe-');
    const outsideRoot = createProjectRoot('peaks-standards-outside-');
    const nestedOutsideRoot = createProjectRoot('peaks-standards-nested-outside-');
    symlinkSync(outsideRoot, join(unsafeProjectRoot, '.claude'), 'junction');
    mkdirSync(join(nestedUnsafeProjectRoot, '.claude', 'rules'), { recursive: true });
    symlinkSync(nestedOutsideRoot, join(nestedUnsafeProjectRoot, '.claude', 'rules', 'common'), 'junction');

    expect(() => createProjectStandardsInitPlan({ projectRoot: invalidLanguageRoot, language: 'type/script' })).toThrow('Unsupported standards language');
    expect(() => createProjectStandardsInitPlan({ projectRoot: unsafeProjectRoot, language: 'typescript' })).toThrow('Project standards directory must stay inside the project root');
    expect(() => executeProjectStandardsInit({ projectRoot: nestedUnsafeProjectRoot, language: 'typescript', apply: true })).toThrow('Project standards write target must stay inside the project root');
  });
});
