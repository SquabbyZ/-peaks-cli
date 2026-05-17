import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export type StandardsLanguage = 'generic' | 'typescript' | 'javascript' | 'python' | 'go' | 'rust';
export type StandardsWriteStatus = 'planned' | 'exists' | 'written';

export type StandardsWrite = {
  readonly relativePath: string;
  readonly filePath: string;
  readonly content: string;
  readonly status: StandardsWriteStatus;
};

export type ProjectStandardsSource = {
  readonly sourceId: 'everything-claude-code';
  readonly url: 'https://github.com/affaan-m/everything-claude-code';
  readonly usage: 'curated-baseline-reference';
};

export type StandardsSkillPreflight = {
  readonly appliesTo: readonly ['peaks-rd', 'peaks-qa', 'peaks-solo'];
  readonly summary: string;
};

export type ProjectStandardsInitPlan = {
  readonly apply: boolean;
  readonly projectRoot: string;
  readonly language: StandardsLanguage;
  readonly source: ProjectStandardsSource;
  readonly skillPreflight: StandardsSkillPreflight;
  readonly plannedWrites: StandardsWrite[];
};

export type ProjectStandardsInitResult = ProjectStandardsInitPlan & {
  readonly writtenFiles: string[];
};

export type ProjectStandardsInitSummary = {
  readonly apply: boolean;
  readonly projectRoot: string;
  readonly language: StandardsLanguage;
  readonly source: ProjectStandardsSource;
  readonly skillPreflight: StandardsSkillPreflight;
  readonly plannedWrites: Array<Pick<StandardsWrite, 'relativePath' | 'status'>>;
  readonly writtenFiles: string[];
  readonly skippedFiles: string[];
};

type ProjectStandardsInitOptions = {
  readonly projectRoot: string;
  readonly language?: string;
  readonly apply?: boolean;
};

type StandardsTemplate = {
  readonly relativePath: string;
  readonly content: string;
};

const SOURCE: ProjectStandardsSource = {
  sourceId: 'everything-claude-code',
  url: 'https://github.com/affaan-m/everything-claude-code',
  usage: 'curated-baseline-reference'
};

const SKILL_PREFLIGHT: StandardsSkillPreflight = {
  appliesTo: ['peaks-rd', 'peaks-qa', 'peaks-solo'],
  summary: 'peaks-rd、peaks-qa、peaks-solo 进入代码仓工作流时自动 preflight 项目规范。'
};

const SUPPORTED_LANGUAGES = new Set<StandardsLanguage>(['generic', 'typescript', 'javascript', 'python', 'go', 'rust']);

function normalizeRoot(path: string): string {
  return realpathSync(resolve(path));
}

function isInsidePath(childPath: string, parentPath: string): boolean {
  const rel = relative(parentPath, childPath);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function assertDirectoryNotSymlink(path: string): void {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    throw new Error('Project standards directory must stay inside the project root');
  }
}

function assertRealPathInsideProject(path: string, projectRoot: string): void {
  if (!isInsidePath(realpathSync(path), projectRoot)) {
    throw new Error('Project standards write target must stay inside the project root');
  }
}

function assertSafeStandardsRoot(projectRoot: string): string {
  const resolvedRoot = normalizeRoot(projectRoot);
  const claudeDir = join(resolvedRoot, '.claude');
  const rulesDir = join(claudeDir, 'rules');
  assertDirectoryNotSymlink(claudeDir);
  assertDirectoryNotSymlink(rulesDir);

  if (existsSync(rulesDir)) {
    assertRealPathInsideProject(rulesDir, resolvedRoot);
    return realpathSync(rulesDir);
  }

  return rulesDir;
}

function parseLanguage(value: string): StandardsLanguage {
  const normalized = value.trim().toLowerCase();
  if (SUPPORTED_LANGUAGES.has(normalized as StandardsLanguage)) {
    return normalized as StandardsLanguage;
  }
  throw new Error('Unsupported standards language');
}

function detectLanguage(projectRoot: string): StandardsLanguage {
  if (existsSync(join(projectRoot, 'tsconfig.json'))) return 'typescript';
  if (existsSync(join(projectRoot, 'package.json'))) return 'javascript';
  if (existsSync(join(projectRoot, 'pyproject.toml')) || existsSync(join(projectRoot, 'requirements.txt'))) return 'python';
  if (existsSync(join(projectRoot, 'go.mod'))) return 'go';
  if (existsSync(join(projectRoot, 'Cargo.toml'))) return 'rust';
  return 'generic';
}

function renderHeader(title: string): string {
  return [
    `# ${title}`,
    '',
    'Source: Peaks curated baseline; everything-claude-code reference: https://github.com/affaan-m/everything-claude-code',
    'Scope: project-local standards for peaks-rd, peaks-qa, and peaks-solo workflow preflight.',
    ''
  ].join('\n');
}

function renderClaudeMd(language: StandardsLanguage): string {
  return [
    '# Project Instructions',
    '',
    'This repository uses project-local Peaks standards. Existing repository conventions override generic generated guidance.',
    '',
    'Peaks workflow automation:',
    '- peaks-rd checks these standards before RD planning or implementation work.',
    '- peaks-qa checks code review and security guidance before verification work.',
    '- peaks-solo summarizes RD and QA standards preflight before end-to-end code workflows.',
    '',
    'Rules:',
    '- Read `.claude/rules/common/coding-style.md` before editing code.',
    '- Read `.claude/rules/common/code-review.md` before reviewing changes.',
    '- Read `.claude/rules/common/security.md` before touching filesystem, user input, external calls, auth, or secrets.',
    `- Read \`.claude/rules/${language}/coding-style.md\` for language-specific standards when applicable.`,
    '',
    'External reference: https://github.com/affaan-m/everything-claude-code is used as a curated reference only. Do not execute or install external content without explicit approval.',
    ''
  ].join('\n');
}

