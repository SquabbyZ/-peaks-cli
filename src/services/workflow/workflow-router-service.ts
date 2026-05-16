import type { WorkspaceConfig } from '../config/config-types.js';
import { createRdSwarmPlan, type RdPlanResult } from '../rd/rd-service.js';
import { createTechPlan, getTechStatus, type TechPlanResult, type TechStatus } from '../tech/tech-service.js';
import { validateChangeIdOrThrow } from '../../shared/change-id.js';
import { WORKSPACE_UNAVAILABLE_NEXT_ACTIONS } from '../../shared/planner-response.js';

export type WorkflowMode = 'solo' | 'team';
export type ModelTier = 'top-tier' | 'mid-tier';
export type ModelRole = 'strongest' | 'execution';
export type WorkflowRoutePolicy = 'solo-broad-multi-model' | 'team-rd-limited-multi-model';
export type WorkflowStepStage = 'product-direction' | 'design-direction' | 'tech-direction' | 'tech-review' | 'rd-planning' | 'coding-execution' | 'unit-test-execution' | 'quality-review';
export type WorkflowStepOwner = 'peaks-solo' | 'peaks-rd' | 'peaks-tech' | 'human';

export type WorkflowRouterRequest = {
  changeId: string;
  goal: string;
  mode: WorkflowMode;
  maxWorkers?: number;
  dryRun: true;
  artifactWorkspacePath?: string;
  workspace?: WorkspaceConfig;
};

export type WorkflowRouterStep = {
  readonly id: string;
  readonly stage: WorkflowStepStage;
  readonly owner: WorkflowStepOwner;
  readonly modelTier: ModelTier;
  readonly modelRole: ModelRole;
  readonly modelId: string;
  readonly reason: string;
  readonly dryRunOnly: true;
  readonly invokesAgents: false;
  readonly writesArtifacts: false;
  readonly dependsOn: readonly string[];
};

export type WorkflowModelRouting = {
  readonly strongestModel: {
    readonly modelId: 'claude-opus-4-7';
    readonly uses: readonly WorkflowStepStage[];
  };
  readonly executionModel: {
    readonly modelId: 'minimax-2.7';
    readonly uses: readonly WorkflowStepStage[];
  };
};

export type WorkflowRouterPlan = {
  readonly changeId: string;
  readonly goal: string;
  readonly mode: WorkflowMode;
  readonly dryRun: true;
  readonly routePolicy: WorkflowRoutePolicy;
  readonly modelRouting: WorkflowModelRouting;
  readonly techStatus: TechStatus;
  readonly techPlan: TechPlanResult;
  readonly rdPlan: RdPlanResult;
  readonly steps: readonly WorkflowRouterStep[];
  readonly blockedReasons: readonly string[];
  readonly nextActions: readonly string[];
  readonly constraints: readonly string[];
};

const WORKFLOW_CONSTRAINTS = Object.freeze([
  'dry-run-only',
  'do-not-launch-agents',
  'do-not-write-artifacts',
  'do-not-mutate-target-repo',
  'model-tier-hints-only'
]);

const STRONGEST_MODEL_ID = 'claude-opus-4-7' as const;
const EXECUTION_MODEL_ID = 'minimax-2.7' as const;
const EXECUTION_STAGES: readonly WorkflowStepStage[] = ['coding-execution', 'unit-test-execution'];

export function isWorkflowMode(mode: string): mode is WorkflowMode {
  return mode === 'solo' || mode === 'team';
}

function assertSupportedMode(mode: string): asserts mode is WorkflowMode {
  if (!isWorkflowMode(mode)) {
    throw new Error('Unsupported workflow mode');
  }
}

function normalizeGoal(goal: string): string {
  const normalized = goal.trim();
  if (!normalized) {
    throw new Error('Goal must be non-empty');
  }
  return normalized;
}

function step(input: Omit<WorkflowRouterStep, 'dryRunOnly' | 'invokesAgents' | 'writesArtifacts' | 'modelRole' | 'modelId'>): WorkflowRouterStep {
  const modelRole: ModelRole = EXECUTION_STAGES.includes(input.stage) ? 'execution' : 'strongest';
  return {
    ...input,
    modelRole,
    modelId: modelRole === 'execution' ? EXECUTION_MODEL_ID : STRONGEST_MODEL_ID,
    dryRunOnly: true,
    invokesAgents: false,
    writesArtifacts: false
  };
}

function createSoloSteps(): WorkflowRouterStep[] {
  return [
    step({ id: 'solo-product-direction', stage: 'product-direction', owner: 'peaks-solo', modelTier: 'top-tier', reason: 'Product direction needs strong judgment before execution work is delegated.', dependsOn: [] }),
    step({ id: 'solo-design-direction', stage: 'design-direction', owner: 'peaks-solo', modelTier: 'top-tier', reason: 'Design direction should be set by a stronger model before cheaper implementation work.', dependsOn: ['solo-product-direction'] }),
    step({ id: 'solo-tech-direction', stage: 'tech-direction', owner: 'peaks-tech', modelTier: 'top-tier', reason: 'Technical boundaries and approval gates need high-confidence planning.', dependsOn: ['solo-design-direction'] }),
    step({ id: 'solo-tech-review', stage: 'tech-review', owner: 'peaks-tech', modelTier: 'top-tier', reason: 'Tech artifacts and gate decisions require strong review.', dependsOn: ['solo-tech-direction'] }),
    step({ id: 'solo-rd-planning', stage: 'rd-planning', owner: 'peaks-rd', modelTier: 'top-tier', reason: 'RD task decomposition and acceptance criteria need strong planning before execution delegation.', dependsOn: ['solo-tech-review'] }),
    step({ id: 'solo-coding-execution', stage: 'coding-execution', owner: 'peaks-rd', modelTier: 'mid-tier', reason: 'Coding and routine refactoring should be delegated to MiniMax 2.7 execution workers.', dependsOn: ['solo-rd-planning'] }),
    step({ id: 'solo-unit-test-execution', stage: 'unit-test-execution', owner: 'peaks-rd', modelTier: 'mid-tier', reason: 'Unit test authoring and focused test runs should be delegated to MiniMax 2.7 execution workers.', dependsOn: ['solo-coding-execution'] }),
    step({ id: 'solo-quality-review', stage: 'quality-review', owner: 'peaks-solo', modelTier: 'top-tier', reason: 'Reducer and final quality gates need strong synthesis and risk review.', dependsOn: ['solo-unit-test-execution'] })
  ];
}

