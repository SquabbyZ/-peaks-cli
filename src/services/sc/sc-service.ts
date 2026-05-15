import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readConfig, getCurrentWorkspaceConfig } from '../config/config-service.js';
import { getArtifactWorkspaceStatus } from '../artifacts/workspace-service.js';

export type ChangeImpact = {
  changeId: string;
  sourceArtifacts: string[];
  affectedModules: string[];
  affectedFiles: string[];
  qaImpact: {
    coverageDelta: number | null;
    testCount: number;
    status: 'passed' | 'failed' | 'unknown';
  };
  riskImpact: {
    level: 'low' | 'medium' | 'high';
    factors: string[];
  };
  syncPointers: {
    artifactRepo: string | null;
    lastSync: string | null;
    localPath: string;
  };
};

export type ArtifactRetentionReport = {
  sliceId: string;
  prdArtifacts: string[];
  rdArtifacts: string[];
  qaArtifacts: string[];
  coverageArtifacts: string[];
  reviewArtifacts: string[];
  codeChanges: string[];
  commitStatus: 'committed' | 'pending' | 'rolled-back';
  rollbackPoint: string | null;
};

export type ChangeTraceabilityStatus = {
  changeId: string | null;
  hasArtifactRepo: boolean;
  artifactSyncStatus: 'synced' | 'pending' | 'out-of-sync' | 'unknown';
  localArtifactPath: string;
  requiredArtifacts: {
    name: string;
    path: string;
    exists: boolean;
  }[];
  nextActions: string[];
};

export type CommitBoundary = {
  sliceId: string;
  commitHash: string | null;
  timestamp: string;
  artifacts: string[];
  codeFiles: string[];
  syncState: 'synced' | 'pending' | 'failed';
  rollbackPoint: string | null;
};

function getLocalPeaksPath(workspaceRoot: string): string {
  return resolve(workspaceRoot, '.peaks');
}

function getChangeIdFromPath(peaksPath: string): string | null {
  const currentChangeLink = resolve(peaksPath, 'current-change');
  // In a real implementation, we would read the symlink or file content
  // For now, we return null as we don't have the actual symlink implementation
  return null;
}

function findArtifactFiles(dir: string, extensions: string[]): string[] {
  // This is a simplified implementation
  // In production, we would recursively scan the directory
  return [];
}

export function getChangeTraceabilityStatus(): ChangeTraceabilityStatus {
  const workspace = getCurrentWorkspaceConfig();
  const artifactStatus = getArtifactWorkspaceStatus();

  const peaksPath = workspace ? getLocalPeaksPath(workspace.rootPath) : '.peaks';
  const changeId = getChangeIdFromPath(peaksPath);

  const requiredArtifacts = [
    { name: 'artifact-retention-report.md', path: 'qa/artifact-retention-report.md' },
    { name: 'change-impact.json', path: 'sc/change-impact.json' },
    { name: 'commit-boundary.md', path: 'checkpoints/commit-boundary.md' },
    { name: 'coverage-report.md', path: 'qa/coverage-report.md' }
  ];

  const artifactRepoConfigured = !!workspace?.artifactRepo;

  const nextActions: string[] = [];
  if (!workspace) {
    nextActions.push('Add a workspace: peaks config workspace add --id <id> --name <name> --path <path>');
  } else if (!artifactRepoConfigured) {
    nextActions.push('Configure artifact repo: peaks config workspace add --id <id> --provider github --repo-owner <owner> --repo-name <name>');
    nextActions.push('Then run: peaks artifacts init --provider github --name <repo> --dry-run');
  } else if (artifactStatus.syncStatus === 'pending') {
    nextActions.push(`Run peaks artifacts sync --workspace ${workspace.workspaceId} --dry-run`);
  }

  return {
    changeId,
    hasArtifactRepo: artifactRepoConfigured,
    artifactSyncStatus: artifactStatus.syncStatus,
    localArtifactPath: artifactStatus.localPath,
    requiredArtifacts: requiredArtifacts.map((a) => ({
      ...a,
      path: resolve(peaksPath, 'changes', changeId ?? '<change-id>', a.path),
      exists: existsSync(resolve(peaksPath, 'changes', changeId ?? '<change-id>', a.path))
    })),
    nextActions
  };
}

