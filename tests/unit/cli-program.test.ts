import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, beforeEach, vi } from 'vitest';

const cliTestHome = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs');
  const { tmpdir } = require('node:os') as typeof import('node:os');
  const { join } = require('node:path') as typeof import('node:path');
  return mkdtempSync(join(tmpdir(), 'peaks-cli-home-'));
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => cliTestHome };
});

const minimaxSmokeTest = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/providers/minimax-provider-service.js', () => ({
  testMiniMaxProvider: minimaxSmokeTest
}));

mkdirSync(join(cliTestHome, '.peaks'), { recursive: true });
writeFileSync(join(cliTestHome, '.peaks', 'config.json'), JSON.stringify({ version: '0.1.0', currentWorkspace: null, workspaces: [], language: 'en', model: 'sonnet', tokens: {}, providers: {} }), 'utf8');

import { createProgram } from '../../src/cli/program.js';

function createHarness() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const program = createProgram({
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text)
  });
  return { program, stdout, stderr };
}

async function runCommand(args: string[]) {
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  const harness = createHarness();
  await harness.program.parseAsync(['node', 'peaks', ...args], { from: 'node' });
  const exitCode = process.exitCode;
  process.exitCode = previousExitCode;
  return { ...harness, exitCode };
}

function parseJsonOutput<T = unknown>(stdout: string[]) {
  return JSON.parse(stdout.join('\n')) as { ok: boolean; command: string; data: T; code?: string };
}

