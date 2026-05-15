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

export type GuidedArtifactSetup = {
  step: 'detect' | 'configure' | 'validate' | 'complete';
  workspaceId: string | null;
  workspacePath: string | null;
  provider: ArtifactProvider | null;
  repoOwner: string | null;
  repoName: string | null;
  localPath: string;
  remoteUrl: string | null;
  validationResult: {
    workspaceExists: boolean;
    gitAvailable: boolean;
    ghTokenAvailable: boolean;
    sshKeyAvailable: boolean;
  };
  nextStep: string;
  guidance: string[];
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

export function createGuidedArtifactSetup(): GuidedArtifactSetup {
  const validationResult = {
    workspaceExists: false,
    gitAvailable: false,
    ghTokenAvailable: false,
    sshKeyAvailable: false
  };

  const guidance: string[] = [];

  // Check for GH_TOKEN environment variable
  if (process.env.GH_TOKEN) {
    validationResult.ghTokenAvailable = true;
  }

  // Check for SSH key (simplified check)
  const sshKeyPath = `${process.env.HOME}/.ssh/id_rsa`;
  try {
    const { existsSync } = require('node:fs');
    if (existsSync(sshKeyPath)) {
      validationResult.sshKeyAvailable = true;
    }
  } catch {
    // fs check failed
  }

  return {
    step: 'detect',
    workspaceId: null,
    workspacePath: null,
    provider: null,
    repoOwner: null,
    repoName: null,
    localPath: '.peaks-artifacts',
    remoteUrl: null,
    validationResult,
    nextStep: 'configure',
    guidance: [
      'Step 1: Detect current workspace and environment',
      '  - Check if workspace is configured: peaks config workspace list',
      '  - GH_TOKEN environment variable: ' + (validationResult.ghTokenAvailable ? 'available' : 'not set'),
      '  - SSH key for code push: ' + (validationResult.sshKeyAvailable ? 'available' : 'not found'),
      '',
      'Step 2: Configure artifact repository',
      '  - Run: peaks artifacts init --provider github --name <repo> --dry-run',
      '  - Or add to workspace: peaks config workspace add --id <id> --provider github --repo-owner <owner> --repo-name <name>',
      '',
      'Step 3: Validate setup',
      '  - Run: peaks sc status',
      '  - Run: peaks artifacts workspace',
      '',
      'Step 4: Complete',
      '  - Artifact sync is ready when workspace has artifactRepo configured'
    ]
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
