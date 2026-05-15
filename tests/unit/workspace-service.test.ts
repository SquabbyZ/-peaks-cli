import { describe, expect, test } from 'vitest';
import { getArtifactWorkspaceStatus, planArtifactSync } from '../../src/services/artifacts/workspace-service.js';

describe('workspace service', () => {
  test('getArtifactWorkspaceStatus returns unconfigured for unknown workspace', () => {
    const status = getArtifactWorkspaceStatus('nonexistent');
    expect(status.configured).toBe(false);
    expect(status.syncStatus).toBe('unknown');
    expect(status.workspaceId).toBe('nonexistent');
  });

  test('planArtifactSync returns error plan for unknown workspace', () => {
    const plan = planArtifactSync('nonexistent', true);
    expect(plan.workspaceId).toBe('nonexistent');
    expect(plan.remoteUrl).toBeNull();
    expect(plan.plannedCommands).toHaveLength(1);
  });

  test('getArtifactWorkspaceStatus returns status for current workspace ws2', () => {
    // Current workspace ws2 exists and has no artifactRepo, so configured=false
    const status = getArtifactWorkspaceStatus();
    expect(status.workspaceId).toBe('ws2');
    expect(status.configured).toBe(false);
    expect(status.syncStatus).toBe('unknown');
  });

  test('planArtifactSync returns unknown when current workspace has no artifact repo', () => {
    // ws2 has no artifactRepo, so planArtifactSync returns 'unknown' for workspaceId
    const plan = planArtifactSync(undefined, true);
    expect(plan.workspaceId).toBe('unknown');
    expect(plan.remoteUrl).toBeNull();
  });
});