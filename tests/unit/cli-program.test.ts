import { describe, expect, test, beforeEach } from 'vitest';
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

function parseJsonOutput(stdout: string[]) {
  return JSON.parse(stdout.join('\n')) as { ok: boolean; command: string; data: Record<string, unknown>; code?: string };
}

describe('createProgram', () => {
  beforeEach(() => {
    process.exitCode = undefined;
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

  test('config set rejects invalid JSON value', async () => {
    const result = await runCommand(['config', 'set', '--key', 'language', '--value', 'not-json', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('INVALID_JSON');
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
    const output = parseJsonOutput(result.stdout);
    expect(output.ok).toBe(true);
    expect(output.data.currentWorkspace).toBe('test-switch-target');

    // cleanup
    await runCommand(['config', 'workspace', 'remove', '--id', 'test-switch-target', '--json']);
  });
});
