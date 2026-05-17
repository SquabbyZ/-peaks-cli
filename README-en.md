# Peaks

Peaks is a global CLI tool and short-skill family for Claude Code. It turns project governance, workflow planning, controlled execution, QA verification, and change traceability into a reusable engineering process.

If you are a user, think of Peaks as an installed command-line tool: configure a workspace, choose a workflow, and then call skills or controlled workers when needed.

## Installation

```bash
npm install -g @peaks/cli
```

After installation, run:

```bash
peaks --help
```

If you are using a local or source-based install, you can still invoke `peaks` directly.

To confirm the installation succeeded:

```bash
peaks -v
peaks --version
peaks --help
peaks -h
```

`-v` / `--version` print the installed version. `--help` / `-h` list the available Peaks commands.

During global installation, Peaks registers its bundled skills into the global Claude skills directory as symlinks. After installation, you can use those skill names directly in Claude Code with a natural-language task description.

## Quick start

### 1. Check the environment first

```bash
peaks doctor --json
peaks skill doctor --json
```

These commands help you verify Peaks, skills, configuration, and artifact readiness.

### 2. List available skills

```bash
peaks skill list --json
```

The main Peaks skills are:

- `peaks-solo`: end-to-end orchestration entrypoint
- `peaks-prd`: product goals, non-goals, and acceptance criteria
- `peaks-ui`: UI/UX, interaction, and visual constraints
- `peaks-rd`: engineering analysis, refactor planning, execution contracts
- `peaks-qa`: tests, coverage, regression, and acceptance
- `peaks-sc`: change traceability, commit boundaries, artifact retention
- `peaks-txt`: context capsules, decisions, and knowledge compression

## Configure with `config.json`

Peaks reads configuration from two places:

- Global: `~/.peaks/config.json`
- Project: `<project>/.peaks/config.json`

Project config wins. If no project config exists, Peaks falls back to the global file. Workspace selection, active workspace, and runtime preferences live in `config.json`, so later commands read them automatically and you do not need to repeat workspace arguments each time.

Project-level example:

```json
{
  "currentWorkspace": "ice-cola",
  "workspaces": [
    {
      "workspaceId": "ice-cola",
      "name": "Ice Cola",
      "rootPath": "C:/Users/smallMark/Desktop/peaksclaw/ice-cola",
      "installedCapabilityIds": [],
      "artifactRepo": {
        "provider": "github",
        "owner": "YOUR_ARTIFACT_REPO_OWNER",
        "name": "YOUR_ARTIFACT_REPO_NAME"
      }
    }
  ]
}
```

If you also need user-level provider settings, put them in the global `~/.peaks/config.json` file:

```json
{
  "providers": {
    "minimax": {
      "baseUrl": "https://api.minimaxi.com/anthropic",
      "apiKey": "YOUR_MINIMAX_API_KEY"
    }
  }
}
```

Notes:

- `workspace.rootPath` points to your real target project.
- `currentWorkspace` decides which workspace is active.
- The artifact repository stores intermediate outputs, not the target codebase.
- Project `.peaks/config.json` should only contain non-secret workspace metadata; sensitive credentials stay in the global config.
- Intermediate artifacts should not be written into the target repository.

## Common commands

### View and verify config

If you want to confirm what Peaks resolved, you can still use the config inspection commands, but the configuration itself lives in `config.json`.

```bash
peaks doctor --json
peaks config get --json
peaks config workspace list --json
```

### Use short planning commands

Peaks recommends top-level commands: one action maps to one command, without nested command stacks.

- `route`: decide the route for a change and return a route plan.
- `autonomous`: generate a full autonomous governance preview.
- `tech-plan`: split the technical goal into reviewable RD scopes.
- `tech-status`: inspect technical artifact / approval status.
- `swarm-plan`: split approved RD scopes into a parallel execution plan.
- `minimax-worker`: send one explicit coding/test task to MiniMax and return a handoff for top-tier review.

Write the goal clearly, let Peaks return a structured result, then review whether the result is small, clear, and verifiable.

```bash
peaks route --mode solo --change-id <id> --goal "<goal>" --dry-run --json
peaks autonomous --mode solo --change-id <id> --goal "<goal>" --dry-run --json
peaks tech-plan --change-id <id> --goal "<goal>" --swarm --dry-run --json
peaks swarm-plan --change-id <id> --goal "<goal>" --dry-run --json
peaks minimax-worker --change-id <id> --goal "<goal>" --coding-task "<coding task>" --unit-test-task "<test task>" --confirm --json
```

Submodes for solo planning:

- `full-auto`: prepare the full automation-stage plan.
- `guided`: keep more user confirmation points.
- `rnd`: research and development exploration mode.

`minimax-worker` sends input to an external MiniMax provider, so it requires explicit confirmation.

Notes:

- Do not put secrets, private business data, or non-exportable content in worker tasks.
- Worker inputs should be specific, executable, and verifiable.
- Worker output is best reviewed again by top-tier code review, security review, and TypeScript review.

### Recommendations and capability availability

```bash
peaks capability status --json

peaks recommend --workflow code-refactor --language en --json
peaks recommend --workflow product-refactor --language en --json
peaks recommend --workflow frontend-design --language en --json
```