function renderCommonCodingStyle(): string {
  return `${renderHeader('Common Coding Standards')}- Prefer simple, readable code over clever abstractions.
- Keep functions focused and files cohesive.
- Use immutable updates unless a language-specific convention explicitly favors mutation.
- Validate user input, external data, file paths, and configuration at system boundaries.
- Preserve existing project conventions when they are stricter than this baseline.
`;
}

function renderCodeReview(): string {
  return `${renderHeader('Code Review Standards')}- Review diffs for correctness, maintainability, test coverage, and regression risk.
- Treat missing tests for changed behavior as a blocker unless the change is documentation-only.
- Verify code paths that handle filesystem, external APIs, credentials, user input, or generated artifacts.
- peaks-qa must use this guidance as part of code workflow preflight and final verification.
`;
}

function renderSecurity(): string {
  return `${renderHeader('Security Review Standards')}- Never hardcode secrets, API keys, passwords, tokens, or credentials.
- Do not send private code or secrets to external services without explicit user authorization.
- Guard filesystem writes against path traversal, symlink, and junction escapes.
- Require explicit confirmation for destructive actions, external state changes, and credential use.
`;
}

function renderLanguageCodingStyle(language: StandardsLanguage): string {
  const languageName = language === 'generic' ? 'Generic' : language[0]!.toUpperCase() + language.slice(1);
  const typeSafetyRule = language === 'typescript' || language === 'javascript'
    ? '- Do not add new `any` types; use explicit domain types, generics, or `unknown` with narrowing.\n'
    : '';
  return `${renderHeader(`${languageName} Coding Standards`)}- Apply project-local conventions before generic ${language} guidance.
- Keep public APIs typed or documented according to ${language} ecosystem norms.
${typeSafetyRule}- Prefer standard tooling and existing project scripts for formatting, linting, tests, and coverage.
- peaks-rd must check this file before planning code changes in ${language} projects.
`;
}

function createTemplates(language: StandardsLanguage): StandardsTemplate[] {
  return [
    { relativePath: 'CLAUDE.md', content: renderClaudeMd(language) },
    { relativePath: '.claude/rules/common/code-review.md', content: renderCodeReview() },
    { relativePath: '.claude/rules/common/coding-style.md', content: renderCommonCodingStyle() },
    { relativePath: '.claude/rules/common/security.md', content: renderSecurity() },
    { relativePath: `.claude/rules/${language}/coding-style.md`, content: renderLanguageCodingStyle(language) }
  ];
}

function buildWrite(projectRoot: string, template: StandardsTemplate): StandardsWrite {
  const filePath = resolve(projectRoot, template.relativePath);
  return {
    ...template,
    filePath,
    status: existsSync(filePath) ? 'exists' : 'planned'
  };
}

function writeNewFile(path: string, content: string): void {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    writeFileSync(fd, content, 'utf8');
  } finally {
    closeSync(fd);
  }
}

export function createProjectStandardsInitPlan(options: ProjectStandardsInitOptions): ProjectStandardsInitPlan {
  const projectRoot = normalizeRoot(options.projectRoot);
  assertSafeStandardsRoot(projectRoot);
  const language = options.language === undefined ? detectLanguage(projectRoot) : parseLanguage(options.language);
  const plannedWrites = createTemplates(language).map((template) => buildWrite(projectRoot, template));

  return {
    apply: options.apply ?? false,
    projectRoot,
    language,
    source: SOURCE,
    skillPreflight: SKILL_PREFLIGHT,
    plannedWrites
  };
}

export function executeProjectStandardsInit(options: ProjectStandardsInitOptions): ProjectStandardsInitResult {
  const plan = createProjectStandardsInitPlan(options);
  const writtenFiles: string[] = [];

  if (plan.apply) {
    assertSafeStandardsRoot(plan.projectRoot);
    for (const write of plan.plannedWrites) {
      if (write.status === 'exists') continue;
      const targetPath = resolve(write.filePath);
      const targetDir = dirname(targetPath);
      mkdirSync(targetDir, { recursive: true });
      assertRealPathInsideProject(targetDir, plan.projectRoot);
      writeNewFile(targetPath, write.content);
      writtenFiles.push(write.relativePath);
    }
  }

  return {
    ...plan,
    plannedWrites: plan.plannedWrites.map((write) => writtenFiles.includes(write.relativePath) ? { ...write, status: 'written' } : write),
    writtenFiles
  };
}

export function summarizeProjectStandardsInitResult(result: ProjectStandardsInitResult): ProjectStandardsInitSummary {
  return {
    apply: result.apply,
    projectRoot: result.projectRoot,
    language: result.language,
    source: result.source,
    skillPreflight: result.skillPreflight,
    plannedWrites: result.plannedWrites.map((write) => ({ relativePath: write.relativePath, status: write.status })),
    writtenFiles: result.writtenFiles,
    skippedFiles: result.plannedWrites.filter((write) => write.status === 'exists').map((write) => write.relativePath)
  };
}
