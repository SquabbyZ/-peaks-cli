export type ArtifactProvider = 'github' | 'gitlab';

export type ArtifactInitPlan = {
  provider: ArtifactProvider;
  name: string;
  visibility: 'private';
  localPath: string;
  remoteFirst: boolean;
  dryRun: boolean;
  plannedActions: string[];
  tokenPolicy: string;
};

export function createArtifactInitPlan(options: {
  provider: ArtifactProvider;
  name: string;
  localPath?: string;
  dryRun?: boolean;
}): ArtifactInitPlan {
  return {
    provider: options.provider,
    name: options.name,
    visibility: 'private',
    localPath: options.localPath ?? '.peaks-artifacts',
    remoteFirst: true,
    dryRun: options.dryRun ?? true,
    plannedActions: [
      `confirm creation of private ${options.provider} artifact repository`,
      'verify authentication without storing tokens',
      `create or link remote artifact repository ${options.name}`,
      `prepare local working copy at ${options.localPath ?? '.peaks-artifacts'}`,
      'write artifact repository creation report'
    ],
    tokenPolicy: 'Use provider auth/CLI or environment tokens only; never write tokens to skills, artifacts, config, or reports.'
  };
}

export function getArtifactStatus() {
  return {
    mode: 'remote-first',
    supportedProviders: ['github', 'gitlab'] as ArtifactProvider[],
    localPath: '.peaks-artifacts',
    configured: false,
    nextActions: ['Run peaks artifacts init --provider gitlab --name <repo> --dry-run']
  };
}
