import { DEFAULT_CONFIG, type ModelProviderConfig, type PeaksConfig } from './config-types.js';

export const STRONGEST_MODEL_ID = 'claude-opus-4-7' as const;

export function getConfiguredExecutionModelId(providers: ModelProviderConfig | undefined): string {
  const providerConfigs = Object.values(providers ?? DEFAULT_CONFIG.providers);
  const configuredModel = providerConfigs
    .map((provider) => provider?.model?.trim())
    .find((model): model is string => typeof model === 'string' && model.length > 0);
  return configuredModel ?? 'minimax-2.7';
}

export function getEconomyAwareExecutionModelId(config: Pick<PeaksConfig, 'economyMode' | 'providers'>): string {
  return config.economyMode ? getConfiguredExecutionModelId(config.providers) : STRONGEST_MODEL_ID;
}
