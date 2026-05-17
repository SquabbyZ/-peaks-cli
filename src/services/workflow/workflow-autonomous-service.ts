import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { buildArtifactRelativePath, validateChangeIdOrThrow } from '../../shared/change-id.js';
import { WORKSPACE_UNAVAILABLE_NEXT_ACTIONS } from '../../shared/planner-response.js';
import { hasValidArtifactWorkspace } from '../artifacts/workspace-service.js';
import type { ModelProviderConfig, WorkspaceConfig } from '../config/config-types.js';
import { createRdSwarmPlan, type RdPlanResult } from '../rd/rd-service.js';
import { createWorkflowRouterPlan, type SoloMode, type WorkflowMode, type WorkflowRouterPlan } from './workflow-router-service.js';

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
  readonly soloMode?: SoloMode;
  readonly changeId: string;
  readonly goal: string;
  readonly maxWorkers?: number;
  readonly dryRun: true;
  readonly artifactWorkspacePath?: string;
  readonly workspace?: WorkspaceConfig;
  readonly config?: {
    readonly economyMode?: boolean;
    readonly swarmMode?: boolean;
    readonly providers?: ModelProviderConfig;
  };
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

const RESUME_ARTIFACTS_INVALID_NEXT_ACTIONS = Object.freeze([
  'Refresh autonomous resume artifacts with matching change ids, valid JSON state, and passed validation evidence before autonomous resume.'
]);

const MAX_RESUME_ARTIFACT_BYTES = 256_000;

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

type ResumeArtifactsStatus = 'ready' | 'missing' | 'invalid';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInsidePath(childPath: string, parentPath: string): boolean {
  const relativePath = relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function readFully(fd: number, size: number): string | null {
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const bytesRead = readSync(fd, buffer, offset, size - offset, offset);
    if (bytesRead === 0) {
      return null;
    }
    offset += bytesRead;
  }
  return buffer.toString('utf8');
}

