import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { WorkspaceConfig } from '../../src/services/config/config-types.js';
import { TECH_REQUIRED_ARTIFACTS } from '../../src/services/tech/tech-service.js';
import { createAutonomousWorkflowPlan } from '../../src/services/workflow/workflow-autonomous-service.js';

function createWorkspace(rootPath = join(tmpdir(), `peaks-autonomous-root-${Date.now()}-${Math.random()}`)): WorkspaceConfig {
  return {
    workspaceId: 'ws-autonomous',
    name: 'Autonomous Workspace',
    rootPath,
    installedCapabilityIds: []
  };
}

function getLocalArtifactPath(rootPath: string): string {
  return join(dirname(rootPath), `${basename(rootPath)}.peaks-artifacts`);
}

function createWorkspaceWithArtifactWorkspace(): { workspace: WorkspaceConfig; artifactWorkspace: string } {
  const workspace = createWorkspace();
  const artifactWorkspace = getLocalArtifactPath(workspace.rootPath);
  mkdirSync(join(artifactWorkspace, '.peaks'), { recursive: true });
  writeFileSync(join(artifactWorkspace, '.peaks', 'config.json'), '{}', 'utf8');
  return { workspace, artifactWorkspace };
}

function writeApprovedTechArtifacts(artifactWorkspace: string, changeId: string): void {
  const architectureRoot = join(artifactWorkspace, '.peaks', 'changes', changeId, 'architecture');
  mkdirSync(architectureRoot, { recursive: true });
  for (const artifact of TECH_REQUIRED_ARTIFACTS) {
    writeFileSync(join(architectureRoot, artifact), artifact === 'tech-approval-record.md' ? 'status: approved' : 'ready', 'utf8');
  }
}

function writeResumeArtifacts(artifactWorkspace: string, changeId: string): void {
  const changeRoot = join(artifactWorkspace, '.peaks', 'changes', changeId);
  const artifacts = [
    join(changeRoot, 'prd', 'autonomous-goal-package.json'),
    join(changeRoot, 'swarm', 'autonomous-rd-plan.json'),
    join(changeRoot, 'swarm', 'checkpoints', 'checkpoint-1.json'),
    join(changeRoot, 'swarm', 'evidence', 'validation-report.md'),
    join(changeRoot, 'swarm', 'resume-instructions.md')
  ];

  for (const artifact of artifacts) {
    mkdirSync(dirname(artifact), { recursive: true });
    writeFileSync(artifact, 'ready', 'utf8');
  }
}