function createTeamSteps(): WorkflowRouterStep[] {
  return [
    step({ id: 'team-product-direction', stage: 'product-direction', owner: 'human', modelTier: 'top-tier', reason: 'Team product direction should stay on the governed planning path.', dependsOn: [] }),
    step({ id: 'team-design-direction', stage: 'design-direction', owner: 'human', modelTier: 'top-tier', reason: 'Team design direction should preserve reviewability and accountability.', dependsOn: ['team-product-direction'] }),
    step({ id: 'team-tech-direction', stage: 'tech-direction', owner: 'peaks-tech', modelTier: 'top-tier', reason: 'Team technical plans should remain strongly governed before RD execution.', dependsOn: ['team-design-direction'] }),
    step({ id: 'team-tech-review', stage: 'tech-review', owner: 'peaks-tech', modelTier: 'top-tier', reason: 'Team tech approval requires strong review before execution.', dependsOn: ['team-tech-direction'] }),
    step({ id: 'team-rd-planning', stage: 'rd-planning', owner: 'peaks-rd', modelTier: 'top-tier', reason: 'Team RD task decomposition remains on the governed strongest-model path.', dependsOn: ['team-tech-review'] }),
    step({ id: 'team-coding-execution', stage: 'coding-execution', owner: 'peaks-rd', modelTier: 'mid-tier', reason: 'MiniMax 2.7 should execute bounded coding tasks, not govern the whole team workflow.', dependsOn: ['team-rd-planning'] }),
    step({ id: 'team-unit-test-execution', stage: 'unit-test-execution', owner: 'peaks-rd', modelTier: 'mid-tier', reason: 'MiniMax 2.7 should execute unit-test tasks under RD constraints.', dependsOn: ['team-coding-execution'] }),
    step({ id: 'team-quality-review', stage: 'quality-review', owner: 'peaks-rd', modelTier: 'top-tier', reason: 'Team RD outputs still need reducer and quality review gates.', dependsOn: ['team-unit-test-execution'] })
  ];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function createModelRouting(steps: readonly WorkflowRouterStep[]): WorkflowModelRouting {
  return {
    strongestModel: {
      modelId: STRONGEST_MODEL_ID,
      uses: steps.filter((step) => step.modelRole === 'strongest').map((step) => step.stage)
    },
    executionModel: {
      modelId: EXECUTION_MODEL_ID,
      uses: steps.filter((step) => step.modelRole === 'execution').map((step) => step.stage)
    }
  };
}

function getTechPlanBlockedReasons(techPlan: TechPlanResult): string[] {
  return techPlan.available ? techPlan.blockedReasons : techPlan.preview.blockedReasons;
}

function getTechPlanNextActions(techPlan: TechPlanResult): string[] {
  return [...techPlan.nextActions];
}

export function createWorkflowRouterPlan(request: WorkflowRouterRequest): WorkflowRouterPlan {
  assertSupportedMode(request.mode);
  validateChangeIdOrThrow(request.changeId);
  const goal = normalizeGoal(request.goal);
  const maxWorkers = request.maxWorkers ?? 40;
  const sharedWorkspaceOptions = {
    ...(request.artifactWorkspacePath ? { artifactWorkspacePath: request.artifactWorkspacePath } : {}),
    ...(request.workspace ? { workspace: request.workspace } : {})
  };
  const techStatus = getTechStatus({ changeId: request.changeId, ...sharedWorkspaceOptions });
  const techPlan = createTechPlan({ changeId: request.changeId, goal, swarm: true, dryRun: true, ...sharedWorkspaceOptions });
  const rdPlan = createRdSwarmPlan({ skill: 'rd', changeId: request.changeId, goal, maxWorkers, dryRun: true, ...sharedWorkspaceOptions });
  const steps = request.mode === 'solo' ? createSoloSteps() : createTeamSteps();
  const blockedReasons = uniqueStrings([
    ...techStatus.blockedReasons,
    ...getTechPlanBlockedReasons(techPlan),
    ...rdPlan.blockedReasons
  ]);
  const nextActions = blockedReasons.includes('artifact-workspace-unavailable')
    ? [...WORKSPACE_UNAVAILABLE_NEXT_ACTIONS]
    : uniqueStrings([...techStatus.nextActions, ...getTechPlanNextActions(techPlan), ...rdPlan.nextActions]);

  return {
    changeId: request.changeId,
    goal,
    mode: request.mode,
    dryRun: true,
    routePolicy: request.mode === 'solo' ? 'solo-broad-multi-model' : 'team-rd-limited-multi-model',
    modelRouting: createModelRouting(steps),
    techStatus,
    techPlan,
    rdPlan,
    steps,
    blockedReasons,
    nextActions,
    constraints: [...WORKFLOW_CONSTRAINTS]
  };
}
