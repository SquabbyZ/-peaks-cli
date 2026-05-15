import { Command } from 'commander';
import { createArtifactInitPlan, getArtifactStatus, createGuidedArtifactSetup, type ArtifactProvider } from '../services/artifacts/artifact-service.js';
import { getArtifactWorkspaceStatus, planArtifactSync } from '../services/artifacts/workspace-service.js';
import {
  getChangeTraceabilityStatus,
  createChangeImpact,
  createArtifactRetentionReport,
  recordCommitBoundary,
  validateArtifactRetention,
  getScHelpText
} from '../services/sc/sc-service.js';
import { readConfig, getConfig, setConfig, addWorkspace, removeWorkspace, setCurrentWorkspace, type ConfigLayer } from '../services/config/config-service.js';
import { runDoctor } from '../services/doctor/doctor-service.js';
import { listProfiles } from '../services/profiles/profile-service.js';
import { planProxyTest } from '../services/proxy/proxy-service.js';
import { resolveCapabilityAvailability } from '../services/recommendations/capability-availability.js';
import { createRecommendationPlan, type RecommendationWorkflow } from '../services/recommendations/recommendation-service.js';
import { seedCapabilityItems, seedCapabilitySources } from '../services/recommendations/seed-capability-catalog.js';
import { createRefactorDryRun, type RefactorMode } from '../services/refactor/refactor-service.js';
import { listSkills } from '../services/skills/skill-registry.js';
import { fail, getErrorMessage, ok, type ResultEnvelope } from '../shared/result.js';

export type ProgramIO = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

export function printResult<T>(io: ProgramIO, result: ResultEnvelope<T>, asJson = false): void {
  if (asJson) {
    io.stdout(JSON.stringify(result, null, 2));
    return;
  }

  if (!result.ok) {
    io.stderr(`${result.code}: ${result.message}`);
    for (const action of result.nextActions) {
      io.stderr(`- ${action}`);
    }
    return;
  }

  io.stdout(JSON.stringify(result.data, null, 2));
  for (const warning of result.warnings) {
    io.stderr(`warning: ${warning}`);
  }
  for (const action of result.nextActions) {
    io.stdout(`next: ${action}`);
  }
}

function addJsonOption(command: Command): Command {
  return command.option('--json', 'print machine-readable JSON envelope');
}

function failUnsupportedNonDryRun(io: ProgramIO, command: string, asJson?: boolean): void {
  printResult(io, fail(command, 'UNSUPPORTED_NON_DRY_RUN', 'Only dry-run planning is supported', {}, ['Rerun with --dry-run or omit --no-dry-run']), asJson);
  process.exitCode = 1;
}

function isRecommendationWorkflow(value: string): value is RecommendationWorkflow {
  return value === 'code-refactor' || value === 'product-refactor' || value === 'frontend-design';
}

function multipleOption(value: string, previous: string[]): string[] {
  return [...(previous || []), value];
}

const defaultIO: ProgramIO = {
  stdout: (text) => console.log(text),
  stderr: (text) => console.error(text)
};

