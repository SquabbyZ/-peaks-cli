import { Command } from 'commander';
import { createArtifactInitPlan, getArtifactStatus, createGuidedArtifactSetup, type ArtifactProvider, type GuidedArtifactSetup } from '../services/artifacts/artifact-service.js';
import { getArtifactWorkspaceStatus, getLocalArtifactPath, planArtifactSync } from '../services/artifacts/workspace-service.js';
import { getCurrentWorkspaceConfig, readConfig, getConfig, setConfig, addWorkspace, removeWorkspace, setCurrentWorkspace, getMiniMaxProviderConfig, getMiniMaxProviderStatus, setMiniMaxProviderConfig, isConfigLayer, isSensitiveConfigPath, redactConfigSecrets, type ConfigLayer } from '../services/config/config-service.js';
import { runDoctor } from '../services/doctor/doctor-service.js';
import { createRdSwarmPlan } from '../services/rd/rd-service.js';
import { createTechPlan, getTechStatus } from '../services/tech/tech-service.js';
import { createWorkflowRouterPlan, isWorkflowMode } from '../services/workflow/workflow-router-service.js';
import { createAutonomousWorkflowPlan } from '../services/workflow/workflow-autonomous-service.js';
import {
  getChangeTraceabilityStatus,
  createChangeImpact,
  createArtifactRetentionReport,
  recordCommitBoundary,
  validateArtifactRetention,
  getScHelpText
} from '../services/sc/sc-service.js';
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

function isArtifactProvider(value: string): value is ArtifactProvider {
  return value === 'github' || value === 'gitlab';
}

function isArtifactSetupStep(value: string): value is GuidedArtifactSetup['step'] {
  return value === 'detect' || value === 'configure' || value === 'validate' || value === 'complete';
}

function isArtifactRepoSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes('..') && !value.endsWith('.');
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function parseConfigLayer(value: string | undefined): ConfigLayer | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return isConfigLayer(value) ? value : null;
}