describe('createProgram', () => {
  beforeEach(() => {
    process.exitCode = undefined;
    minimaxSmokeTest.mockReset();
  });

  test('prints skill list as JSON envelope', async () => {
    const result = await runCommand(['skill', 'list', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('skill.list');
    expect(JSON.stringify(output.data)).toContain('peaks-solo');
  });

  test('prints doctor as JSON envelope', async () => {
    const result = await runCommand(['doctor', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('doctor');
  });

  test('prints profile list', async () => {
    const result = await runCommand(['profile', 'list', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(JSON.stringify(output.data)).toContain('strict-refactor');
  });

  test('prints proxy validation errors', async () => {
    const result = await runCommand(['proxy', 'test', '--proxy', '127.0.0.1:58309', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('INVALID_PROXY');
    expect(result.exitCode).toBe(1);
  });

  test('rejects non-dry-run proxy tests', async () => {
    const result = await runCommand(['proxy', 'test', '--proxy', 'http://127.0.0.1:58309', '--no-dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_NON_DRY_RUN');
    expect(result.exitCode).toBe(1);
  });

  test('prints GitLab artifact init dry-run', async () => {
    const result = await runCommand(['artifacts', 'init', '--provider', 'gitlab', '--name', 'artifacts', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(JSON.stringify(output.data)).toContain('gitlab');
  });

  test('rejects unsupported artifact provider', async () => {
    const result = await runCommand(['artifacts', 'init', '--provider', 'gitea', '--name', 'artifacts', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_ARTIFACT_PROVIDER');
  });

  test('rejects non-dry-run artifact init', async () => {
    const result = await runCommand(['artifacts', 'init', '--provider', 'gitlab', '--name', 'artifacts', '--no-dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_NON_DRY_RUN');
  });

  test('prints refactor hard gates', async () => {
    const result = await runCommand(['refactor', '--solo', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(JSON.stringify(output.data)).toContain('Require UT coverage >= 95%');
  });

  test('prints tech plan dry run', async () => {
    const result = await runCommand(['tech', 'plan', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--swarm', '--dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('tech.plan');
    expect(JSON.stringify(output.data)).toContain('tech-task-graph.json');
  });

  test('rejects tech plan without dry-run', async () => {
    const result = await runCommand(['tech', 'plan', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--swarm', '--no-dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_NON_DRY_RUN');
  });

  test('defaults tech plan to dry-run when omitted', async () => {
    const result = await runCommand(['tech', 'plan', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--swarm', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('tech.plan');
  });

  test('prints tech status', async () => {
    const result = await runCommand(['tech', 'status', '--change-id', 'checkout-refactor', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('tech.status');
  });

  test('prints workflow route dry run for solo mode', async () => {
    const result = await runCommand(['workflow', 'route', '--mode', 'solo', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--max-workers', '40', '--dry-run', '--json']);
    const output = parseJsonOutput<{ routePolicy: string }>(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('workflow.route');
    expect(output.data.routePolicy).toBe('solo-broad-multi-model');
  });

  test('prints workflow route dry run for team mode', async () => {
    const result = await runCommand(['workflow', 'route', '--mode', 'team', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--json']);
    const output = parseJsonOutput<{ routePolicy: string }>(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.data.routePolicy).toBe('team-rd-limited-multi-model');
  });

  test('rejects unsupported workflow mode', async () => {
    const result = await runCommand(['workflow', 'route', '--mode', 'enterprise', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_WORKFLOW_MODE');
  });

  test('rejects workflow route invalid max-workers values', async () => {
    const result = await runCommand(['workflow', 'route', '--mode', 'solo', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--max-workers', 'abc', '--dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('INVALID_MAX_WORKERS');
  });

  test('rejects workflow route without dry-run', async () => {
    const result = await runCommand(['workflow', 'route', '--mode', 'solo', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--no-dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_NON_DRY_RUN');
  });

  test('prints autonomous workflow dry run for solo mode', async () => {
    const result = await runCommand(['workflow', 'autonomous', '--mode', 'solo', '--change-id', 'autonomous-checkout', '--goal', 'Plan autonomous checkout refactor', '--max-workers', '40', '--dry-run', '--json']);
    const output = parseJsonOutput<{ behavior: string }>(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('workflow.autonomous');
    expect(output.data.behavior).toBe('preview');
    expect(JSON.stringify(output.data)).toContain('autonomous-rd-plan.json');
    expect(JSON.stringify(output.data)).toContain('/goal');
  });

  test('prints autonomous workflow dry run for team mode', async () => {
    const result = await runCommand(['workflow', 'autonomous', '--mode', 'team', '--change-id', 'team-autonomous', '--goal', 'Plan team-governed autonomous work', '--json']);
    const output = parseJsonOutput<{ mode: string }>(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('workflow.autonomous');
    expect(output.data.mode).toBe('team');
  });

  test('rejects unsupported autonomous workflow mode', async () => {
    const result = await runCommand(['workflow', 'autonomous', '--mode', 'enterprise', '--change-id', 'autonomous-checkout', '--goal', 'Plan autonomous checkout refactor', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_WORKFLOW_MODE');
  });

  test('rejects autonomous workflow invalid max-workers values', async () => {
    const result = await runCommand(['workflow', 'autonomous', '--mode', 'solo', '--change-id', 'autonomous-checkout', '--goal', 'Plan autonomous checkout refactor', '--max-workers', 'abc', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('INVALID_MAX_WORKERS');
  });

  test('rejects autonomous workflow without dry-run', async () => {
    const result = await runCommand(['workflow', 'autonomous', '--mode', 'solo', '--change-id', 'autonomous-checkout', '--goal', 'Plan autonomous checkout refactor', '--no-dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_NON_DRY_RUN');
  });

  test('prints swarm plan dry run for rd skill', async () => {
    const result = await runCommand(['swarm', 'plan', '--skill', 'rd', '--change-id', 'checkout-refactor', '--goal', 'Implement approved checkout refactor', '--max-workers', '40', '--dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('swarm.plan');
    expect(JSON.stringify(output.data)).toContain('reducer-report.md');
  });

  test('rejects unsupported swarm skill', async () => {
    const result = await runCommand(['swarm', 'plan', '--skill', 'qa', '--change-id', 'checkout-refactor', '--goal', 'x', '--dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_SWARM_SKILL');
  });

  test('rejects invalid max-workers values', async () => {
    const result = await runCommand(['swarm', 'plan', '--skill', 'rd', '--change-id', 'checkout-refactor', '--goal', 'Fix checkout retry typo', '--max-workers', 'abc', '--dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('INVALID_MAX_WORKERS');
  });

  test('defaults swarm plan to dry-run when omitted', async () => {
    const result = await runCommand(['swarm', 'plan', '--skill', 'rd', '--change-id', 'checkout-refactor', '--goal', 'Fix checkout retry typo', '--max-workers', '40', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('swarm.plan');
  });

  test('defaults refactor mode to solo', async () => {
    const result = await runCommand(['refactor', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(JSON.stringify(output.data)).toContain('"mode":"solo"');
  });

  test('prints non-json profile output', async () => {
    const result = await runCommand(['profile', 'list']);

    expect(result.stdout.join('\n')).toContain('strict-refactor');
  });

  test('prints non-json proxy errors to stderr', async () => {
    const result = await runCommand(['proxy', 'test', '--proxy', 'bad']);

    expect(result.stderr.join('\n')).toContain('INVALID_PROXY');
  });

  test('prints skill doctor checks', async () => {
    const result = await runCommand(['skill', 'doctor', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.command).toBe('skill.doctor');
  });

  test('rejects conflicting refactor modes', async () => {
    const result = await runCommand(['refactor', '--solo', '--rd', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('CONFLICTING_REFACTOR_MODE');
  });

  test('rejects non-dry-run refactor', async () => {
    const result = await runCommand(['refactor', '--no-dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_NON_DRY_RUN');
  });

  test('prints recommendation plan as JSON envelope', async () => {
    const result = await runCommand(['recommend', '--workflow', 'code-refactor', '--language', 'zh-CN', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('recommend');
    expect(JSON.stringify(output.data)).toContain('code-refactor');
    expect(JSON.stringify(output.data)).toContain('zh-CN');
  });

  test('rejects unsupported recommendation workflow', async () => {
    const result = await runCommand(['recommend', '--workflow', 'unknown', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_RECOMMENDATION_WORKFLOW');
  });

  test('prints capability status as JSON envelope', async () => {
    const result = await runCommand(['capability', 'status', '--json']);
    const output = parseJsonOutput(result.stdout);
    const serializedData = JSON.stringify(output.data);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('capability.status');
    expect(serializedData).toContain('everything-claude-code.code-review-agent');
    expect(serializedData).toContain('"sources":[{"sourceId":"everything-claude-code"');
  });

  test('prints config get as JSON envelope', async () => {
    const result = await runCommand(['config', 'get', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('config.get');
  });

  test('prints config get with specific key', async () => {
    const result = await runCommand(['config', 'get', '--key', 'language', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('config.get');
  });

  test('prints config set value', async () => {
    const result = await runCommand(['config', 'set', '--key', 'language', '--value', '"zh"', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('config.set');
  });

  test('config set rejects invalid JSON value without echoing the value', async () => {
    const result = await runCommand(['config', 'set', '--key', 'providers.minimax.apiKey', '--value', 'not-json-secret', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('INVALID_JSON');
    expect(result.stdout.join('\n')).not.toContain('not-json-secret');
  });

  test('config set redacts sensitive values and blocks project-layer secrets', async () => {
    const secret = 'peaks-cli-test-redacted-secret';
    const setResult = await runCommand(['config', 'set', '--key', 'providers.minimax.apiKey', '--value', JSON.stringify(secret), '--json']);
    const setOutput = parseJsonOutput<{ value: string }>(setResult.stdout);

    expect(setOutput.ok).toBe(true);
    expect(setOutput.data.value).toBe('***');
    expect(setResult.stdout.join('\n')).not.toContain(secret);

    const exactGetResult = await runCommand(['config', 'get', '--key', 'providers.minimax.apiKey', '--json']);
    const exactGetOutput = parseJsonOutput<string>(exactGetResult.stdout);
    expect(exactGetOutput.data).toBe('***');
    expect(exactGetResult.stdout.join('\n')).not.toContain(secret);

    const broadGetResult = await runCommand(['config', 'get', '--key', 'providers.minimax', '--json']);
    expect(broadGetResult.stdout.join('\n')).not.toContain(secret);
    expect(broadGetResult.stdout.join('\n')).toContain('***');

    const objectSetResult = await runCommand(['config', 'set', '--key', 'providers.minimax', '--value', JSON.stringify({ apiKey: { value: secret } }), '--json']);
    const objectSetOutput = parseJsonOutput(objectSetResult.stdout);
    expect(objectSetOutput.ok).toBe(true);
    expect(objectSetResult.stdout.join('\n')).not.toContain(secret);
    expect(objectSetResult.stdout.join('\n')).toContain('***');

    const projectResult = await runCommand(['config', 'set', '--key', 'providers.minimax.apiKey', '--value', JSON.stringify(secret), '--layer', 'project', '--json']);
    const projectOutput = parseJsonOutput(projectResult.stdout);
    expect(projectOutput.ok).toBe(false);
    expect(projectOutput.code).toBe('SECRET_CONFIG_REQUIRES_USER_LAYER');
    expect(projectResult.stdout.join('\n')).not.toContain(secret);

    const projectObjectResult = await runCommand(['config', 'set', '--key', 'providers.minimax', '--value', JSON.stringify({ apiKey: secret }), '--layer', 'project', '--json']);
    const projectObjectOutput = parseJsonOutput(projectObjectResult.stdout);
    expect(projectObjectOutput.ok).toBe(false);
    expect(projectObjectOutput.code).toBe('SECRET_CONFIG_REQUIRES_USER_LAYER');
    expect(projectObjectResult.stdout.join('\n')).not.toContain(secret);

    const invalidLayerResult = await runCommand(['config', 'set', '--key', 'language', '--value', '"en"', '--layer', 'invalid', '--json']);
    const invalidLayerOutput = parseJsonOutput(invalidLayerResult.stdout);
    expect(invalidLayerOutput.ok).toBe(false);
    expect(invalidLayerOutput.code).toBe('INVALID_CONFIG_LAYER');

    const invalidGetLayerResult = await runCommand(['config', 'get', '--key', 'language', '--layer', 'invalid', '--json']);
    const invalidGetLayerOutput = parseJsonOutput(invalidGetLayerResult.stdout);
    expect(invalidGetLayerOutput.ok).toBe(false);
    expect(invalidGetLayerOutput.code).toBe('INVALID_CONFIG_LAYER');
  });

  test('config provider minimax set get and status redact api keys', async () => {
    const secret = 'peaks-cli-provider-test-secret';
    const baseUrl = 'https://api.minimaxi.com/anthropic';
    const setResult = await runCommand(['config', 'provider', 'minimax', 'set', '--base-url', baseUrl, '--api-key', secret, '--json']);
    const setOutput = parseJsonOutput<{ baseUrlConfigured: boolean; apiKeyConfigured: boolean }>(setResult.stdout);

    expect(setOutput.ok).toBe(true);
    expect(setOutput.command).toBe('config.provider.minimax.set');
    expect(setOutput.data.baseUrlConfigured).toBe(true);
    expect(setOutput.data.apiKeyConfigured).toBe(true);
    expect(setResult.stdout.join('\n')).not.toContain(secret);

    const getResult = await runCommand(['config', 'provider', 'minimax', 'get', '--json']);
    const getOutput = parseJsonOutput<{ baseUrl: string; apiKey: string }>(getResult.stdout);
    expect(getOutput.ok).toBe(true);
    expect(getOutput.data.baseUrl).toBe(baseUrl);
    expect(getOutput.data.apiKey).toBe('***');
    expect(getResult.stdout.join('\n')).not.toContain(secret);

    const statusResult = await runCommand(['config', 'provider', 'minimax', 'status', '--json']);
    const statusOutput = parseJsonOutput<{ configured: boolean }>(statusResult.stdout);
    expect(statusOutput.ok).toBe(true);
    expect(statusOutput.data.configured).toBe(true);
    expect(statusResult.stdout.join('\n')).not.toContain(secret);
  });

  test('config provider minimax test returns redacted smoke results', async () => {
    const secret = 'peaks-cli-provider-smoke-secret';
    const baseUrl = 'https://api.minimaxi.com/anthropic';
    await runCommand(['config', 'provider', 'minimax', 'set', '--base-url', baseUrl, '--api-key', secret, '--json']);
    minimaxSmokeTest.mockResolvedValue({
      provider: 'minimax',
      configured: true,
      baseUrlConfigured: true,
      apiKeyConfigured: true,
      endpoint: `${baseUrl}/v1/messages`,
      model: 'MiniMax-M2.7',
      ok: true,
      status: 200,
      responseText: 'peaks-ok'
    });

    const result = await runCommand(['config', 'provider', 'minimax', 'test', '--json']);
    const output = parseJsonOutput<{ ok: boolean; model: string; responseText: string }>(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('config.provider.minimax.test');
    expect(output.data.model).toBe('MiniMax-M2.7');
    expect(output.data.responseText).toBe('peaks-ok');
    expect(result.stdout.join('\n')).not.toContain(secret);
    expect(minimaxSmokeTest).toHaveBeenCalledWith({ baseUrl, apiKey: secret }, { model: 'MiniMax-M2.7' });
  });

  test('config provider minimax test reports unconfigured and failed smoke tests', async () => {
    minimaxSmokeTest.mockResolvedValueOnce({
      provider: 'minimax',
      configured: false,
      baseUrlConfigured: false,
      apiKeyConfigured: false,
      endpoint: '',
      model: 'MiniMax-M2.7',
      ok: false,
      status: 0,
      responseText: null
    });
    const unconfiguredResult = await runCommand(['config', 'provider', 'minimax', 'test', '--json']);
    const unconfiguredOutput = parseJsonOutput(unconfiguredResult.stdout);
    expect(unconfiguredOutput.ok).toBe(false);
    expect(unconfiguredOutput.code).toBe('MINIMAX_PROVIDER_NOT_CONFIGURED');
    expect(unconfiguredResult.exitCode).toBe(1);

    minimaxSmokeTest.mockResolvedValueOnce({
      provider: 'minimax',
      configured: true,
      baseUrlConfigured: true,
      apiKeyConfigured: true,
      endpoint: 'https://api.minimaxi.com/anthropic/v1/messages',
      model: 'MiniMax-M2',
      ok: false,
      status: 401,
      responseText: null
    });
    const failedResult = await runCommand(['config', 'provider', 'minimax', 'test', '--model', 'MiniMax-M2', '--json']);
    const failedOutput = parseJsonOutput(failedResult.stdout);
    expect(failedOutput.ok).toBe(false);
    expect(failedOutput.code).toBe('MINIMAX_PROVIDER_TEST_FAILED');
    expect(failedResult.exitCode).toBe(1);
    expect(minimaxSmokeTest).toHaveBeenLastCalledWith(expect.any(Object), { model: 'MiniMax-M2' });

    minimaxSmokeTest.mockRejectedValueOnce(new Error('network down with peaks-cli-provider-smoke-secret'));
    const thrownResult = await runCommand(['config', 'provider', 'minimax', 'test', '--json']);
    const thrownOutput = parseJsonOutput(thrownResult.stdout);
    expect(thrownOutput.ok).toBe(false);
    expect(thrownOutput.code).toBe('MINIMAX_PROVIDER_TEST_FAILED');
    expect(thrownResult.exitCode).toBe(1);
    expect(thrownResult.stdout.join('\n')).not.toContain('peaks-cli-provider-smoke-secret');
  });

  test('config provider minimax validates inputs', async () => {
    const missingResult = await runCommand(['config', 'provider', 'minimax', 'set', '--json']);
    const missingOutput = parseJsonOutput(missingResult.stdout);
    expect(missingOutput.ok).toBe(false);
    expect(missingOutput.code).toBe('MINIMAX_PROVIDER_NO_VALUES');

    const invalidUrlResult = await runCommand(['config', 'provider', 'minimax', 'set', '--base-url', 'ftp://example.com', '--json']);
    const invalidUrlOutput = parseJsonOutput(invalidUrlResult.stdout);
    expect(invalidUrlOutput.ok).toBe(false);
    expect(invalidUrlOutput.code).toBe('INVALID_MINIMAX_BASE_URL');

    const httpUrlResult = await runCommand(['config', 'provider', 'minimax', 'set', '--base-url', 'http://api.minimaxi.com/anthropic', '--json']);
    const httpUrlOutput = parseJsonOutput(httpUrlResult.stdout);
    expect(httpUrlOutput.ok).toBe(false);
    expect(httpUrlOutput.code).toBe('INVALID_MINIMAX_BASE_URL');

    const credentialUrlResult = await runCommand(['config', 'provider', 'minimax', 'set', '--base-url', 'https://user:pass@api.minimaxi.com/anthropic', '--json']);
    const credentialUrlOutput = parseJsonOutput(credentialUrlResult.stdout);
    expect(credentialUrlOutput.ok).toBe(false);
    expect(credentialUrlOutput.code).toBe('INVALID_MINIMAX_BASE_URL');
    expect(credentialUrlResult.stdout.join('\n')).not.toContain('user:pass');
  });

  test('config set enforces MiniMax HTTPS base URL validation', async () => {
    const directResult = await runCommand(['config', 'set', '--key', 'providers.minimax.baseUrl', '--value', '"http://api.minimaxi.com/anthropic"', '--json']);
    const directOutput = parseJsonOutput(directResult.stdout);
    expect(directOutput.ok).toBe(false);
    expect(directOutput.code).toBe('INVALID_MINIMAX_BASE_URL');

    const objectResult = await runCommand(['config', 'set', '--key', 'providers.minimax', '--value', JSON.stringify({ baseUrl: 'http://api.minimaxi.com/anthropic' }), '--json']);
    const objectOutput = parseJsonOutput(objectResult.stdout);
    expect(objectOutput.ok).toBe(false);
    expect(objectOutput.code).toBe('INVALID_MINIMAX_BASE_URL');
  });

  test('config workspace commands reject invalid layers', async () => {
    const addResult = await runCommand(['config', 'workspace', 'add', '--id', 'invalid-layer-add', '--name', 'Invalid Layer Add', '--path', '/tmp/invalid-layer-add', '--layer', 'invalid', '--json']);
    const addOutput = parseJsonOutput(addResult.stdout);
    expect(addOutput.ok).toBe(false);
    expect(addOutput.code).toBe('INVALID_CONFIG_LAYER');
    expect(addResult.exitCode).toBe(1);

    const removeResult = await runCommand(['config', 'workspace', 'remove', '--id', 'invalid-layer-remove', '--layer', 'invalid', '--json']);
    const removeOutput = parseJsonOutput(removeResult.stdout);
    expect(removeOutput.ok).toBe(false);
    expect(removeOutput.code).toBe('INVALID_CONFIG_LAYER');
    expect(removeResult.exitCode).toBe(1);

    const switchResult = await runCommand(['config', 'workspace', 'switch', '--id', 'invalid-layer-switch', '--layer', 'invalid', '--json']);
    const switchOutput = parseJsonOutput(switchResult.stdout);
    expect(switchOutput.ok).toBe(false);
    expect(switchOutput.code).toBe('INVALID_CONFIG_LAYER');
    expect(switchResult.exitCode).toBe(1);
  });

  test('prints config workspace list', async () => {
    const result = await runCommand(['config', 'workspace', 'list', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('config.workspace.list');
  });

  test('adds and removes workspace', async () => {
    const addResult = await runCommand(['config', 'workspace', 'add', '--id', 'test-add-ws', '--name', 'Test Add', '--path', '/tmp', '--json']);
    expect(addResult.exitCode === undefined || addResult.exitCode === 0).toBe(true);
    const addOutput = parseJsonOutput(addResult.stdout);
    expect(addOutput.ok).toBe(true);

    const removeResult = await runCommand(['config', 'workspace', 'remove', '--id', 'test-add-ws', '--json']);
    const removeOutput = parseJsonOutput(removeResult.stdout);
    expect(removeOutput.ok).toBe(true);
  });

  test('remove workspace fails for unknown workspace', async () => {
    const result = await runCommand(['config', 'workspace', 'remove', '--id', 'nonexistent-ws', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('WORKSPACE_NOT_FOUND');
  });

  test('switch workspace fails for unknown workspace', async () => {
    const result = await runCommand(['config', 'workspace', 'switch', '--id', 'nonexistent-ws', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('WORKSPACE_NOT_FOUND');
  });

  test('prints artifacts sync dry-run', async () => {
    const result = await runCommand(['artifacts', 'sync', '--workspace', 'ws1', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('artifacts.sync');
  });

  test('rejects non-dry-run artifacts sync', async () => {
    const result = await runCommand(['artifacts', 'sync', '--workspace', 'ws1', '--no-dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_NON_DRY_RUN');
  });

  test('prints artifacts workspace status', async () => {
    const result = await runCommand(['artifacts', 'workspace', '--workspace', 'ws1', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('artifacts.workspace');
  });

  test('prints artifacts workspace status without explicit workspace', async () => {
    const result = await runCommand(['artifacts', 'workspace', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('artifacts.workspace');
  });

  test('rejects invalid guided artifact setup step', async () => {
    const result = await runCommand(['artifacts', 'setup', '--step', 'invalid', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('INVALID_ARTIFACT_SETUP_STEP');
    expect(result.exitCode).toBe(1);
  });

  test('config workspace add with artifact repo', async () => {
    const result = await runCommand([
      'config', 'workspace', 'add',
      '--id', 'test-cli-add',
      '--name', 'Test Add with Repo',
      '--path', '/tmp/test-cli-add',
      '--provider', 'github',
      '--repo-owner', 'testowner',
      '--repo-name', 'test-repo',
      '--json'
    ]);
    const output = parseJsonOutput(result.stdout);
    expect(output.ok).toBe(true);

    // cleanup
    await runCommand(['config', 'workspace', 'remove', '--id', 'test-cli-add', '--json']);
  });

  test('config workspace add without artifact repo options', async () => {
    const result = await runCommand([
      'config', 'workspace', 'add',
      '--id', 'test-cli-plain',
      '--name', 'Test Plain Add',
      '--path', '/tmp/test-cli-plain',
      '--json'
    ]);
    const output = parseJsonOutput(result.stdout);
    expect(output.ok).toBe(true);

    // cleanup
    await runCommand(['config', 'workspace', 'remove', '--id', 'test-cli-plain', '--json']);
  });

  test('rejects partial config workspace artifact repo options', async () => {
    const result = await runCommand([
      'config', 'workspace', 'add',
      '--id', 'test-cli-partial-repo',
      '--name', 'Test Partial Repo',
      '--path', '/tmp/test-cli-partial-repo',
      '--provider', 'github',
      '--repo-owner', 'testowner',
      '--json'
    ]);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('INVALID_ARTIFACT_REPO_CONFIG');
    expect(result.exitCode).toBe(1);
  });

  test('rejects unsafe config workspace artifact repo segments', async () => {
    const result = await runCommand([
      'config', 'workspace', 'add',
      '--id', 'test-cli-unsafe-repo',
      '--name', 'Test Unsafe Repo',
      '--path', '/tmp/test-cli-unsafe-repo',
      '--provider', 'github',
      '--repo-owner', '../owner',
      '--repo-name', 'test-repo',
      '--json'
    ]);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('INVALID_ARTIFACT_REPO_CONFIG');
    expect(result.exitCode).toBe(1);
  });

  test('config workspace switch to known workspace', async () => {
    // First create a workspace
    await runCommand([
      'config', 'workspace', 'add',
      '--id', 'test-switch-target',
      '--name', 'Switch Target',
      '--path', '/tmp/test-switch-target',
      '--json'
    ]);

    // Now switch to it
    const result = await runCommand(['config', 'workspace', 'switch', '--id', 'test-switch-target', '--json']);
    const output = parseJsonOutput<{ currentWorkspace: string }>(result.stdout);
    expect(output.ok).toBe(true);
    expect(output.data.currentWorkspace).toBe('test-switch-target');

    // cleanup
    await runCommand(['config', 'workspace', 'remove', '--id', 'test-switch-target', '--json']);
  });
});
