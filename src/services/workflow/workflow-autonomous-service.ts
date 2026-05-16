import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { buildArtifactRelativePath, validateChangeIdOrThrow } from '../../shared/change-id.js';
import { WORKSPACE_UNAVAILABLE_NEXT_ACTIONS } from '../../shared/planner-response.js';
import { hasValidArtifactWorkspace } from '../artifacts/workspace-service.js';
import type { WorkspaceConfig } from '../config/config-types.js';
import { createRdSwarmPlan, type RdPlanResult } from '../rd/rd-service.js';
import { createWorkflowRouterPlan, type WorkflowMode, type WorkflowRouterPlan } from './workflow-router-service.js';

export type CapabilityPurpose =
  | 'code-standards'
  | 'project-scanning'
  | 'frontend-browser-validation'
  | 'minimax-execution-skills'
  | 'cross-session-memory'
  | 'ui-design'
  | 'openspec'
  | 'swarm-orchestration'
  | 'docs-lookup';

export type CapabilityActivation = 'available' | 'needs-install' | 'needs-credentials' | 'not-active';
export type CapabilityTrustLevel = 'local' | 'user-curated' | 'third-party';

export type CapabilityCandidate = {
  readonly id: string;
  readonly source: string;
  readonly purpose: CapabilityPurpose;
  readonly trustLevel: CapabilityTrustLevel;
  readonly activation: CapabilityActivation;
  readonly risk: readonly string[];
};

export type AutonomousWorkflowRequest = {
  readonly mode: WorkflowMode;
  readonly changeId: string;
  readonly goal: string;
  readonly maxWorkers?: number;
  readonly dryRun: true;
  readonly artifactWorkspacePath?: string;
  readonly workspace?: WorkspaceConfig;
};

export type AutonomousGoalPackage = {
  readonly changeId: string;
  readonly goal: string;
  readonly nonGoals: readonly string[];
  readonly preservedBehavior: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly doneCondition: string;
  readonly resumeCondition: string;
  readonly riskNotes: readonly string[];
};

export type AutonomousCapabilityPlan = {
  readonly sources: readonly string[];
  readonly policy: readonly string[];
  readonly candidates: readonly CapabilityCandidate[];
};

export type AutonomousResumePlan = {
  readonly status: 'preview' | 'ready';
  readonly checkpoints: readonly string[];
  readonly requiredArtifacts: readonly string[];
  readonly resumeInstructions: string;
};

export type AutonomousGoalCommand = {
  readonly command: string;
  readonly durable: false;
  readonly reason: string;
};

export type AutonomousWorkflowPlan = {
  readonly available: boolean;
  readonly behavior: 'preview' | 'ready';
  readonly changeId: string;
  readonly goal: string;
  readonly mode: WorkflowMode;
  readonly dryRun: true;
  readonly goalPackage: AutonomousGoalPackage;
  readonly goalCommand: AutonomousGoalCommand;
  readonly capabilityPlan: AutonomousCapabilityPlan;
  readonly routePlan: WorkflowRouterPlan;
  readonly modelAssignments: WorkflowRouterPlan['modelAssignments'];
  readonly rdPlan: RdPlanResult;
  readonly resumePlan: AutonomousResumePlan;
  readonly constraints: readonly string[];
  readonly blockedReasons: readonly string[];
  readonly nextActions: readonly string[];
};

const AUTONOMOUS_CONSTRAINTS = Object.freeze([
  'dry-run-only',
  'do-not-launch-workers',
  'do-not-install-capabilities',
  'do-not-mutate-claude-settings',
  'do-not-mutate-target-repo',
  'artifact-backed-resume-required',
  'evidence-before-resume'
]);

const RESUME_ARTIFACTS_MISSING_NEXT_ACTIONS = Object.freeze([
  'Persist autonomous goal package, RD plan, checkpoint, validation evidence, and resume instructions before autonomous resume.'
]);

function normalizeGoal(goal: string): string {
  const normalized = goal.trim();
  if (!normalized) {
    throw new Error('Goal must be non-empty');
  }
  return normalized;
}

function hasArtifactWorkspace(request: AutonomousWorkflowRequest): boolean {
  return !!request.workspace && !!request.artifactWorkspacePath && hasValidArtifactWorkspace(request.workspace, request.artifactWorkspacePath);
}

