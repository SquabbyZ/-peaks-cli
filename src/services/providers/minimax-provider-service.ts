import type { MiniMaxProviderConfig } from '../config/config-types.js';

const DEFAULT_SMOKE_MODEL = 'MiniMax-M2.7';
const SMOKE_PROMPT = 'Output exactly: peaks-ok';
const SMOKE_EXPECTED_TEXT = 'peaks-ok';
const MAX_TOKENS = 64;
const REQUEST_TIMEOUT_MS = 15_000;

export type MiniMaxProviderSmokeOptions = {
  model?: string;
};

export type MiniMaxProviderSmokeResult = {
  provider: 'minimax';
  configured: boolean;
  baseUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  endpoint: string;
  model: string;
  ok: boolean;
  status: number;
  responseText: string | null;
};

type MiniMaxMessageResponse = {
  content?: unknown;
};

function getHttpsBaseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username.length === 0 && url.password.length === 0 ? url : null;
  } catch {
    return null;
  }
}

function buildMessagesEndpoint(baseUrl: URL): string {
  return new URL('v1/messages', baseUrl.toString().endsWith('/') ? baseUrl : `${baseUrl.toString()}/`).toString();
}

function getProviderConfigStatus(config: MiniMaxProviderConfig): Pick<MiniMaxProviderSmokeResult, 'configured' | 'baseUrlConfigured' | 'apiKeyConfigured'> {
  const baseUrlConfigured = typeof config.baseUrl === 'string' && config.baseUrl.trim().length > 0;
  const apiKeyConfigured = typeof config.apiKey === 'string' && config.apiKey.trim().length > 0;
  return {
    configured: baseUrlConfigured && apiKeyConfigured,
    baseUrlConfigured,
    apiKeyConfigured
  };
}

function extractResponseText(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  const content = (value as MiniMaxMessageResponse).content;
  if (!Array.isArray(content)) return null;
  const textParts = content
    .filter((item): item is { type: string; text: string } => item !== null && typeof item === 'object' && (item as { type?: unknown }).type === 'text' && typeof (item as { text?: unknown }).text === 'string')
    .map((item) => item.text);
  return textParts.length > 0 ? textParts.join('') : null;
}

function createSmokeResult(configStatus: Pick<MiniMaxProviderSmokeResult, 'configured' | 'baseUrlConfigured' | 'apiKeyConfigured'>, endpoint: string, model: string, fields: Pick<MiniMaxProviderSmokeResult, 'ok' | 'status' | 'responseText'>): MiniMaxProviderSmokeResult {
  return {
    provider: 'minimax',
    ...configStatus,
    endpoint,
    model,
    ...fields
  };
}

export async function testMiniMaxProvider(config: MiniMaxProviderConfig, options: MiniMaxProviderSmokeOptions = {}, fetchImpl: typeof fetch = fetch): Promise<MiniMaxProviderSmokeResult> {
  const baseUrl = config.baseUrl?.trim();
  const apiKey = config.apiKey?.trim();
  const configStatus = getProviderConfigStatus(config);
  const model = options.model?.trim() || DEFAULT_SMOKE_MODEL;
  const httpsBaseUrl = baseUrl ? getHttpsBaseUrl(baseUrl) : null;
  const endpoint = httpsBaseUrl ? buildMessagesEndpoint(httpsBaseUrl) : '';
  if (!baseUrl || !apiKey || !httpsBaseUrl) {
    return createSmokeResult(configStatus, endpoint, model, { ok: false, status: 0, responseText: null });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: SMOKE_PROMPT }]
      }),
      signal: controller.signal
    });

    const responseJson = await response.json().catch((): unknown => null);
    const responseText = extractResponseText(responseJson);

    return createSmokeResult(configStatus, endpoint, model, {
      ok: response.ok && responseText !== null && responseText.includes(SMOKE_EXPECTED_TEXT),
      status: response.status,
      responseText
    });
  } finally {
    clearTimeout(timeout);
  }
}