describe('createAutonomousWorkflowPlan', () => {
  test('creates a resumable autonomous goal package and dry-run constraints', () => {
    const plan = createAutonomousWorkflowPlan({
      mode: 'solo',
      changeId: 'ice-cola-governance',
      goal: 'Govern the Ice Cola project without changing product behavior',
      maxWorkers: 40,
      dryRun: true
    });

    expect(plan.changeId).toBe('ice-cola-governance');
    expect(plan.mode).toBe('solo');
    expect(plan.dryRun).toBe(true);
    expect(plan.goalPackage.doneCondition).toContain('acceptance criteria pass');
    expect(plan.goalPackage.resumeCondition).toContain('checkpoint');
    expect(plan.goalPackage.nonGoals).toContain('Change product behavior without explicit approval.');
    expect(plan.constraints).toContain('dry-run-only');
    expect(plan.constraints).toContain('do-not-launch-workers');
    expect(plan.goalCommand.durable).toBe(false);
    expect(plan.goalCommand.command).toContain('/goal');
  });

  test('models curated accessRepo and mcpServer capabilities without activation', () => {
    const plan = createAutonomousWorkflowPlan({
      mode: 'solo',
      changeId: 'capability-reuse',
      goal: 'Plan capability reuse for frontend governance',
      dryRun: true
    });

    expect(plan.capabilityPlan.sources).toEqual(['docs/accessRepo.md', 'docs/mcpServer.md', 'skills/*/SKILL.md']);
    expect(plan.capabilityPlan.candidates.map((candidate) => candidate.purpose)).toContain('frontend-browser-validation');
    expect(plan.capabilityPlan.candidates.map((candidate) => candidate.purpose)).toContain('swarm-orchestration');
    expect(plan.capabilityPlan.candidates.map((candidate) => candidate.purpose)).toContain('docs-lookup');
    expect(plan.capabilityPlan.candidates.filter((candidate) => candidate.trustLevel === 'user-curated').every((candidate) => candidate.activation === 'not-active')).toBe(true);
    expect(plan.capabilityPlan.candidates.find((candidate) => candidate.id === 'local-peaks-skills')?.activation).toBe('available');
    expect(plan.capabilityPlan.policy).toContain('reuse-curated-capabilities-before-custom-build');
  });

  test('returns preview-safe next actions when artifact workspace is unavailable', () => {
    const plan = createAutonomousWorkflowPlan({
      mode: 'team',
      changeId: 'resume-preview',
      goal: 'Resume autonomous RD planning after compact',
      dryRun: true
    });

    expect(plan.available).toBe(false);
    expect(plan.behavior).toBe('preview');
    expect(plan.blockedReasons).toContain('artifact-workspace-unavailable');
    expect(plan.nextActions.length).toBeGreaterThan(0);
    expect(plan.resumePlan.status).toBe('preview');
  });

  test('keeps resume preview when artifact workspace exists but tech approval blocks planning', () => {
    const { workspace, artifactWorkspace } = createWorkspaceWithArtifactWorkspace();
    const plan = createAutonomousWorkflowPlan({
      mode: 'solo',
      changeId: 'resume-blocked',
      goal: 'Resume autonomous RD planning from artifacts',
      maxWorkers: 40,
      dryRun: true,
      workspace,
      artifactWorkspacePath: artifactWorkspace
    });

    expect(plan.available).toBe(false);
    expect(plan.resumePlan.status).toBe('preview');
    expect(plan.blockedReasons).toContain('tech-approval-required');
  });

  test('keeps resume preview when resume artifacts are missing', () => {
    const { workspace, artifactWorkspace } = createWorkspaceWithArtifactWorkspace();
    writeApprovedTechArtifacts(artifactWorkspace, 'resume-artifacts-missing');
    const plan = createAutonomousWorkflowPlan({
      mode: 'solo',
      changeId: 'resume-artifacts-missing',
      goal: 'Resume autonomous RD planning from artifacts',
      maxWorkers: 40,
      dryRun: true,
      workspace,
      artifactWorkspacePath: artifactWorkspace
    });

    expect(plan.available).toBe(false);
    expect(plan.resumePlan.status).toBe('preview');
    expect(plan.blockedReasons).toContain('resume-artifacts-missing');
    expect(plan.nextActions.join('\n')).toContain('Persist autonomous goal package');
  });

  test('keeps resume preview when a resume artifact is not a file', () => {
    const { workspace, artifactWorkspace } = createWorkspaceWithArtifactWorkspace();
    writeApprovedTechArtifacts(artifactWorkspace, 'resume-directory-artifact');
    writeResumeArtifacts(artifactWorkspace, 'resume-directory-artifact');
    const checkpointPath = join(artifactWorkspace, '.peaks', 'changes', 'resume-directory-artifact', 'swarm', 'checkpoints', 'checkpoint-1.json');
    rmSync(checkpointPath);
    mkdirSync(checkpointPath, { recursive: true });
    const plan = createAutonomousWorkflowPlan({
      mode: 'solo',
      changeId: 'resume-directory-artifact',
      goal: 'Resume autonomous RD planning from artifacts',
      maxWorkers: 40,
      dryRun: true,
      workspace,
      artifactWorkspacePath: artifactWorkspace
    });

    expect(plan.available).toBe(false);
    expect(plan.resumePlan.status).toBe('preview');
    expect(plan.blockedReasons).toContain('resume-artifacts-missing');
  });

  test('marks resume ready when artifact workspace, tech gate, and resume artifacts are available', () => {
    const { workspace, artifactWorkspace } = createWorkspaceWithArtifactWorkspace();
    writeApprovedTechArtifacts(artifactWorkspace, 'resume-ready');
    writeResumeArtifacts(artifactWorkspace, 'resume-ready');
    const plan = createAutonomousWorkflowPlan({
      mode: 'solo',
      changeId: 'resume-ready',
      goal: 'Resume autonomous RD planning from artifacts',
      maxWorkers: 40,
      dryRun: true,
      workspace,
      artifactWorkspacePath: artifactWorkspace
    });

    expect(plan.available).toBe(true);
    expect(plan.resumePlan.status).toBe('ready');
    expect(plan.resumePlan.requiredArtifacts).toContain('.peaks/changes/resume-ready/swarm/resume-instructions.md');
    expect(plan.rdPlan.workerTarget).toBe(40);
  });

  test('rejects invalid change id and empty goal', () => {
    expect(() => createAutonomousWorkflowPlan({ mode: 'solo', changeId: '../escape', goal: 'x', dryRun: true })).toThrow('Invalid change-id');
    expect(() => createAutonomousWorkflowPlan({ mode: 'solo', changeId: 'empty-goal', goal: '   ', dryRun: true })).toThrow('Goal must be non-empty');
  });
});