function createGoalPackage(changeId: string, goal: string): AutonomousGoalPackage {
  return {
    changeId,
    goal,
    nonGoals: [
      'Change product behavior without explicit approval.',
      'Install MCP servers, hooks, agents, or router configuration during dry-run planning.',
      'Store API keys or provider credentials in Peaks artifacts.'
    ],
    preservedBehavior: [
      'Existing product behavior remains stable unless the accepted goal explicitly changes it.',
      'Existing repository source files are not mutated by dry-run planning.',
      'Intermediate artifacts remain outside the target repository source tree.'
    ],
    acceptanceCriteria: [
      'A resumable autonomous RD plan exists with checkpoints, worker queue, and validation evidence requirements.',
      'Curated capabilities from docs/accessRepo.md and docs/mcpServer.md are considered before custom implementation.',
      'Resume after compact verifies checkpoints and evidence before continuing.',
      'All execution remains dry-run until explicitly approved.'
    ],
    doneCondition: `The ${changeId} autonomous plan is complete when all acceptance criteria pass, the worker queue is empty or blocked with next actions, and validation evidence is recorded.`,
    resumeCondition: `Resume ${changeId} only after checkpoint artifacts, worker queue state, and validation evidence requirements have been verified.`,
    riskNotes: [
      'Claude Code /goal is session-scoped and cannot be the only durable state source.',
      'External capabilities may require installation, credentials, network access, or settings changes.',
      'Large swarms need conflict groups and reducer evidence to avoid unsafe parallel edits.'
    ]
  };
}

function createCapabilityPlan(): AutonomousCapabilityPlan {
  return {
    sources: ['docs/accessRepo.md', 'docs/mcpServer.md', 'skills/*/SKILL.md'],
    policy: [
      'reuse-curated-capabilities-before-custom-build',
      'plan-capability-use-before-activation',
      'require-explicit-approval-for-install-credentials-network-or-settings-mutation'
    ],
    candidates: [
      { id: 'accessrepo-code-standards', source: 'docs/accessRepo.md', purpose: 'code-standards', trustLevel: 'user-curated', activation: 'not-active', risk: ['third-party-source', 'network-access-if-fetched'] },
      { id: 'accessrepo-project-scanning', source: 'docs/accessRepo.md', purpose: 'project-scanning', trustLevel: 'user-curated', activation: 'not-active', risk: ['third-party-source', 'network-access-if-fetched'] },
      { id: 'accessrepo-frontend-browser', source: 'docs/accessRepo.md', purpose: 'frontend-browser-validation', trustLevel: 'user-curated', activation: 'not-active', risk: ['browser-automation', 'network-access-if-fetched'] },
      { id: 'accessrepo-minimax-skills', source: 'docs/accessRepo.md', purpose: 'minimax-execution-skills', trustLevel: 'user-curated', activation: 'not-active', risk: ['model-provider-specific', 'network-access-if-fetched'] },
      { id: 'accessrepo-cross-session-memory', source: 'docs/accessRepo.md', purpose: 'cross-session-memory', trustLevel: 'user-curated', activation: 'not-active', risk: ['state-persistence', 'network-access-if-fetched'] },
      { id: 'accessrepo-ui-design', source: 'docs/accessRepo.md', purpose: 'ui-design', trustLevel: 'user-curated', activation: 'not-active', risk: ['third-party-source', 'design-dependency-drift'] },
      { id: 'accessrepo-openspec', source: 'docs/accessRepo.md', purpose: 'openspec', trustLevel: 'user-curated', activation: 'not-active', risk: ['process-coupling'] },
      { id: 'accessrepo-swarm-orchestration', source: 'docs/accessRepo.md', purpose: 'swarm-orchestration', trustLevel: 'user-curated', activation: 'not-active', risk: ['coordination-overhead', 'network-access-if-fetched'] },
      { id: 'mcp-context7', source: 'docs/mcpServer.md', purpose: 'docs-lookup', trustLevel: 'user-curated', activation: 'not-active', risk: ['network-access', 'external-doc-content'] },
      { id: 'mcp-playwright-browser', source: 'docs/mcpServer.md', purpose: 'frontend-browser-validation', trustLevel: 'user-curated', activation: 'not-active', risk: ['browser-automation', 'network-access'] },
      { id: 'local-peaks-skills', source: 'skills/*/SKILL.md', purpose: 'swarm-orchestration', trustLevel: 'local', activation: 'available', risk: ['local-skill-boundary-misuse'] }
    ]
  };
}

