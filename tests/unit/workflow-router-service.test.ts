import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { WorkspaceConfig } from '../../src/services/config/config-types.js';
import { TECH_REQUIRED_ARTIFACTS } from '../../src/services/tech/tech-service.js';
import { createWorkflowRouterPlan } from '../../src/services/workflow/workflow-router-service.js';

function createApprovedWorkspace(changeId: string): { workspace: WorkspaceConfig; artifactWorkspace: string } {
  const rootPath = mkdtempSync(join(tmpdir(), 'peaks-workflow-root-'));
  const artifactWorkspace = join(dirname(rootPath), `${basename(rootPath)}.peaks-artifacts`);
  const architectureRoot = join(artifactWorkspace, '.peaks', 'changes', changeId, 'architecture');
  mkdirSync(join(artifactWorkspace, '.peaks'), { recursive: true });
  mkdirSync(architectureRoot, { recursive: true });
  writeFileSync(join(artifactWorkspace, '.peaks', 'config.json'), '{}', 'utf8');
  for (const artifact of TECH_REQUIRED_ARTIFACTS) {
    writeFileSync(join(architectureRoot, artifact), artifact === 'tech-approval-record.md' ? 'status: approved' : 'ready', 'utf8');
  }

  return {
    workspace: {
      workspaceId: 'ws-workflow',
      name: 'Workflow Workspace',
      rootPath,
      installedCapabilityIds: []
    },
    artifactWorkspace
  };
}

