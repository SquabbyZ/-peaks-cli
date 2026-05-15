import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readConfig, getCurrentWorkspaceConfig } from '../config/config-service.js';
import type { WorkspaceConfig } from '../config/config-types.js';
import { pathExists } from '../../shared/fs.js';
import { execCommand } from '../../shared/process.js';

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

export type SyncResult = {
  workspaceId: string;
  success: boolean;
  localPath: string;
  remoteUrl: string | null;
  commands: string[];
  output: string[];
  error?: string;
};

function getLocalArtifactPath(workspace: WorkspaceConfig): string {
  return resolve(workspace.rootPath, '.peaks-artifacts');
}

function getPublicRemoteUrl(artifactRepo: WorkspaceConfig['artifactRepo']): string | null {
  if (!artifactRepo) return null;
  return artifactRepo.provider === 'github'
    ? `https://github.com/${artifactRepo.owner}/${artifactRepo.name}.git`
    : `https://gitlab.com/${artifactRepo.owner}/${artifactRepo.name}.git`;
}

function getExecutionRemoteUrl(artifactRepo: WorkspaceConfig['artifactRepo']): string | null {
  if (!artifactRepo) return null;
  const publicUrl = getPublicRemoteUrl(artifactRepo);
  const token = process.env.GH_TOKEN;
  if (!token || !publicUrl) return publicUrl;

  const host = artifactRepo.provider === 'github' ? 'github.com' : 'gitlab.com';
  return `https://x-access-token:${token}@${host}/${artifactRepo.owner}/${artifactRepo.name}.git`;
}

function redactSecrets(message: string): string {
  return message.replace(/https:\/\/x-access-token:[^@]+@/g, 'https://x-access-token:***@');
}

export async function executeArtifactSync(workspaceId?: string): Promise<SyncResult> {
  const workspace = workspaceId
    ? readConfig().workspaces.find((w) => w.workspaceId === workspaceId) ?? null
    : getCurrentWorkspaceConfig();

  if (!workspace || !workspace.artifactRepo) {
    return {
      workspaceId: workspaceId ?? 'unknown',
      success: false,
      localPath: '.peaks-artifacts',
      remoteUrl: null,
      commands: [],
      output: [],
      error: 'No artifact repository configured for this workspace'
    };
  }

  const localPath = getLocalArtifactPath(workspace);
  const remoteUrl = getPublicRemoteUrl(workspace.artifactRepo);
  const executionRemoteUrl = getExecutionRemoteUrl(workspace.artifactRepo);
  if (!remoteUrl || !executionRemoteUrl) {
    return {
      workspaceId: workspace.workspaceId,
      success: false,
      localPath,
      remoteUrl: null,
      commands: [],
      output: [],
      error: 'Invalid artifact repository configuration'
    };
  }

  const commands: string[] = [];
  const output: string[] = [];

  const hasLocalDir = await pathExists(localPath);

  if (!hasLocalDir) {
    commands.push(`git clone ${remoteUrl} "${localPath}"`);
    try {
      await execCommand('git', ['clone', executionRemoteUrl, localPath]);
      output.push(`Cloned artifact repository to ${localPath}`);
    } catch (err) {
      return {
        workspaceId: workspace.workspaceId,
        success: false,
        localPath,
        remoteUrl,
        commands,
        output,
        error: `Clone failed: ${redactSecrets(err instanceof Error ? err.message : String(err))}`
      };
    }
  } else {
    commands.push(`cd "${localPath}" && git fetch origin`);
    commands.push(`cd "${localPath}" && git pull origin main`);

    try {
      await execCommand('git', ['fetch', 'origin'], { cwd: localPath });
      output.push('Fetched latest from remote');

      await execCommand('git', ['pull', 'origin', 'main'], { cwd: localPath });
      output.push('Pulled latest changes');
    } catch (err) {
      return {
        workspaceId: workspace.workspaceId,
        success: false,
        localPath,
        remoteUrl,
        commands,
        output,
        error: `Sync failed: ${redactSecrets(err instanceof Error ? err.message : String(err))}`
      };
    }
  }

  return {
    workspaceId: workspace.workspaceId,
    success: true,
    localPath,
    remoteUrl,
    commands,
    output
  };
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