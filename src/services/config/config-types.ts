// Token reference types — tokens never stored raw, always via reference
export type TokenRef =
  | { env: string }
  | { keychain: string }
  | { ghCli: true };

export type TokenConfig = {
  AnthropicApiKey?: TokenRef;
  OpenAiApiKey?: TokenRef;
  GitHubToken?: TokenRef;
  GitLabToken?: TokenRef;
};

export type ModelPreference = 'haiku' | 'sonnet' | 'opus' | 'minimax';

export type ModelProviderId = 'minimax';

export type MiniMaxProviderConfig = {
  baseUrl?: string;
  apiKey?: string;
};

export type ModelProviderConfig = {
  minimax?: MiniMaxProviderConfig;
};

export type ProxyConfig = {
  httpProxy?: string;
};

export type WorkspaceConfig = {
  workspaceId: string;
  name: string;
  rootPath: string;
  artifactRepo?: {
    provider: 'github' | 'gitlab';
    owner: string;
    name: string;
  };
  installedCapabilityIds: string[];
};

export type PeaksConfig = {
  version: string;
  currentWorkspace: string | null;
  workspaces: WorkspaceConfig[];
  language: string;
  model: ModelPreference;
  tokens: TokenConfig;
  providers: ModelProviderConfig;
  proxy: ProxyConfig;
};

export type ConfigLayer = 'user' | 'project';

export type ConfigGetOptions = {
  key?: string;
  layer?: ConfigLayer;
};

export type ConfigSetOptions = {
  key: string;
  value: unknown;
  layer?: ConfigLayer;
};

export const DEFAULT_CONFIG: PeaksConfig = {
  version: '0.1.0',
  currentWorkspace: null,
  workspaces: [],
  language: 'en',
  model: 'sonnet',
  tokens: {},
  providers: {},
  proxy: {}
};