describe('createWorkflowRouterPlan', () => {
  test('creates a solo route with broad cost-tiered model hints', () => {
    const plan = createWorkflowRouterPlan({ changeId: 'solo-refactor', goal: 'Refactor checkout flow', mode: 'solo', dryRun: true });

    expect(plan.routePolicy).toBe('solo-broad-multi-model');
    expect(plan.mode).toBe('solo');
    expect(plan.constraints).toEqual(['dry-run-only', 'do-not-launch-agents', 'do-not-write-artifacts', 'do-not-mutate-target-repo', 'model-tier-hints-only']);
    expect(plan.steps.filter((step) => step.modelTier === 'top-tier').map((step) => step.stage)).toEqual(['product-direction', 'design-direction', 'tech-direction', 'tech-review', 'rd-planning', 'quality-review']);
    expect(plan.steps.filter((step) => step.modelTier === 'mid-tier').map((step) => step.stage)).toEqual(['coding-execution', 'unit-test-execution']);
    expect(plan.steps.every((step) => step.dryRunOnly && !step.invokesAgents && !step.writesArtifacts)).toBe(true);
  });

  test('creates a team route that limits mid-tier execution to peaks-rd', () => {
    const plan = createWorkflowRouterPlan({ changeId: 'team-refactor', goal: 'Refactor checkout flow', mode: 'team', dryRun: true });

    expect(plan.routePolicy).toBe('team-rd-limited-multi-model');
    expect(plan.mode).toBe('team');
    expect(plan.steps.filter((step) => step.modelTier === 'mid-tier').every((step) => step.owner === 'peaks-rd')).toBe(true);
    expect(plan.steps.find((step) => step.stage === 'product-direction')?.owner).toBe('human');
    expect(plan.steps.find((step) => step.stage === 'quality-review')?.modelTier).toBe('top-tier');
  });

  test('routes product design tech and review to strongest model while execution uses MiniMax 2.7', () => {
    const plan = createWorkflowRouterPlan({ changeId: 'model-routing', goal: 'Refactor checkout flow', mode: 'solo', dryRun: true });

    expect(plan.modelRouting.strongestModel.modelId).toBe('claude-opus-4-7');
    expect(plan.modelRouting.executionModel.modelId).toBe('minimax-2.7');
    expect(plan.steps.filter((step) => step.stage !== 'coding-execution' && step.stage !== 'unit-test-execution').every((step) => step.modelRole === 'strongest')).toBe(true);
    expect(plan.steps.filter((step) => step.stage === 'coding-execution' || step.stage === 'unit-test-execution').every((step) => step.modelRole === 'execution')).toBe(true);
    expect(plan.steps.find((step) => step.stage === 'coding-execution')?.modelId).toBe('minimax-2.7');
    expect(plan.steps.find((step) => step.stage === 'unit-test-execution')?.modelId).toBe('minimax-2.7');
    expect(plan.steps.find((step) => step.stage === 'quality-review')?.modelId).toBe('claude-opus-4-7');
  });

  test('keeps missing artifact workspace as a preview-safe planning constraint', () => {
    const plan = createWorkflowRouterPlan({ changeId: 'missing-artifacts', goal: 'Fix checkout retry typo', mode: 'solo', dryRun: true });

    expect(plan.techStatus.status).toBe('unavailable');
    expect(plan.techPlan.available).toBe(false);
    expect(plan.rdPlan.available).toBe(false);
    expect(plan.blockedReasons).toContain('artifact-workspace-unavailable');
    expect(plan.nextActions.length).toBeGreaterThan(0);
  });

  test('defaults RD worker target to forty workers', () => {
    const plan = createWorkflowRouterPlan({ changeId: 'default-workers', goal: 'Fix checkout retry typo', mode: 'solo', dryRun: true });

    expect(plan.rdPlan.workerTarget).toBe(40);
  });

  test('passes max workers into RD planning', () => {
    const plan = createWorkflowRouterPlan({ changeId: 'custom-workers', goal: 'Fix checkout retry typo', mode: 'solo', maxWorkers: 25, dryRun: true });

    expect(plan.rdPlan.workerTarget).toBe(25);
  });

  test('merges non-workspace blocked reasons and next actions when artifacts are available', () => {
    const { workspace, artifactWorkspace } = createApprovedWorkspace('available-artifacts');
    const plan = createWorkflowRouterPlan({
      changeId: 'available-artifacts',
      goal: 'Fix checkout retry typo',
      mode: 'solo',
      maxWorkers: 24,
      dryRun: true,
      artifactWorkspacePath: artifactWorkspace,
      workspace
    });

    expect(plan.techStatus.status).toBe('approved');
    expect(plan.techPlan.available).toBe(true);
    expect(plan.rdPlan.available).toBe(false);
    expect(plan.blockedReasons).toEqual(['worker-count-below-target']);
    expect(plan.nextActions).toEqual(['Lower max-workers to match the current change scope or accept the capped target.']);
  });

  test('returns no next actions when all route prerequisites are available', () => {
    const { workspace, artifactWorkspace } = createApprovedWorkspace('approved-route');
    const plan = createWorkflowRouterPlan({
      changeId: 'approved-route',
      goal: 'Fix checkout retry typo',
      mode: 'solo',
      maxWorkers: 40,
      dryRun: true,
      artifactWorkspacePath: artifactWorkspace,
      workspace
    });

    expect(plan.techPlan.available).toBe(true);
    expect(plan.rdPlan.available).toBe(true);
    expect(plan.blockedReasons).toEqual([]);
    expect(plan.nextActions).toEqual([]);
  });

  test('rejects invalid change id, empty goal, and unsupported mode', () => {
    expect(() => createWorkflowRouterPlan({ changeId: 'foo/bar', goal: 'Fix checkout retry typo', mode: 'solo', dryRun: true })).toThrow('Invalid change-id');
    expect(() => createWorkflowRouterPlan({ changeId: 'empty-goal', goal: '   ', mode: 'solo', dryRun: true })).toThrow('Goal must be non-empty');
    expect(() => createWorkflowRouterPlan({ changeId: 'bad-mode', goal: 'Fix checkout retry typo', mode: 'enterprise' as 'solo', dryRun: true })).toThrow('Unsupported workflow mode');
  });
});