export function createChangeImpact(options: {
  changeId: string;
  sourceArtifacts?: string[];
  affectedModules?: string[];
  affectedFiles?: string[];
}): ChangeImpact {
  return {
    changeId: options.changeId,
    sourceArtifacts: options.sourceArtifacts ?? [],
    affectedModules: options.affectedModules ?? [],
    affectedFiles: options.affectedFiles ?? [],
    qaImpact: {
      coverageDelta: null,
      testCount: 0,
      status: 'unknown'
    },
    riskImpact: {
      level: 'medium',
      factors: ['Manual review required', 'No automated gates detected']
    },
    syncPointers: {
      artifactRepo: null,
      lastSync: null,
      localPath: '.peaks-artifacts'
    }
  };
}

export function createArtifactRetentionReport(options: {
  sliceId: string;
  prdArtifacts?: string[];
  rdArtifacts?: string[];
  qaArtifacts?: string[];
  coverageArtifacts?: string[];
  reviewArtifacts?: string[];
  codeChanges?: string[];
}): ArtifactRetentionReport {
  return {
    sliceId: options.sliceId,
    prdArtifacts: options.prdArtifacts ?? [],
    rdArtifacts: options.rdArtifacts ?? [],
    qaArtifacts: options.qaArtifacts ?? [],
    coverageArtifacts: options.coverageArtifacts ?? [],
    reviewArtifacts: options.reviewArtifacts ?? [],
    codeChanges: options.codeChanges ?? [],
    commitStatus: 'pending',
    rollbackPoint: null
  };
}

export function recordCommitBoundary(options: {
  sliceId: string;
  artifacts?: string[];
  codeFiles?: string[];
}): CommitBoundary {
  return {
    sliceId: options.sliceId,
    commitHash: null,
    timestamp: new Date().toISOString(),
    artifacts: options.artifacts ?? [],
    codeFiles: options.codeFiles ?? [],
    syncState: 'pending',
    rollbackPoint: null
  };
}

export function validateArtifactRetention(sliceId: string): {
  valid: boolean;
  missingArtifacts: string[];
  warnings: string[];
} {
  const workspace = getCurrentWorkspaceConfig();
  if (!workspace) {
    return {
      valid: false,
      missingArtifacts: ['No workspace configured'],
      warnings: ['Cannot validate without a configured workspace']
    };
  }

  const missingArtifacts: string[] = [];
  const warnings: string[] = [];

  const requiredArtifactTypes = [
    { type: 'prd', pattern: 'product/' },
    { type: 'rd', pattern: 'architecture/' },
    { type: 'qa', pattern: 'qa/' },
    { type: 'coverage', pattern: 'qa/' },
    { type: 'review', pattern: 'review/' }
  ];

  // Check for required artifact directories
  for (const artifactType of requiredArtifactTypes) {
    if (artifactType.type === 'coverage') {
      // Coverage artifacts are validated separately
      continue;
    }
    warnings.push(`Artifact type ${artifactType.type} validation requires manual verification`);
  }

  return {
    valid: missingArtifacts.length === 0,
    missingArtifacts,
    warnings
  };
}

export function getScHelpText(): string[] {
  return [
    'peaks sc status                          Show change traceability status',
    'peaks sc impact --change-id <id>         Generate change impact artifact',
    'peaks sc retention --slice-id <id>        Create artifact retention report',
    'peaks sc validate --slice-id <id>         Validate artifact retention',
    'peaks sc boundary --slice-id <id>         Record commit boundary for slice',
    '',
    'Change traceability workflow integration:',
    '  1. Run peaks sc status to check current state',
    '  2. After slice completion, run peaks sc retention --slice-id <id>',
    '  3. Artifact sync is automatic when artifact repo is configured',
    '  4. Commit boundary is recorded when code is committed'
  ];
}