function createGoalCommand(goalPackage: AutonomousGoalPackage): AutonomousGoalCommand {
  return {
    command: `/goal ${goalPackage.doneCondition}`,
    durable: false,
    reason: 'Claude Code /goal can help continue across turns in the current session, but Peaks artifacts remain the durable state.'
  };
}

function getResumeRequiredArtifacts(changeId: string): string[] {
  return [
    buildArtifactRelativePath(changeId, 'prd', 'autonomous-goal-package.json'),
    buildArtifactRelativePath(changeId, 'swarm', 'autonomous-rd-plan.json'),
    buildArtifactRelativePath(changeId, 'swarm', 'checkpoints', 'checkpoint-1.json'),
    buildArtifactRelativePath(changeId, 'swarm', 'evidence', 'validation-report.md'),
    buildArtifactRelativePath(changeId, 'swarm', 'resume-instructions.md')
  ];
}

function hasRequiredResumeArtifact(artifactWorkspacePath: string, artifact: string): boolean {
  try {
    return lstatSync(join(artifactWorkspacePath, artifact)).isFile();
  } catch {
    return false;
  }
}

function hasRequiredResumeArtifacts(artifactWorkspacePath: string | undefined, requiredArtifacts: readonly string[]): boolean {
  return !!artifactWorkspacePath && requiredArtifacts.every((artifact) => hasRequiredResumeArtifact(artifactWorkspacePath, artifact));
}

function createResumePlan(changeId: string, ready: boolean): AutonomousResumePlan {
  const requiredArtifacts = getResumeRequiredArtifacts(changeId);

  return {
    status: ready ? 'ready' : 'preview',
    checkpoints: ['goal-package-created', 'capabilities-planned', 'rd-swarm-planned', 'validation-evidence-required'],
    requiredArtifacts,
    resumeInstructions: ready
      ? 'Before continuing, verify checkpoint artifacts, pending worker queue state, and validation evidence requirements.'
      : 'Resolve blocked planning reasons before relying on autonomous resume state.'
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function createAutonomousWorkflowPlan(request: AutonomousWorkflowRequest): AutonomousWorkflowPlan {
  validateChangeIdOrThrow(request.changeId);
  const goal = normalizeGoal(request.goal);
  const maxWorkers = request.maxWorkers ?? 40;
  const sharedWorkspaceOptions = {
    ...(request.artifactWorkspacePath ? { artifactWorkspacePath: request.artifactWorkspacePath } : {}),
    ...(request.workspace ? { workspace: request.workspace } : {})
  };
  const goalPackage = createGoalPackage(request.changeId, goal);
  const available = hasArtifactWorkspace(request);
  const routePlan = createWorkflowRouterPlan({
    mode: request.mode,
    changeId: request.changeId,
    goal,
    maxWorkers,
    dryRun: true,
    ...sharedWorkspaceOptions
  });
  const rdPlan = createRdSwarmPlan({
    skill: 'rd',
    changeId: request.changeId,
    goal,
    maxWorkers,
    dryRun: true,
    ...sharedWorkspaceOptions
  });
  const requiredArtifacts = getResumeRequiredArtifacts(request.changeId);
  const hasResumeArtifacts = hasRequiredResumeArtifacts(request.artifactWorkspacePath, requiredArtifacts);
  const blockedReasons = uniqueStrings([
    ...routePlan.blockedReasons,
    ...rdPlan.blockedReasons,
    ...(available ? [] : ['artifact-workspace-unavailable']),
    ...(hasResumeArtifacts ? [] : ['resume-artifacts-missing'])
  ]);
  const ready = available && blockedReasons.length === 0;

  return {
    available: ready,
    behavior: ready ? 'ready' : 'preview',
    changeId: request.changeId,
    goal,
    mode: request.mode,
    dryRun: true,
    goalPackage,
    goalCommand: createGoalCommand(goalPackage),
    capabilityPlan: createCapabilityPlan(),
    routePlan,
    modelAssignments: routePlan.modelAssignments,
    rdPlan,
    resumePlan: createResumePlan(request.changeId, ready),
    constraints: [...AUTONOMOUS_CONSTRAINTS],
    blockedReasons,
    nextActions: available
      ? uniqueStrings([...routePlan.nextActions, ...rdPlan.nextActions, ...(hasResumeArtifacts ? [] : RESUME_ARTIFACTS_MISSING_NEXT_ACTIONS)])
      : [...WORKSPACE_UNAVAILABLE_NEXT_ACTIONS]
  };
}
