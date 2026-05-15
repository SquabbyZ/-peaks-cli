import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCurrentWorkspaceConfig, readConfig } from '../config/config-service.js';
import type { WorkspaceConfig } from '../config/config-types.js';

export type SyncStatus = 'synced' | 'pending' | 'out-of-sync' | 'unknown';

export type ArtifactWorkspaceStatus = {
  workspaceId: string;
  localPath: string;
  configured: boolean;
  syncStatus: SyncStatus;
  lastSync: string | null;
  hasLocalChanges: boolean;
  artifactRepo: WorkspaceConfig['artifactRepo'] | null;
  nextActions: string[];
};

function getLocalArtifactPath(workspace: WorkspaceConfig): string {
  return workspace.artifactRepo
    ? resolve(workspace.rootPath, '.peaks-artifacts')
    : resolve(workspace.rootPath, '.peaks-artifacts');
}

export function getArtifactWorkspaceStatus(workspaceId?: string): ArtifactWorkspaceStatus {
  const workspace = workspaceId
    ? readConfig().workspaces.find((w) => w.workspaceId === workspaceId) ?? null
    : getCurrentWorkspaceConfig();

  if (!workspace) {
    return {
      workspaceId: workspaceId ?? 'unknown',
      localPath: '.peaks-artifacts',
      configured: false,
      syncStatus: 'unknown',
      lastSync: null,
      hasLocalChanges: false,
      artifactRepo: null,
      nextActions: ['Add a workspace with: peaks config workspace add --id <id> --name <name> --path <path>']
    };
  }

  const localPath = getLocalArtifactPath(workspace);
  const hasLocalDir = existsSync(localPath);
  const hasArtifactRepo = !!workspace.artifactRepo;

  const syncStatus: SyncStatus = !hasArtifactRepo
    ? 'unknown'
    : !hasLocalDir
    ? 'pending'
    : 'synced';

  return {
    workspaceId: workspace.workspaceId,
    localPath,
    configured: hasArtifactRepo,
    syncStatus,
    lastSync: null,
    hasLocalChanges: false,
    artifactRepo: workspace.artifactRepo ?? null,
    nextActions: hasArtifactRepo
      ? [`Run peaks artifacts sync --workspace ${workspace.workspaceId} --dry-run`]
      : [`Configure artifact repo: peaks config workspace add --id ${workspace.workspaceId} --provider github --repo-owner <owner> --repo-name <name>`]
  };
}

export function planArtifactSync(workspaceId?: string, dryRun = true): {
  workspaceId: string;
  dryRun: boolean;
  localPath: string;
  remoteUrl: string | null;
  plannedCommands: string[];
} {
  const workspace = workspaceId
    ? readConfig().workspaces.find((w) => w.workspaceId === workspaceId) ?? null
    : getCurrentWorkspaceConfig();

  if (!workspace || !workspace.artifactRepo) {
    return {
      workspaceId: workspaceId ?? 'unknown',
      dryRun,
      localPath: '.peaks-artifacts',
      remoteUrl: null,
      plannedCommands: ['No artifact repo configured — add one with peaks config workspace add --provider github --repo-owner <owner> --repo-name <name>']
    };
  }

  const localPath = getLocalArtifactPath(workspace);
  const remoteUrl = workspace.artifactRepo.provider === 'github'
    ? `https://github.com/${workspace.artifactRepo.owner}/${workspace.artifactRepo.name}.git`
    : `https://gitlab.com/${workspace.artifactRepo.owner}/${workspace.artifactRepo.name}.git`;

  const plannedCommands = dryRun
    ? [
        `# Sync plan for workspace ${workspace.workspaceId}`,
        `# Local: ${localPath}`,
        `# Remote: ${remoteUrl}`,
        '# peaks artifacts sync --workspace ' + workspace.workspaceId,
        '# (dry-run only — no changes made)'
      ]
    : [
        `# Sync execution for workspace ${workspace.workspaceId}`,
        `# Confirm: will sync ${localPath} with ${remoteUrl}`,
        '# Exit 1 if not confirmed'
      ];

  return {
    workspaceId: workspace.workspaceId,
    dryRun,
    localPath,
    remoteUrl,
    plannedCommands
  };
}