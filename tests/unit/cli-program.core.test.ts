import { beforeEach, describe, expect, test } from 'vitest';
import { parseJsonOutput, resetCliProgramMocks, runCommand, writeUserConfig } from './cli-program-test-utils.js';

describe('createProgram', () => {
  beforeEach(() => {
    process.exitCode = undefined;
    resetCliProgramMocks();
    writeUserConfig();
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

  test('defaults tech plan swarm mode off when omitted', async () => {
    const result = await runCommand(['tech', 'plan', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--dry-run', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('tech.plan');
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
    const result = await runCommand(['workflow', 'route', '--mode', 'solo', '--solo-mode', 'guided', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--max-workers', '40', '--dry-run', '--json']);
    const output = parseJsonOutput<{ routePolicy: string; soloMode: string; executionMode: string }>(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('workflow.route');
    expect(output.data.routePolicy).toBe('solo-broad-multi-model');
    expect(output.data.soloMode).toBe('guided');
    expect(output.data.executionMode).toBe('autonomous');
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

  test('rejects workflow route solo-mode with team mode', async () => {
    const result = await runCommand(['workflow', 'route', '--mode', 'team', '--solo-mode', 'guided', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('SOLO_MODE_REQUIRES_SOLO_WORKFLOW');
  });

  test('rejects unsupported workflow route solo mode', async () => {
    const result = await runCommand(['workflow', 'route', '--mode', 'solo', '--solo-mode', 'manual', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_SOLO_MODE');
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
    const result = await runCommand(['workflow', 'autonomous', '--mode', 'solo', '--solo-mode', 'rnd', '--change-id', 'autonomous-checkout', '--goal', 'Plan autonomous checkout refactor', '--max-workers', '40', '--dry-run', '--json']);
    const output = parseJsonOutput<{ behavior: string; routePlan: { soloMode: string; executionMode: string } }>(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.command).toBe('workflow.autonomous');
    expect(output.data.behavior).toBe('preview');
    expect(output.data.routePlan.soloMode).toBe('rnd');
    expect(output.data.routePlan.executionMode).toBe('autonomous');
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

  test('rejects autonomous workflow solo-mode with team mode', async () => {
    const result = await runCommand(['workflow', 'autonomous', '--mode', 'team', '--solo-mode', 'guided', '--change-id', 'team-autonomous', '--goal', 'Plan team-governed autonomous work', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('SOLO_MODE_REQUIRES_SOLO_WORKFLOW');
  });

  test('rejects autonomous workflow invalid max-workers values', async () => {
    const result = await runCommand(['workflow', 'autonomous', '--mode', 'solo', '--change-id', 'autonomous-checkout', '--goal', 'Plan autonomous checkout refactor', '--max-workers', 'abc', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('INVALID_MAX_WORKERS');
  });

  test('rejects unsupported autonomous workflow solo mode', async () => {
    const result = await runCommand(['workflow', 'autonomous', '--mode', 'solo', '--solo-mode', 'manual', '--change-id', 'autonomous-checkout', '--goal', 'Plan autonomous checkout refactor', '--json']);
    const output = parseJsonOutput(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.code).toBe('UNSUPPORTED_SOLO_MODE');
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

  test('defaults refactor mode to solo and supports rd mode', async () => {
    const soloResult = await runCommand(['refactor', '--json']);
    const soloOutput = parseJsonOutput(soloResult.stdout);
    expect(JSON.stringify(soloOutput.data)).toContain('"mode":"solo"');

    const rdResult = await runCommand(['refactor', '--rd', '--json']);
    const rdOutput = parseJsonOutput(rdResult.stdout);
    expect(JSON.stringify(rdOutput.data)).toContain('"mode":"rd"');
  });

  test('uses current workspace context for planning commands', async () => {
    await runCommand(['config', 'workspace', 'add', '--id', 'workflow-ws', '--name', 'Workflow WS', '--path', '/tmp/workflow-ws', '--json']);
    await runCommand(['config', 'workspace', 'switch', '--id', 'workflow-ws', '--json']);

    const result = await runCommand(['tech', 'plan', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--json']);
    const output = parseJsonOutput(result.stdout);
    expect(output.ok).toBe(true);

    const routeResult = await runCommand(['workflow', 'route', '--mode', 'solo', '--change-id', 'checkout-refactor', '--goal', 'Refactor checkout API', '--json']);
    const routeOutput = parseJsonOutput(routeResult.stdout);
    expect(routeOutput.ok).toBe(true);

    await runCommand(['config', 'workspace', 'remove', '--id', 'workflow-ws', '--json']);
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

    const layeredResult = await runCommand(['config', 'get', '--key', 'language', '--layer', 'user', '--json']);
    const layeredOutput = parseJsonOutput(layeredResult.stdout);
    expect(layeredOutput.ok).toBe(true);
  });

  test('prints artifact status and accepts valid setup steps', async () => {
    const statusResult = await runCommand(['artifacts', 'status', '--json']);
    const statusOutput = parseJsonOutput(statusResult.stdout);
    expect(statusOutput.ok).toBe(true);
    expect(statusOutput.command).toBe('artifacts.status');

    const setupResult = await runCommand(['artifacts', 'setup', '--step', 'configure', '--json']);
    const setupOutput = parseJsonOutput<{ step: string }>(setupResult.stdout);
    expect(setupOutput.ok).toBe(true);
    expect(setupOutput.data.step).toBe('configure');
  });

  test('rejects invalid tech workflow and swarm inputs', async () => {
    const techPlanResult = await runCommand(['tech', 'plan', '--change-id', 'bad/id', '--goal', 'Refactor checkout API', '--json']);
    expect(parseJsonOutput(techPlanResult.stdout).code).toBe('INVALID_CHANGE_ID_OR_GOAL');

    const techStatusResult = await runCommand(['tech', 'status', '--change-id', 'bad/id', '--json']);
    expect(parseJsonOutput(techStatusResult.stdout).code).toBe('INVALID_CHANGE_ID');

    const routeResult = await runCommand(['workflow', 'route', '--mode', 'solo', '--change-id', 'bad/id', '--goal', 'Refactor checkout API', '--json']);
    expect(parseJsonOutput(routeResult.stdout).code).toBe('INVALID_CHANGE_ID_OR_GOAL');

    const autonomousResult = await runCommand(['workflow', 'autonomous', '--mode', 'solo', '--change-id', 'bad/id', '--goal', 'Refactor checkout API', '--json']);
    expect(parseJsonOutput(autonomousResult.stdout).code).toBe('INVALID_CHANGE_ID_OR_GOAL');

    const swarmDryRunResult = await runCommand(['swarm', 'plan', '--skill', 'rd', '--change-id', 'checkout-refactor', '--goal', 'Fix checkout retry typo', '--no-dry-run', '--json']);
    expect(parseJsonOutput(swarmDryRunResult.stdout).code).toBe('UNSUPPORTED_NON_DRY_RUN');

    const swarmInvalidResult = await runCommand(['swarm', 'plan', '--skill', 'rd', '--change-id', 'bad/id', '--goal', 'Fix checkout retry typo', '--json']);
    expect(parseJsonOutput(swarmInvalidResult.stdout).code).toBe('INVALID_CHANGE_ID_OR_GOAL');
  });

  test('prints sc command envelopes', async () => {
    const statusResult = await runCommand(['sc', 'status', '--json']);
    expect(parseJsonOutput(statusResult.stdout).command).toBe('sc.status');

    const helpJsonResult = await runCommand(['sc', 'help', '--json']);
    expect(parseJsonOutput(helpJsonResult.stdout).command).toBe('sc.help');

    const helpResult = await runCommand(['sc', 'help']);
    expect(helpResult.stdout.join('\n')).toContain('Change traceability workflow integration');

    const plainImpactResult = await runCommand(['sc', 'impact', '--change-id', 'checkout-refactor', '--json']);
    expect(parseJsonOutput(plainImpactResult.stdout).command).toBe('sc.impact');

    const impactResult = await runCommand(['sc', 'impact', '--change-id', 'checkout-refactor', '--module', 'client', '--file', 'src/app.ts', '--json']);
    expect(parseJsonOutput(impactResult.stdout).command).toBe('sc.impact');

    const plainRetentionResult = await runCommand(['sc', 'retention', '--slice-id', 'slice-1', '--json']);
    expect(parseJsonOutput(plainRetentionResult.stdout).command).toBe('sc.retention');

    const retentionResult = await runCommand(['sc', 'retention', '--slice-id', 'slice-1', '--prd', 'prd.md', '--rd', 'rd.md', '--qa', 'qa.md', '--coverage', 'coverage.json', '--review', 'review.md', '--code', 'src/app.ts', '--json']);
    expect(parseJsonOutput(retentionResult.stdout).command).toBe('sc.retention');

    const validateResult = await runCommand(['sc', 'validate', '--slice-id', 'slice-1', '--json']);
    expect(parseJsonOutput(validateResult.stdout).command).toBe('sc.validate');

    const plainBoundaryResult = await runCommand(['sc', 'boundary', '--slice-id', 'slice-1', '--json']);
    expect(parseJsonOutput(plainBoundaryResult.stdout).command).toBe('sc.boundary');

    const boundaryResult = await runCommand(['sc', 'boundary', '--slice-id', 'slice-1', '--artifact', 'artifact.md', '--code', 'src/app.ts', '--json']);
    expect(parseJsonOutput(boundaryResult.stdout).command).toBe('sc.boundary');
  });

});