Use this to decide whether external skills, MCP, hooks, agent browser, OpenSpec, or similar capabilities should be used instead of rebuilding specialist workflows inside Peaks.

### Source control and change traceability

```bash
peaks sc status --json
peaks sc help

peaks sc impact \
  --change-id ice-cola-marketplace \
  --module admin-marketplace \
  --module server-marketplace \
  --file packages/admin/src/services/marketplaceApi.ts \
  --file packages/server/src/marketplace/marketplace.service.ts \
  --json

peaks sc retention \
  --slice-id marketplace-api-contract \
  --prd artifacts/prd.md \
  --rd artifacts/rd.md \
  --qa artifacts/qa.md \
  --coverage artifacts/coverage.md \
  --review artifacts/review.md \
  --code packages/admin/src/services/marketplaceApi.ts \
  --json

peaks sc boundary \
  --slice-id marketplace-api-contract \
  --artifact artifacts/prd.md \
  --artifact artifacts/qa.md \
  --code packages/admin/src/services/marketplaceApi.ts \
  --json
```

## How to use the skills

Peaks skills are used directly inside Claude Code.

- First run `peaks skill list --json` to see the available skills
- The simplest way to use them is to type `skill + natural-language description` in Claude Code
- For example:

```text
peaks-solo Govern C:/Users/smallMark/Desktop/peaksclaw/ice-cola in full-auto mode
peaks-prd Define product goals, non-goals, and acceptance criteria for the invitation feature
peaks-rd Analyze the smallest refactor slice and risks for this change
peaks-qa Design tests and regression checks for this change
```

Choose the skill that matches the task:
  - `peaks-solo` decides the overall workflow mode
  - `peaks-prd` writes product goals, non-goals, and acceptance criteria
  - `peaks-ui` adds UI/UX, interaction, and visual constraints
  - `peaks-rd` handles engineering analysis, refactor planning, and execution contracts
  - `peaks-qa` defines tests, coverage, and regression checks
  - `peaks-sc` records traceability, commit boundaries, and artifact retention
  - `peaks-txt` compresses context and preserves key decisions

Most users only need to know how to invoke a skill. They do not need to care how it is implemented.

A practical sequence is:

1. Understand the project
2. Produce PRD / RD / QA / TXT artifacts
3. Generate route / tech-plan / swarm-plan plans
4. Move into controlled execution only after that

## Recommended workflows

### Existing-project refactor

1. `peaks doctor --json`
2. `peaks config workspace list --json`
3. `peaks artifacts workspace --json`
4. Use `peaks-txt` to create an initial context capsule
5. Use `peaks-prd` to define goals, non-goals, and acceptance criteria
6. Use `peaks-rd` to inspect project structure, tests, scripts, key modules, and risks
7. Use `peaks-qa` to define the regression matrix and coverage gate
8. Add `peaks-ui` if the work touches UI behavior
9. `peaks route --mode solo --solo-mode full-auto ... --dry-run --json`
10. `peaks tech-plan ... --swarm --dry-run --json`
11. `peaks swarm-plan ... --dry-run --json`
12. If needed, use `peaks minimax-worker ... --confirm --json`
13. Finish with top-tier code review, security review, and TypeScript review
14. Use `peaks-sc` to record impact, retention, and boundary data

### Adding a feature

1. First understand the project: README, package scripts, routing, service layer, tests, data model, and current git state
2. Use `peaks-prd` to define the feature goal, user value, acceptance criteria, and non-goals
3. Use `peaks-rd` to identify the smallest implementation slice and affected modules
4. Use `peaks-qa` to define new tests and regression tests
5. Then move into `route` or `autonomous` planning
6. Before execution, verify that the artifact workspace is outside the target repository
7. Finish implementation, unit tests, build, review, and security checks before moving on

### Fixing a bug

1. Reproduce or locate the bug first
2. Understand the related modules, call chain, tests, and existing conventions
3. Use `peaks-rd` to produce the root cause, fix strategy, and regression risk
4. Use `peaks-qa` to define the failing case and acceptance conditions
5. Add the failing test first, then make the minimal fix
6. Run focused tests and the relevant build
7. Then run code / security / TypeScript review
8. Use `peaks-sc` to record the impact range and boundaries

## JSON output

Most CLI commands support `--json`. Automation should prefer it because the output is a stable envelope:

```json
{
  "ok": true,
  "command": "workflow.route",
  "data": {},
  "warnings": [],
  "nextActions": []
}
```

## Security boundaries

- Do not write secrets into project config or artifacts.
- Provider URLs must use a trusted allowlist and HTTPS.
- Do not skip the discovery phase for existing projects.
- Refactors require tests, coverage, and an acceptance surface before implementation.
- Intermediate artifacts should live outside the target repository.
- Any action that modifies remotes, creates repositories, pushes code, or changes shared configuration requires explicit confirmation.
- External provider workers such as MiniMax require confirmation that inputs may be sent out.

## Design stance

Peaks should coexist with tools such as cc-switch. It should not edit cc-switch state. Peaks manages Claude global skills, MCP, hooks, agents, and profiles only through Peaks-managed state, dry-run plans, backups, and rollback-aware sync.
