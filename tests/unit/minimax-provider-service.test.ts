import { describe, expect, test, vi } from 'vitest';
import { testMiniMaxProvider } from '../../src/services/providers/minimax-provider-service.js';

function createFetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

describe('testMiniMaxProvider', () => {
  test('returns unconfigured status without calling fetch when base URL or API key is missing', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await testMiniMaxProvider({ baseUrl: 'https://api.minimaxi.com/anthropic' }, {}, fetchImpl);
    const emptyResult = await testMiniMaxProvider({}, {}, fetchImpl);

    expect(result).toMatchObject({
      provider: 'minimax',
      configured: false,
      baseUrlConfigured: true,
      apiKeyConfigured: false,
      endpoint: 'https://api.minimaxi.com/anthropic/v1/messages',
      model: 'MiniMax-M2.7',
      ok: false,
      status: 0,
      responseText: null
    });
    expect(emptyResult).toMatchObject({
      configured: false,
      baseUrlConfigured: false,
      apiKeyConfigured: false,
      endpoint: '',
      ok: false,
      status: 0,
      responseText: null
    });
    const malformedResult = await testMiniMaxProvider({ baseUrl: 'not a url' }, {}, fetchImpl);
    expect(malformedResult).toMatchObject({
      configured: false,
      baseUrlConfigured: true,
      apiKeyConfigured: false,
      endpoint: '',
      ok: false,
      status: 0,
      responseText: null
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('does not call fetch for non-HTTPS or malformed base URLs even when manually configured', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const httpResult = await testMiniMaxProvider({ baseUrl: 'http://api.minimaxi.com/anthropic', apiKey: 'secret-key' }, {}, fetchImpl);
    const credentialUrlResult = await testMiniMaxProvider({ baseUrl: 'https://user:pass@api.minimaxi.com/anthropic', apiKey: 'secret-key' }, {}, fetchImpl);
    const malformedResult = await testMiniMaxProvider({ baseUrl: 'not a url', apiKey: 'secret-key' }, {}, fetchImpl);

    expect(httpResult).toMatchObject({
      configured: true,
      baseUrlConfigured: true,
      apiKeyConfigured: true,
      endpoint: '',
      ok: false,
      status: 0,
      responseText: null
    });
    expect(credentialUrlResult).toMatchObject({
      configured: true,
      baseUrlConfigured: true,
      apiKeyConfigured: true,
      endpoint: '',
      ok: false,
      status: 0,
      responseText: null
    });
    expect(malformedResult).toMatchObject({
      configured: true,
      baseUrlConfigured: true,
      apiKeyConfigured: true,
      endpoint: '',
      ok: false,
      status: 0,
      responseText: null
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('sends a minimal Anthropic-compatible smoke request and extracts text responses', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(createFetchResponse(200, { content: [{ type: 'text', text: 'The answer is peaks-ok.' }] }));

    const result = await testMiniMaxProvider({ baseUrl: 'https://api.minimaxi.com/anthropic', apiKey: 'secret-key' }, { model: 'MiniMax-M2' }, fetchImpl);

    expect(result).toMatchObject({
      configured: true,
      endpoint: 'https://api.minimaxi.com/anthropic/v1/messages',
      model: 'MiniMax-M2',
      ok: true,
      status: 200,
      responseText: 'The answer is peaks-ok.'
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://api.minimaxi.com/anthropic/v1/messages', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'content-type': 'application/json',
        'x-api-key': 'secret-key',
        'anthropic-version': '2023-06-01'
      }),
      signal: expect.any(AbortSignal)
    }));
    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string) as { model: string; max_tokens: number; messages: { role: string; content: string }[] };
    expect(body).toEqual({ model: 'MiniMax-M2', max_tokens: 64, messages: [{ role: 'user', content: 'Output exactly: peaks-ok' }] });
  });

  test('marks non-matching or malformed provider responses as failed without throwing', async () => {
    const wrongTextFetch = vi.fn<typeof fetch>().mockResolvedValue(createFetchResponse(200, { content: [{ type: 'text', text: 'nope' }, { type: 'image', text: 'ignored' }] }));
    const emptyContentFetch = vi.fn<typeof fetch>().mockResolvedValue(createFetchResponse(200, { content: [{ type: 'image', text: 'ignored' }] }));
    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(createFetchResponse(500, { error: 'bad' }));
    const invalidJsonFetch = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('invalid json'); } } as unknown as Response);

    await expect(testMiniMaxProvider({ baseUrl: 'https://api.minimaxi.com/anthropic/', apiKey: 'secret' }, {}, wrongTextFetch)).resolves.toMatchObject({ ok: false, responseText: 'nope' });
    await expect(testMiniMaxProvider({ baseUrl: 'https://api.minimaxi.com/anthropic', apiKey: 'secret' }, {}, emptyContentFetch)).resolves.toMatchObject({ ok: false, responseText: null });
    await expect(testMiniMaxProvider({ baseUrl: 'https://api.minimaxi.com/anthropic', apiKey: 'secret' }, {}, malformedFetch)).resolves.toMatchObject({ ok: false, status: 500, responseText: null });
    await expect(testMiniMaxProvider({ baseUrl: 'https://api.minimaxi.com/anthropic', apiKey: 'secret' }, {}, invalidJsonFetch)).resolves.toMatchObject({ ok: false, status: 200, responseText: null });
  });
});