function readResumeArtifact(artifactWorkspacePath: string, artifact: string): string | null {
  const artifactPath = resolve(artifactWorkspacePath, artifact);
  try {
    const artifactWorkspaceRealPath = realpathSync(artifactWorkspacePath);
    const artifactStat = lstatSync(artifactPath);
    if (artifactStat.isSymbolicLink() || !artifactStat.isFile() || artifactStat.size > MAX_RESUME_ARTIFACT_BYTES) {
      return null;
    }

    const artifactRealPath = realpathSync(artifactPath);
    if (!isInsidePath(artifactRealPath, artifactWorkspaceRealPath)) {
      return null;
    }

    const fd = openSync(artifactPath, 'r');
    try {
      const openedStat = fstatSync(fd);
      const currentStat = statSync(artifactPath);
      if (!openedStat.isFile() || openedStat.size > MAX_RESUME_ARTIFACT_BYTES || openedStat.dev !== artifactStat.dev || openedStat.ino !== artifactStat.ino || openedStat.dev !== currentStat.dev || openedStat.ino !== currentStat.ino) {
        return null;
      }
      return readFully(fd, openedStat.size);
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

type ResumeArtifactType = 'goal-package' | 'rd-plan' | 'checkpoint' | 'validation-report' | 'resume-instructions';

function getExpectedResumeArtifactType(artifact: string): ResumeArtifactType {
  if (artifact.endsWith('/autonomous-goal-package.json')) return 'goal-package';
  if (artifact.endsWith('/autonomous-rd-plan.json')) return 'rd-plan';
  if (artifact.endsWith('/checkpoint-1.json')) return 'checkpoint';
  if (artifact.endsWith('/validation-report.md')) return 'validation-report';
  return 'resume-instructions';
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function hasValidGoalPackageJson(parsed: Record<string, unknown>, goal: string): boolean {
  return parsed.goal === goal
    && typeof parsed.doneCondition === 'string'
    && parsed.doneCondition.trim().length > 0
    && typeof parsed.resumeCondition === 'string'
    && parsed.resumeCondition.trim().length > 0
    && hasStringArray(parsed.acceptanceCriteria);
}

function hasValidRdPlanJson(parsed: Record<string, unknown>): boolean {
  return parsed.workerQueueStatus === 'ready'
    && typeof parsed.taskCount === 'number'
    && Number.isInteger(parsed.taskCount)
    && parsed.taskCount > 0
    && parsed.reducerRequired === true;
}

function hasValidCheckpointJson(parsed: Record<string, unknown>): boolean {
  return parsed.checkpointId === 'checkpoint-1'
    && typeof parsed.createdAt === 'string'
    && parsed.createdAt.trim().length > 0
    && isObjectRecord(parsed.workerQueueState)
    && hasStringArray(parsed.validationRefs);
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasValidJsonMetadata(content: string, changeId: string, artifactType: string, goal: string): boolean {
  const parsed = parseJsonObject(content);
  if (parsed === null || parsed.changeId !== changeId || parsed.artifactType !== artifactType || parsed.status !== 'ready') {
    return false;
  }

  if (artifactType === 'goal-package') return hasValidGoalPackageJson(parsed, goal);
  if (artifactType === 'rd-plan') return hasValidRdPlanJson(parsed);
  return artifactType === 'checkpoint' && hasValidCheckpointJson(parsed);
}

function parseFrontMatter(content: string): Record<string, string> | null {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') {
    return null;
  }

  const endIndex = lines.slice(1).findIndex((line) => line === '---');
  if (endIndex === -1) {
    return null;
  }

  const metadata = new Map<string, string>();
  for (const line of lines.slice(1, endIndex + 1)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }

    metadata.set(line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim());
  }

  return Object.fromEntries(metadata);
}

function getMarkdownBody(content: string): string {
  const lines = content.split(/\r?\n/);
  const endIndex = lines.slice(1).findIndex((line) => line === '---');
  return endIndex === -1 ? '' : lines.slice(endIndex + 2).join('\n');
}

function hasValidationReportBody(body: string): boolean {
  return body.includes('Validation summary:')
    && body.includes('Checks:')
    && body.includes('Result: passed')
    && body.includes('Evidence refs:');
}

function hasResumeInstructionsBody(body: string): boolean {
  return body.includes('Resume steps:')
    && body.includes('Preconditions:')
    && body.includes('Blocked actions:')
    && body.includes('Next actions:');
}

function extractMarkdownListSection(body: string, heading: string): string[] {
  const lines = body.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex === -1) {
    return [];
  }

  const sectionLines = lines.slice(startIndex + 1);
  const nextHeadingIndex = sectionLines.findIndex((line) => /^[A-Z][A-Za-z ]+:$/.test(line.trim()));
  const sectionEndIndex = nextHeadingIndex + 1 || sectionLines.length;
  return sectionLines.slice(0, sectionEndIndex)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0);
}

function getCheckpointValidationRefs(checkpointContent: string): string[] {
  const parsed = parseJsonObject(checkpointContent);
  return parsed && hasStringArray(parsed.validationRefs) ? parsed.validationRefs : [];
}

function isSafeEvidenceRef(ref: string): boolean {
  return ref.toLowerCase() !== 'validation-report.md' && /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(ref) && !ref.includes('..');
}

function evidenceRefsExist(artifactWorkspacePath: string, changeId: string, refs: readonly string[]): boolean {
  return refs.every((ref) => isSafeEvidenceRef(ref) && readResumeArtifact(artifactWorkspacePath, buildArtifactRelativePath(changeId, 'swarm', 'evidence', ref)) !== null);
}

function hasMatchingEvidenceRefs(artifactWorkspacePath: string, changeId: string, validationReportContent: string, checkpointContent: string): boolean {
  const expectedRefs = getCheckpointValidationRefs(checkpointContent);
  const actualRefs = extractMarkdownListSection(getMarkdownBody(validationReportContent), 'Evidence refs:');
  return expectedRefs.length > 0
    && expectedRefs.length === actualRefs.length
    && expectedRefs.every((expectedRef, index) => expectedRef === actualRefs[index])
    && evidenceRefsExist(artifactWorkspacePath, changeId, expectedRefs);
}

function hasValidMarkdownMetadata(content: string, changeId: string, artifactType: string): boolean {
  const metadata = parseFrontMatter(content);
  if (metadata === null || metadata.changeId !== changeId || metadata.artifactType !== artifactType || metadata.status !== 'passed') {
    return false;
  }

  const body = getMarkdownBody(content);
  return artifactType === 'validation-report' ? hasValidationReportBody(body) : hasResumeInstructionsBody(body);
}

function isValidResumeArtifact(artifact: string, content: string, changeId: string, goal: string): boolean {
  if (!content.trim()) {
    return false;
  }

  const artifactType = getExpectedResumeArtifactType(artifact);
  return artifact.endsWith('.json')
    ? hasValidJsonMetadata(content, changeId, artifactType, goal)
    : hasValidMarkdownMetadata(content, changeId, artifactType);
}

function getResumeArtifactsStatus(artifactWorkspacePath: string, requiredArtifacts: readonly string[], changeId: string, goal: string): ResumeArtifactsStatus {
  let hasInvalidArtifact = false;
  const artifactContents = new Map<string, string>();
  for (const artifact of requiredArtifacts) {
    const content = readResumeArtifact(artifactWorkspacePath, artifact);
    if (content === null) {
      return 'missing';
    }

    artifactContents.set(artifact, content);
    if (!isValidResumeArtifact(artifact, content, changeId, goal)) {
      hasInvalidArtifact = true;
    }
  }

  const checkpointContent = artifactContents.get(buildArtifactRelativePath(changeId, 'swarm', 'checkpoints', 'checkpoint-1.json'));
  const validationReportContent = artifactContents.get(buildArtifactRelativePath(changeId, 'swarm', 'evidence', 'validation-report.md'));
  if (!checkpointContent || !validationReportContent || !hasMatchingEvidenceRefs(artifactWorkspacePath, changeId, validationReportContent, checkpointContent)) {
    hasInvalidArtifact = true;
  }

  return hasInvalidArtifact ? 'invalid' : 'ready';
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
    ...(request.soloMode !== undefined ? { soloMode: request.soloMode } : {}),
    changeId: request.changeId,
    goal,
    maxWorkers,
    dryRun: true,
    ...(request.config ? { config: request.config } : {}),
    ...sharedWorkspaceOptions
  });
  const rdPlan = createRdSwarmPlan({
    skill: 'rd',
    changeId: request.changeId,
    goal,
    maxWorkers,
    dryRun: true,
    ...(request.config?.swarmMode !== undefined ? { swarmMode: request.config.swarmMode } : {}),
    executionModelId: routePlan.modeStatus.executionModelId,
    ...sharedWorkspaceOptions
  });
  const requiredArtifacts = getResumeRequiredArtifacts(request.changeId);
  const artifactWorkspacePath = request.artifactWorkspacePath;
  const resumeArtifactsStatus = available && artifactWorkspacePath
    ? getResumeArtifactsStatus(artifactWorkspacePath, requiredArtifacts, request.changeId, goal)
    : 'missing';
  const blockedReasons = uniqueStrings([
    ...routePlan.blockedReasons,
    ...rdPlan.blockedReasons,
    ...(available ? [] : ['artifact-workspace-unavailable']),
    ...(resumeArtifactsStatus === 'missing' ? ['resume-artifacts-missing'] : []),
    ...(resumeArtifactsStatus === 'invalid' ? ['resume-artifacts-invalid'] : [])
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
      ? uniqueStrings([
          ...routePlan.nextActions,
          ...rdPlan.nextActions,
          ...(resumeArtifactsStatus === 'missing' ? RESUME_ARTIFACTS_MISSING_NEXT_ACTIONS : []),
          ...(resumeArtifactsStatus === 'invalid' ? RESUME_ARTIFACTS_INVALID_NEXT_ACTIONS : [])
        ])
      : [...WORKSPACE_UNAVAILABLE_NEXT_ACTIONS]
  };
}