export function createProgram(io: ProgramIO = defaultIO): Command {
  const program = new Command();
  program
    .name('peaks')
    .description('Peaks CLI and short skill family runtime manager')
    .version('0.1.0')
    .exitOverride();

  addJsonOption(program.command('doctor').description('Run repository doctor checks')).action(async (options: { json?: boolean }) => {
    const report = await runDoctor();
    const result = report.summary.ok
      ? ok('doctor', report)
      : fail('doctor', 'DOCTOR_FAILED', 'One or more doctor checks failed', report, ['Fix failed checks and rerun peaks doctor']);
    printResult(io, result, options.json);
    if (!report.summary.ok) {
      process.exitCode = 1;
    }
  });

  const skill = program.command('skill').description('Manage Peaks skills');
  addJsonOption(skill.command('list').description('List skills derived from skills/*/SKILL.md')).action(async (options: { json?: boolean }) => {
    const skills = await listSkills();
    printResult(io, ok('skill.list', { skills }), options.json);
  });
  addJsonOption(skill.command('doctor').description('Run skill-related doctor checks')).action(async (options: { json?: boolean }) => {
    const report = await runDoctor();
    const skillChecks = report.checks.filter((check) => check.id.startsWith('skill'));
    const failed = skillChecks.filter((check) => !check.ok).length;
    printResult(io, ok('skill.doctor', { checks: skillChecks, ok: failed === 0 }), options.json);
    if (failed > 0) {
      process.exitCode = 1;
    }
  });

  const profile = program.command('profile').description('Manage runtime profiles');
  addJsonOption(profile.command('list').description('List available profiles')).action((options: { json?: boolean }) => {
    printResult(io, ok('profile.list', { profiles: listProfiles() }), options.json);
  });

  const proxy = program.command('proxy').description('Manage proxy settings');
  addJsonOption(
    proxy
      .command('test')
      .description('Plan or run a proxy connectivity test')
      .requiredOption('--proxy <url>', 'proxy URL')
      .option('--target <url>', 'target URL', 'https://www.google.com')
      .option('--dry-run', 'only print the planned command', true)
      .option('--no-dry-run', 'unsupported: do not execute connectivity tests from this CLI')
  ).action((options: { proxy: string; target: string; dryRun?: boolean; json?: boolean }) => {
    if (options.dryRun === false) {
      failUnsupportedNonDryRun(io, 'proxy.test', options.json);
      return;
    }

    try {
      const plan = planProxyTest(options.proxy, options.target, true);
      printResult(io, ok('proxy.test', plan), options.json);
    } catch (error) {
      printResult(io, fail('proxy.test', 'INVALID_PROXY', getErrorMessage(error), {}, ['Use a proxy URL starting with http:// or https://']), options.json);
      process.exitCode = 1;
    }
  });

  const artifacts = program.command('artifacts').description('Manage intermediate artifact repositories');
  addJsonOption(artifacts.command('status').description('Show artifact repository status')).action((options: { json?: boolean }) => {
    printResult(io, ok('artifacts.status', getArtifactStatus()), options.json);
  });
  addJsonOption(
    artifacts
      .command('init')
      .description('Plan remote-first artifact repository initialization')
      .requiredOption('--provider <provider>', 'artifact provider: github or gitlab')
      .requiredOption('--name <name>', 'remote repository name')
      .option('--path <path>', 'local artifact working copy path', '.peaks-artifacts')
      .option('--dry-run', 'preview without creating repositories or files', true)
      .option('--no-dry-run', 'unsupported: do not create repositories or files from this CLI')
  ).action((options: { provider: string; name: string; path: string; dryRun?: boolean; json?: boolean }) => {
    if (options.dryRun === false) {
      failUnsupportedNonDryRun(io, 'artifacts.init', options.json);
      return;
    }

    if (options.provider !== 'github' && options.provider !== 'gitlab') {
      printResult(io, fail('artifacts.init', 'UNSUPPORTED_ARTIFACT_PROVIDER', `Unsupported provider ${options.provider}`, {}, ['Use --provider github or --provider gitlab']), options.json);
      process.exitCode = 1;
      return;
    }

    printResult(io, ok('artifacts.init', createArtifactInitPlan({
      provider: options.provider as ArtifactProvider,
      name: options.name,
      localPath: options.path,
      dryRun: options.dryRun ?? true
    })), options.json);
  });
  addJsonOption(
    artifacts
      .command('sync')
      .description('Plan sync between local artifact workspace and remote repository')
      .option('--workspace <id>', 'workspace identifier (uses current if not specified)')
      .option('--dry-run', 'preview sync plan without executing', true)
      .option('--no-dry-run', 'unsupported: do not sync from this CLI')
  ).action((options: { workspace?: string; dryRun?: boolean; json?: boolean }) => {
    if (options.dryRun === false) {
      failUnsupportedNonDryRun(io, 'artifacts.sync', options.json);
      return;
    }
    printResult(io, ok('artifacts.sync', planArtifactSync(options.workspace, options.dryRun ?? true)), options.json);
  });
  addJsonOption(artifacts.command('workspace').description('Show artifact workspace status for current or specified workspace').option('--workspace <id>', 'workspace identifier')).action((options: { workspace?: string; json?: boolean }) => {
    printResult(io, ok('artifacts.workspace', getArtifactWorkspaceStatus(options.workspace)), options.json);
  });
  addJsonOption(artifacts.command('setup').description('Interactive guided artifact repository setup').option('--step <step>', 'start from specific step: detect, configure, validate, complete')).action((options: { step?: string; json?: boolean }) => {
    const validSteps = ['detect', 'configure', 'validate', 'complete'] as const;
    if (options.step && !validSteps.includes(options.step as (typeof validSteps)[number])) {
      printResult(io, fail('artifacts.setup', 'INVALID_ARTIFACT_SETUP_STEP', `Invalid artifact setup step ${options.step}`, {}, ['Use one of: detect, configure, validate, complete']), options.json);
      process.exitCode = 1;
      return;
    }

    const setup = createGuidedArtifactSetup();
    if (options.step) {
      setup.step = options.step as 'detect' | 'configure' | 'validate' | 'complete';
    }
    printResult(io, ok('artifacts.setup', setup), options.json);
  });

  addJsonOption(
    program
      .command('refactor')
      .description('Plan a Peaks refactor run without modifying code')
      .option('--solo', 'use peaks-solo orchestration mode')
      .option('--rd', 'use peaks-rd direct mode')
      .option('--dry-run', 'print gates and required artifacts', true)
      .option('--no-dry-run', 'unsupported: do not modify code from this command')
  ).action((options: { solo?: boolean; rd?: boolean; dryRun?: boolean; json?: boolean }) => {
    if (options.dryRun === false) {
      failUnsupportedNonDryRun(io, 'refactor', options.json);
      return;
    }

    if (options.solo && options.rd) {
      printResult(io, fail('refactor', 'CONFLICTING_REFACTOR_MODE', 'Choose either --solo or --rd, not both', {}, ['Run peaks refactor --solo --dry-run']), options.json);
      process.exitCode = 1;
      return;
    }

    const mode: RefactorMode = options.rd ? 'rd' : 'solo';
    printResult(io, ok('refactor', createRefactorDryRun(mode), [], ['This dry run never edits code']), options.json);
  });

  addJsonOption(
    program
      .command('recommend')
      .description('Create a dry-run recommendation plan for a workflow')
      .requiredOption('--workflow <workflow>', 'workflow: code-refactor, product-refactor, or frontend-design')
      .option('--language <language>', 'human presentation language', 'en')
  ).action((options: { workflow: string; language: string; json?: boolean }) => {
    if (!isRecommendationWorkflow(options.workflow)) {
      printResult(
        io,
        fail(
          'recommend',
          'UNSUPPORTED_RECOMMENDATION_WORKFLOW',
          `Unsupported recommendation workflow ${options.workflow}`,
          {},
          ['Use --workflow code-refactor, product-refactor, or frontend-design']
        ),
        options.json
      );
      process.exitCode = 1;
      return;
    }

    printResult(
      io,
      ok('recommend', createRecommendationPlan({ workflow: options.workflow, language: options.language })),
      options.json
    );
  });

  const capability = program.command('capability').description('Inspect Peaks capability catalog and runtime availability');
  addJsonOption(capability.command('status').description('Show seed capability availability')).action((options: { json?: boolean }) => {
    const availability = resolveCapabilityAvailability(seedCapabilityItems);
    printResult(io, ok('capability.status', { sources: seedCapabilitySources, items: seedCapabilityItems, availability }), options.json);
  });

  const config = program.command('config').description('Manage Peaks configuration');
  addJsonOption(config.command('get').description('Get current config or a specific key').option('--key <path>', 'dot-notation key path').option('--layer <layer>', 'user or project')).action((options: { key?: string; layer?: ConfigLayer; json?: boolean }) => {
    const getOpts: { key?: string; layer?: ConfigLayer } = {};
    if (options.key !== undefined) getOpts.key = options.key;
    if (options.layer !== undefined) getOpts.layer = options.layer;
    printResult(io, ok('config.get', getConfig(getOpts)), options.json);
  });
  addJsonOption(
    config
      .command('set')
      .description('Set a config value')
      .requiredOption('--key <path>', 'dot-notation key path')
      .requiredOption('--value <json>', 'JSON value')
      .option('--layer <layer>', 'user or project', 'user')
  ).action((options: { key: string; value: string; layer?: ConfigLayer; json?: boolean }) => {
    try {
      const parsed = JSON.parse(options.value);
      setConfig({ key: options.key, value: parsed, layer: options.layer ?? 'user' });
      printResult(io, ok('config.set', { key: options.key, value: parsed }), options.json);
    } catch {
      printResult(io, fail('config.set', 'INVALID_JSON', `Could not parse value as JSON: ${options.value}`, {}, ['Use valid JSON: --value \'{"key":"value"}\'']), options.json);
      process.exitCode = 1;
    }
  });

  const configWorkspace = config.command('workspace').description('Manage workspaces');
  addJsonOption(configWorkspace.command('list').description('List all workspaces')).action((options: { json?: boolean }) => {
    const cfg = readConfig();
    printResult(io, ok('config.workspace.list', { currentWorkspace: cfg.currentWorkspace, workspaces: cfg.workspaces }), options.json);
  });
  addJsonOption(
    configWorkspace
      .command('add')
      .description('Add a workspace')
      .requiredOption('--id <id>', 'workspace identifier')
      .requiredOption('--name <name>', 'workspace display name')
      .requiredOption('--path <path>', 'workspace root path')
      .option('--provider <provider>', 'artifact repo provider: github or gitlab')
      .option('--repo-owner <owner>', 'artifact repo owner')
      .option('--repo-name <name>', 'artifact repo name')
      .option('--layer <layer>', 'user or project', 'user')
  ).action((options: { id: string; name: string; path: string; provider?: string; repoOwner?: string; repoName?: string; layer?: ConfigLayer; json?: boolean }) => {
    const artifactRepo = options.provider && options.repoOwner && options.repoName
      ? { provider: options.provider as 'github' | 'gitlab', owner: options.repoOwner, name: options.repoName }
      : undefined;

    const workspace = { workspaceId: options.id, name: options.name, rootPath: options.path, installedCapabilityIds: [] as string[] };
    if (artifactRepo) {
      addWorkspace({ ...workspace, artifactRepo }, options.layer ?? 'user');
    } else {
      addWorkspace(workspace, options.layer ?? 'user');
    }
    printResult(io, ok('config.workspace.add', { workspaceId: options.id, name: options.name, rootPath: options.path, artifactRepo }), options.json);
  });
  addJsonOption(
    configWorkspace
      .command('remove')
      .description('Remove a workspace')
      .requiredOption('--id <id>', 'workspace identifier')
      .option('--layer <layer>', 'user or project', 'user')
  ).action((options: { id: string; layer?: ConfigLayer; json?: boolean }) => {
    const removed = removeWorkspace(options.id, options.layer ?? 'user');
    if (removed) {
      printResult(io, ok('config.workspace.remove', { workspaceId: options.id }), options.json);
    } else {
      printResult(io, fail('config.workspace.remove', 'WORKSPACE_NOT_FOUND', `Workspace ${options.id} not found`, {}, ['List workspaces with: peaks config workspace list']), options.json);
      process.exitCode = 1;
    }
  });
  addJsonOption(configWorkspace.command('switch').description('Switch current workspace').requiredOption('--id <id>', 'workspace identifier').option('--layer <layer>', 'user or project', 'user')).action((options: { id: string; layer?: ConfigLayer; json?: boolean }) => {
    const switched = setCurrentWorkspace(options.id);
    if (switched) {
      printResult(io, ok('config.workspace.switch', { currentWorkspace: options.id }), options.json);
    } else {
      printResult(io, fail('config.workspace.switch', 'WORKSPACE_NOT_FOUND', `Workspace ${options.id} not found`, {}, ['List workspaces with: peaks config workspace list']), options.json);
      process.exitCode = 1;
    }
  });

  const sc = program.command('sc').description('Source control and change traceability (peaks-sc integration)');
  addJsonOption(sc.command('status').description('Show change traceability status')).action((options: { json?: boolean }) => {
    printResult(io, ok('sc.status', getChangeTraceabilityStatus()), options.json);
  });
  addJsonOption(sc.command('help').description('Show peaks-sc help text')).action((options: { json?: boolean }) => {
    const helpText = getScHelpText().join('\n');
    if (options.json) {
      printResult(io, ok('sc.help', { helpText }), options.json);
    } else {
      io.stdout(helpText);
    }
  });
  addJsonOption(
    sc
      .command('impact')
      .description('Generate change impact artifact')
      .requiredOption('--change-id <id>', 'change identifier')
      .option('--module <module>', 'affected module', multipleOption)
      .option('--file <file>', 'affected file', multipleOption)
  ).action((options: { changeId: string; module?: string[]; file?: string[]; json?: boolean }) => {
    const impactOptions: { changeId: string; sourceArtifacts?: string[]; affectedModules?: string[]; affectedFiles?: string[] } = {
      changeId: options.changeId
    };
    if (options.module) impactOptions.affectedModules = options.module;
    if (options.file) impactOptions.affectedFiles = options.file;
    const impact = createChangeImpact(impactOptions);
    printResult(io, ok('sc.impact', impact), options.json);
  });
  addJsonOption(
    sc
      .command('retention')
      .description('Create artifact retention report')
      .requiredOption('--slice-id <id>', 'slice identifier')
      .option('--prd <artifact>', 'PRD artifact path', multipleOption)
      .option('--rd <artifact>', 'RD artifact path', multipleOption)
      .option('--qa <artifact>', 'QA artifact path', multipleOption)
      .option('--coverage <artifact>', 'coverage artifact path', multipleOption)
      .option('--review <artifact>', 'review artifact path', multipleOption)
      .option('--code <file>', 'code file path', multipleOption)
  ).action((options: { sliceId: string; prd?: string[]; rd?: string[]; qa?: string[]; coverage?: string[]; review?: string[]; code?: string[]; json?: boolean }) => {
    const reportOptions: { sliceId: string; prdArtifacts?: string[]; rdArtifacts?: string[]; qaArtifacts?: string[]; coverageArtifacts?: string[]; reviewArtifacts?: string[]; codeChanges?: string[] } = {
      sliceId: options.sliceId
    };
    if (options.prd) reportOptions.prdArtifacts = options.prd;
    if (options.rd) reportOptions.rdArtifacts = options.rd;
    if (options.qa) reportOptions.qaArtifacts = options.qa;
    if (options.coverage) reportOptions.coverageArtifacts = options.coverage;
    if (options.review) reportOptions.reviewArtifacts = options.review;
    if (options.code) reportOptions.codeChanges = options.code;
    const report = createArtifactRetentionReport(reportOptions);
    printResult(io, ok('sc.retention', report), options.json);
  });
  addJsonOption(sc.command('validate').description('Validate artifact retention for a slice').requiredOption('--slice-id <id>', 'slice identifier')).action((options: { sliceId: string; json?: boolean }) => {
    const result = validateArtifactRetention(options.sliceId);
    printResult(io, ok('sc.validate', result), options.json);
  });
  addJsonOption(
    sc
      .command('boundary')
      .description('Record commit boundary for a slice')
      .requiredOption('--slice-id <id>', 'slice identifier')
      .option('--artifact <path>', 'artifact path', multipleOption)
      .option('--code <file>', 'code file path', multipleOption)
  ).action((options: { sliceId: string; artifact?: string[]; code?: string[]; json?: boolean }) => {
    const boundaryOptions: { sliceId: string; artifacts?: string[]; codeFiles?: string[] } = {
      sliceId: options.sliceId
    };
    if (options.artifact) boundaryOptions.artifacts = options.artifact;
    if (options.code) boundaryOptions.codeFiles = options.code;
    const boundary = recordCommitBoundary(boundaryOptions);
    printResult(io, ok('sc.boundary', boundary), options.json);
  });

  return program;
}