function printInvalidConfigLayer(io: ProgramIO, command: string, asJson?: boolean): void {
  printResult(io, fail(command, 'INVALID_CONFIG_LAYER', 'Config layer must be user or project', {}, ['Use --layer user or --layer project']), asJson);
  process.exitCode = 1;
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

    if (!isArtifactProvider(options.provider)) {
      printResult(io, fail('artifacts.init', 'UNSUPPORTED_ARTIFACT_PROVIDER', `Unsupported provider ${options.provider}`, {}, ['Use --provider github or --provider gitlab']), options.json);
      process.exitCode = 1;
      return;
    }

    printResult(io, ok('artifacts.init', createArtifactInitPlan({
      provider: options.provider,
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
    const requestedStep = options.step;
    const setup = createGuidedArtifactSetup();

    if (requestedStep) {
      if (!isArtifactSetupStep(requestedStep)) {
        printResult(io, fail('artifacts.setup', 'INVALID_ARTIFACT_SETUP_STEP', `Invalid artifact setup step ${requestedStep}`, {}, ['Use one of: detect, configure, validate, complete']), options.json);
        process.exitCode = 1;
        return;
      }
      setup.step = requestedStep;
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

  const tech = program.command('tech').description('Plan and inspect technical dry-run gates');
  addJsonOption(
    tech
      .command('plan')
      .description('Generate a technical dry-run graph')
      .requiredOption('--change-id <id>', 'change identifier')
      .requiredOption('--goal <goal>', 'planning goal')
      .option('--swarm', 'opt into swarm-oriented planning', true)
      .option('--dry-run', 'preview without writing files', true)
      .option('--no-dry-run', 'unsupported: do not execute tech planning from this CLI')
  ).action((options: { changeId: string; goal: string; swarm?: boolean; dryRun?: boolean; json?: boolean }) => {
    if (options.dryRun === false) {
      failUnsupportedNonDryRun(io, 'tech.plan', options.json);
      return;
    }

    try {
      const workspace = getCurrentWorkspaceConfig();
      const artifactWorkspacePath = workspace ? getLocalArtifactPath(workspace) : undefined;
      const plan = createTechPlan({
        changeId: options.changeId,
        goal: options.goal,
        swarm: options.swarm ?? true,
        dryRun: true,
        ...(artifactWorkspacePath ? { artifactWorkspacePath } : {}),
        ...(workspace ? { workspace } : {}),
      });
      printResult(io, ok('tech.plan', plan), options.json);
    } catch (error) {
      printResult(io, fail('tech.plan', 'INVALID_CHANGE_ID_OR_GOAL', getErrorMessage(error), {}, ['Use a safe change id and a non-empty goal']), options.json);
      process.exitCode = 1;
    }
  });
  addJsonOption(
    tech
      .command('status')
      .description('Inspect technical approval status')
      .requiredOption('--change-id <id>', 'change identifier')
  ).action((options: { changeId: string; json?: boolean }) => {
    try {
      const workspace = getCurrentWorkspaceConfig();
      const artifactWorkspacePath = workspace ? getLocalArtifactPath(workspace) : undefined;
      printResult(io, ok('tech.status', getTechStatus({ changeId: options.changeId, ...(artifactWorkspacePath ? { artifactWorkspacePath } : {}), ...(workspace ? { workspace } : {}) })), options.json);
    } catch (error) {
      printResult(io, fail('tech.status', 'INVALID_CHANGE_ID', getErrorMessage(error), {}, ['Use a safe change id']), options.json);
      process.exitCode = 1;
    }
  });

  const workflow = program.command('workflow').description('Plan workflow routing dry-run graphs');
  addJsonOption(
    workflow
      .command('route')
      .description('Generate a workflow routing dry-run plan')
      .requiredOption('--mode <mode>', 'workflow mode: solo or team')
      .requiredOption('--change-id <id>', 'change identifier')
      .requiredOption('--goal <goal>', 'planning goal')
      .option('--max-workers <count>', 'maximum worker count', '40')
      .option('--dry-run', 'preview without writing files', true)
      .option('--no-dry-run', 'unsupported: do not execute workflow routing from this CLI')
  ).action((options: { mode: string; changeId: string; goal: string; maxWorkers: string; dryRun?: boolean; json?: boolean }) => {
    if (options.dryRun === false) {
      failUnsupportedNonDryRun(io, 'workflow.route', options.json);
      return;
    }

    if (!isWorkflowMode(options.mode)) {
      printResult(io, fail('workflow.route', 'UNSUPPORTED_WORKFLOW_MODE', `Unsupported workflow mode ${options.mode}`, {}, ['Use --mode solo or --mode team']), options.json);
      process.exitCode = 1;
      return;
    }

    try {
      const maxWorkers = Number(options.maxWorkers);
      if (!Number.isInteger(maxWorkers) || maxWorkers < 1) {
        printResult(io, fail('workflow.route', 'INVALID_MAX_WORKERS', 'max-workers must be a positive integer', {}, ['Use --max-workers with a positive integer value']), options.json);
        process.exitCode = 1;
        return;
      }

      const workspace = getCurrentWorkspaceConfig();
      const artifactWorkspacePath = workspace ? getLocalArtifactPath(workspace) : undefined;
      const plan = createWorkflowRouterPlan({
        changeId: options.changeId,
        goal: options.goal,
        mode: options.mode,
        maxWorkers,
        dryRun: true,
        ...(artifactWorkspacePath ? { artifactWorkspacePath } : {}),
        ...(workspace ? { workspace } : {})
      });
      printResult(io, ok('workflow.route', plan), options.json);
    } catch (error) {
      printResult(io, fail('workflow.route', 'INVALID_CHANGE_ID_OR_GOAL', getErrorMessage(error), {}, ['Use a safe change id and a non-empty goal']), options.json);
      process.exitCode = 1;
    }
  });
  addJsonOption(
    workflow
      .command('autonomous')
      .description('Generate an autonomous workflow dry-run plan')
      .requiredOption('--mode <mode>', 'workflow mode: solo or team')
      .requiredOption('--change-id <id>', 'change identifier')
      .requiredOption('--goal <goal>', 'planning goal')
      .option('--max-workers <count>', 'maximum worker count', '40')
      .option('--dry-run', 'preview without writing files', true)
      .option('--no-dry-run', 'unsupported: do not execute autonomous workflow planning from this CLI')
  ).action((options: { mode: string; changeId: string; goal: string; maxWorkers: string; dryRun?: boolean; json?: boolean }) => {
    if (options.dryRun === false) {
      failUnsupportedNonDryRun(io, 'workflow.autonomous', options.json);
      return;
    }

    if (!isWorkflowMode(options.mode)) {
      printResult(io, fail('workflow.autonomous', 'UNSUPPORTED_WORKFLOW_MODE', `Unsupported workflow mode ${options.mode}`, {}, ['Use --mode solo or --mode team']), options.json);
      process.exitCode = 1;
      return;
    }

    try {
      const maxWorkers = Number(options.maxWorkers);
      if (!Number.isInteger(maxWorkers) || maxWorkers < 1) {
        printResult(io, fail('workflow.autonomous', 'INVALID_MAX_WORKERS', 'max-workers must be a positive integer', {}, ['Use --max-workers with a positive integer value']), options.json);
        process.exitCode = 1;
        return;
      }

      const workspace = getCurrentWorkspaceConfig();
      const artifactWorkspacePath = workspace ? getLocalArtifactPath(workspace) : undefined;
      const plan = createAutonomousWorkflowPlan({
        changeId: options.changeId,
        goal: options.goal,
        mode: options.mode,
        maxWorkers,
        dryRun: true,
        ...(artifactWorkspacePath ? { artifactWorkspacePath } : {}),
        ...(workspace ? { workspace } : {})
      });
      printResult(io, ok('workflow.autonomous', plan), options.json);
    } catch (error) {
      printResult(io, fail('workflow.autonomous', 'INVALID_CHANGE_ID_OR_GOAL', getErrorMessage(error), {}, ['Use a safe change id and a non-empty goal']), options.json);
      process.exitCode = 1;
    }
  });

  const swarm = program.command('swarm').description('Plan RD swarm dry-run graphs');
  addJsonOption(
    swarm
      .command('plan')
      .description('Generate an RD swarm dry-run graph')
      .requiredOption('--skill <skill>', 'skill to plan for')
      .requiredOption('--change-id <id>', 'change identifier')
      .requiredOption('--goal <goal>', 'planning goal')
      .option('--max-workers <count>', 'maximum worker count', '40')
      .option('--dry-run', 'preview without writing files', true)
      .option('--no-dry-run', 'unsupported: do not execute RD planning from this CLI')
  ).action((options: { skill: string; changeId: string; goal: string; maxWorkers: string; dryRun?: boolean; json?: boolean }) => {
    if (options.skill !== 'rd') {
      printResult(io, fail('swarm.plan', 'UNSUPPORTED_SWARM_SKILL', `Unsupported skill ${options.skill}`, {}, ['Use --skill rd']), options.json);
      process.exitCode = 1;
      return;
    }

    if (options.dryRun === false) {
      failUnsupportedNonDryRun(io, 'swarm.plan', options.json);
      return;
    }

    try {
      const maxWorkers = Number(options.maxWorkers);
      if (!Number.isInteger(maxWorkers) || maxWorkers < 1) {
        printResult(io, fail('swarm.plan', 'INVALID_MAX_WORKERS', 'max-workers must be a positive integer', {}, ['Use --max-workers with a positive integer value']), options.json);
        process.exitCode = 1;
        return;
      }

      const workspace = getCurrentWorkspaceConfig();
      const artifactWorkspacePath = workspace ? getLocalArtifactPath(workspace) : undefined;
      const plan = createRdSwarmPlan({
        skill: 'rd',
        changeId: options.changeId,
        goal: options.goal,
        maxWorkers,
        dryRun: true,
        ...(artifactWorkspacePath ? { artifactWorkspacePath } : {}),
        ...(workspace ? { workspace } : {}),
      });
      printResult(io, ok('swarm.plan', plan), options.json);
    } catch (error) {
      printResult(io, fail('swarm.plan', 'INVALID_CHANGE_ID_OR_GOAL', getErrorMessage(error), {}, ['Use a safe change id and a non-empty goal']), options.json);
      process.exitCode = 1;
    }
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
  addJsonOption(config.command('get').description('Get current config or a specific key').option('--key <path>', 'dot-notation key path').option('--layer <layer>', 'user or project')).action((options: { key?: string; layer?: string; json?: boolean }) => {
    const layer = parseConfigLayer(options.layer);
    if (layer === null) {
      printInvalidConfigLayer(io, 'config.get', options.json);
      return;
    }
    const getOpts: { key?: string; layer?: ConfigLayer } = {};
    if (layer !== undefined) getOpts.layer = layer;
    if (options.key !== undefined) getOpts.key = options.key;
    const value = getConfig(getOpts);
    printResult(io, ok('config.get', options.key !== undefined && isSensitiveConfigPath(options.key) ? '***' : redactConfigSecrets(value)), options.json);
  });
  addJsonOption(
    config
      .command('set')
      .description('Set a config value')
      .requiredOption('--key <path>', 'dot-notation key path')
      .requiredOption('--value <json>', 'JSON value')
      .option('--layer <layer>', 'user or project', 'user')
  ).action((options: { key: string; value: string; layer?: string; json?: boolean }) => {
    const parsedLayer = parseConfigLayer(options.layer);
    if (parsedLayer === null) {
      printInvalidConfigLayer(io, 'config.set', options.json);
      return;
    }
    const layer = parsedLayer ?? 'user';

    let parsed: unknown;
    try {
      parsed = JSON.parse(options.value);
    } catch {
      printResult(io, fail('config.set', 'INVALID_JSON', 'Could not parse value as JSON', {}, ['Use valid JSON: --value \'{"key":"value"}\'']), options.json);
      process.exitCode = 1;
      return;
    }

    try {
      setConfig({ key: options.key, value: parsed, layer });
      printResult(io, ok('config.set', { key: options.key, value: isSensitiveConfigPath(options.key) ? '***' : redactConfigSecrets(parsed) }), options.json);
    } catch (error) {
      if (getErrorMessage(error) === 'Sensitive config keys must be stored in the user config layer') {
        printResult(io, fail('config.set', 'SECRET_CONFIG_REQUIRES_USER_LAYER', 'Sensitive config keys must be stored in the user config layer', {}, ['Use --layer user or peaks config provider minimax set']), options.json);
        process.exitCode = 1;
        return;
      }
      if (getErrorMessage(error) === 'Project config not found') {
        printResult(io, fail('config.set', 'PROJECT_CONFIG_NOT_FOUND', 'Project config not found', {}, ['Create a safe .peaks/config.json in the project or use --layer user']), options.json);
        process.exitCode = 1;
        return;
      }
      if (getErrorMessage(error) === 'MiniMax base URL must start with https://') {
        printResult(io, fail('config.set', 'INVALID_MINIMAX_BASE_URL', 'MiniMax base URL must start with https://', {}, ['Use a MiniMax Anthropic-compatible HTTPS endpoint']), options.json);
        process.exitCode = 1;
        return;
      }
      printResult(io, fail('config.set', 'CONFIG_SET_FAILED', getErrorMessage(error), {}, ['Check the config key and layer, then retry']), options.json);
      process.exitCode = 1;
    }
  });

  const configProvider = config.command('provider').description('Manage model provider settings');
  const minimaxProvider = configProvider.command('minimax').description('Manage MiniMax provider settings');
  addJsonOption(
    minimaxProvider
      .command('set')
      .description('Set MiniMax provider settings in user config')
      .option('--base-url <url>', 'MiniMax Anthropic-compatible base URL')
      .option('--api-key <key>', 'MiniMax API key stored plaintext in v1 user config')
  ).action((options: { baseUrl?: string; apiKey?: string; json?: boolean }) => {
    const baseUrl = options.baseUrl?.trim();
    const apiKey = options.apiKey?.trim();
    if (!baseUrl && !apiKey) {
      printResult(io, fail('config.provider.minimax.set', 'MINIMAX_PROVIDER_NO_VALUES', 'Provide --base-url, --api-key, or both', {}, ['Run peaks config provider minimax set --base-url <url> --api-key <key>']), options.json);
      process.exitCode = 1;
      return;
    }
    if (baseUrl && !isHttpsUrl(baseUrl)) {
      printResult(io, fail('config.provider.minimax.set', 'INVALID_MINIMAX_BASE_URL', 'MiniMax base URL must start with https://', {}, ['Use a MiniMax Anthropic-compatible HTTPS endpoint']), options.json);
      process.exitCode = 1;
      return;
    }

    try {
      const status = setMiniMaxProviderConfig({ ...(baseUrl ? { baseUrl } : {}), ...(apiKey ? { apiKey } : {}) });
      printResult(io, ok('config.provider.minimax.set', status), options.json);
    } catch (error) {
      if (getErrorMessage(error) === 'MiniMax base URL must start with https://') {
        printResult(io, fail('config.provider.minimax.set', 'INVALID_MINIMAX_BASE_URL', 'MiniMax base URL must start with https://', {}, ['Use a MiniMax Anthropic-compatible HTTPS endpoint']), options.json);
        process.exitCode = 1;
        return;
      }
      printResult(io, fail('config.provider.minimax.set', 'MINIMAX_PROVIDER_SET_FAILED', getErrorMessage(error), {}, ['Check MiniMax provider settings and retry']), options.json);
      process.exitCode = 1;
    }
  });
  addJsonOption(minimaxProvider.command('get').description('Show redacted MiniMax provider settings')).action((options: { json?: boolean }) => {
    const config = getMiniMaxProviderConfig();
    const status = getMiniMaxProviderStatus();
    printResult(io, ok('config.provider.minimax.get', { ...config, apiKey: config.apiKey ? '***' : undefined, ...status }), options.json);
  });
  addJsonOption(minimaxProvider.command('status').description('Show MiniMax provider configuration status')).action((options: { json?: boolean }) => {
    printResult(io, ok('config.provider.minimax.status', getMiniMaxProviderStatus()), options.json);
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
  ).action((options: { id: string; name: string; path: string; provider?: string; repoOwner?: string; repoName?: string; layer?: string; json?: boolean }) => {
    const layer = parseConfigLayer(options.layer);
    if (layer === null) {
      printInvalidConfigLayer(io, 'config.workspace.add', options.json);
      return;
    }
    const provider = options.provider;
    const hasArtifactRepoInput = provider !== undefined || options.repoOwner !== undefined || options.repoName !== undefined;
    let artifactRepo: { provider: ArtifactProvider; owner: string; name: string } | undefined;

    if (hasArtifactRepoInput) {
      if (!provider || !options.repoOwner || !options.repoName) {
        printResult(io, fail('config.workspace.add', 'INVALID_ARTIFACT_REPO_CONFIG', 'Artifact repo config requires --provider, --repo-owner, and --repo-name together', {}, ['Provide all three artifact repo options together, or omit them all']), options.json);
        process.exitCode = 1;
        return;
      }
      if (!isArtifactProvider(provider)) {
        printResult(io, fail('config.workspace.add', 'UNSUPPORTED_ARTIFACT_PROVIDER', `Unsupported provider ${provider}`, {}, ['Use --provider github or --provider gitlab']), options.json);
        process.exitCode = 1;
        return;
      }
      if (!isArtifactRepoSegment(options.repoOwner) || !isArtifactRepoSegment(options.repoName)) {
        printResult(io, fail('config.workspace.add', 'INVALID_ARTIFACT_REPO_CONFIG', 'Artifact repo owner and name must use safe GitHub/GitLab path segments', {}, ['Use letters, numbers, dots, underscores, or hyphens without path traversal']), options.json);
        process.exitCode = 1;
        return;
      }

      artifactRepo = { provider, owner: options.repoOwner, name: options.repoName };
    }

    const workspace = { workspaceId: options.id, name: options.name, rootPath: options.path, installedCapabilityIds: [] as string[] };
    if (artifactRepo) {
      addWorkspace({ ...workspace, artifactRepo }, layer ?? 'user');
    } else {
      addWorkspace(workspace, layer ?? 'user');
    }
    printResult(io, ok('config.workspace.add', { workspaceId: options.id, name: options.name, rootPath: options.path, artifactRepo }), options.json);
  });
  addJsonOption(
    configWorkspace
      .command('remove')
      .description('Remove a workspace')
      .requiredOption('--id <id>', 'workspace identifier')
      .option('--layer <layer>', 'user or project', 'user')
  ).action((options: { id: string; layer?: string; json?: boolean }) => {
    const layer = parseConfigLayer(options.layer);
    if (layer === null) {
      printInvalidConfigLayer(io, 'config.workspace.remove', options.json);
      return;
    }
    const removed = removeWorkspace(options.id, layer ?? 'user');
    if (removed) {
      printResult(io, ok('config.workspace.remove', { workspaceId: options.id }), options.json);
    } else {
      printResult(io, fail('config.workspace.remove', 'WORKSPACE_NOT_FOUND', `Workspace ${options.id} not found`, {}, ['List workspaces with: peaks config workspace list']), options.json);
      process.exitCode = 1;
    }
  });
  addJsonOption(configWorkspace.command('switch').description('Switch current workspace').requiredOption('--id <id>', 'workspace identifier').option('--layer <layer>', 'user or project', 'user')).action((options: { id: string; layer?: string; json?: boolean }) => {
    const layer = parseConfigLayer(options.layer);
    if (layer === null) {
      printInvalidConfigLayer(io, 'config.workspace.switch', options.json);
      return;
    }
    const switched = setCurrentWorkspace(options.id, layer ?? 'user');
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
