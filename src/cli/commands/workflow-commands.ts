import { Command } from 'commander';
import { createRdSwarmPlan } from '../../services/rd/rd-service.js';
import { createTechPlan, getTechStatus } from '../../services/tech/tech-service.js';
import { createWorkflowRouterPlan, isSoloMode, isWorkflowMode, type SoloMode } from '../../services/workflow/workflow-router-service.js';
import { createAutonomousWorkflowPlan } from '../../services/workflow/workflow-autonomous-service.js';
import { createRecommendationPlan } from '../../services/recommendations/recommendation-service.js';
import { createRefactorDryRun, type RefactorMode } from '../../services/refactor/refactor-service.js';
import { getCurrentWorkspaceConfig } from '../../services/config/config-service.js';
import type { WorkspaceConfig } from '../../services/config/config-types.js';
import { getLocalArtifactPath } from '../../services/artifacts/workspace-service.js';
import { fail, ok } from '../../shared/result.js';
import { addJsonOption, failUnsupportedNonDryRun, getErrorMessage, isRecommendationWorkflow, printResult, type ProgramIO } from '../cli-helpers.js';

interface WorkspaceContext {
  workspace?: WorkspaceConfig;
  artifactWorkspacePath?: string;
}

function getWorkspaceContext(): WorkspaceContext {
  const workspace = getCurrentWorkspaceConfig();
  if (!workspace) return {};
  return { workspace, artifactWorkspacePath: getLocalArtifactPath(workspace) };
}

export function registerWorkflowCommands(program: Command, io: ProgramIO): void {
  const refactor = program.command('refactor').description('Plan a Peaks refactor run without modifying code');
  addJsonOption(
    refactor
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
      .option('--swarm', 'opt into swarm-oriented planning')
      .option('--dry-run', 'preview without writing files', true)
      .option('--no-dry-run', 'unsupported: do not execute tech planning from this CLI')
  ).action((options: { changeId: string; goal: string; swarm?: boolean; dryRun?: boolean; json?: boolean }) => {
    if (options.dryRun === false) {
      failUnsupportedNonDryRun(io, 'tech.plan', options.json);
      return;
    }

    try {
      const workspaceContext = getWorkspaceContext();
      const plan = createTechPlan({
        changeId: options.changeId,
        goal: options.goal,
        swarm: options.swarm ?? false,
        dryRun: true,
        ...workspaceContext
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
      const workspaceContext = getWorkspaceContext();
      printResult(io, ok('tech.status', getTechStatus({ changeId: options.changeId, ...workspaceContext })), options.json);
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
      .option('--solo-mode <mode>', 'solo mode: full-auto, guided, or rnd')
      .option('--max-workers <count>', 'maximum worker count', '40')
      .option('--dry-run', 'preview without writing files', true)
      .option('--no-dry-run', 'unsupported: do not execute workflow routing from this CLI')
  ).action((options: { mode: string; changeId: string; goal: string; soloMode?: string; maxWorkers: string; dryRun?: boolean; json?: boolean }) => {
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

      if (options.mode !== 'solo' && options.soloMode) {
        printResult(io, fail('workflow.route', 'SOLO_MODE_REQUIRES_SOLO_WORKFLOW', '--solo-mode can only be used with --mode solo', {}, ['Remove --solo-mode or use --mode solo']), options.json);
        process.exitCode = 1;
        return;
      }

      let soloMode: SoloMode | undefined;
      if (options.mode === 'solo' && options.soloMode) {
        if (!isSoloMode(options.soloMode)) {
          printResult(io, fail('workflow.route', 'UNSUPPORTED_SOLO_MODE', `Unsupported solo mode ${options.soloMode}`, {}, ['Use --solo-mode full-auto, guided, or rnd']), options.json);
          process.exitCode = 1;
          return;
        }
        soloMode = options.soloMode;
      }

      const workspaceContext = getWorkspaceContext();
      const plan = createWorkflowRouterPlan({
        changeId: options.changeId,
        goal: options.goal,
        mode: options.mode,
        ...(soloMode ? { soloMode } : {}),
        maxWorkers,
        dryRun: true,
        ...workspaceContext
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
      .option('--solo-mode <mode>', 'solo mode: full-auto, guided, or rnd')
      .option('--max-workers <count>', 'maximum worker count', '40')
      .option('--dry-run', 'preview without writing files', true)
      .option('--no-dry-run', 'unsupported: do not execute autonomous workflow planning from this CLI')
  ).action((options: { mode: string; changeId: string; goal: string; soloMode?: string; maxWorkers: string; dryRun?: boolean; json?: boolean }) => {
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

      if (options.mode !== 'solo' && options.soloMode) {
        printResult(io, fail('workflow.autonomous', 'SOLO_MODE_REQUIRES_SOLO_WORKFLOW', '--solo-mode can only be used with --mode solo', {}, ['Remove --solo-mode or use --mode solo']), options.json);
        process.exitCode = 1;
        return;
      }

      let soloMode: SoloMode | undefined;
      if (options.mode === 'solo' && options.soloMode) {
        if (!isSoloMode(options.soloMode)) {
          printResult(io, fail('workflow.autonomous', 'UNSUPPORTED_SOLO_MODE', `Unsupported solo mode ${options.soloMode}`, {}, ['Use --solo-mode full-auto, guided, or rnd']), options.json);
          process.exitCode = 1;
          return;
        }
        soloMode = options.soloMode;
      }

      const workspaceContext = getWorkspaceContext();
      const plan = createAutonomousWorkflowPlan({
        changeId: options.changeId,
        goal: options.goal,
        mode: options.mode,
        ...(soloMode ? { soloMode } : {}),
        maxWorkers,
        dryRun: true,
        ...workspaceContext
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

      const workspaceContext = getWorkspaceContext();
      const plan = createRdSwarmPlan({
        skill: 'rd',
        changeId: options.changeId,
        goal: options.goal,
        maxWorkers,
        dryRun: true,
        ...workspaceContext
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
}
