# Peaks

Peaks is a CLI-first runtime and short Claude Code skill family for AI-assisted engineering workflows.

The project separates responsibilities clearly:

- **Skills are the brain**: they define workflows, boundaries, artifact contracts, and when to use external capabilities.
- **CLI is the hands**: it installs, configures, validates, syncs, and manages side-effectful runtime resources.
- **External skills and MCP are specialist capabilities**: Peaks discovers, installs, and verifies them instead of reimplementing everything.
- **Artifact repositories preserve memory**: intermediate specs, reports, traces, and validation evidence live outside the code diff.

## Current MVP

The first MVP focuses on `peaks-solo refactor`:

1. Detect refactor intent.
2. Understand the project before changes.
3. Enforce unit-test coverage >= 95% before implementation.
4. Split broad refactors into minimal functional slices.
5. Generate strict verifiable specs before each slice.
6. Require 100% acceptance for the slice.
7. Require code and intermediate artifacts to be committed before the next slice.

## Repository layout

```text
bin/                    CLI executable entrypoint
src/                    TypeScript source
  cli/                  human CLI and JSON API command surface
  services/             external-callable service layer
  shared/               shared filesystem, frontmatter, registry, output helpers
skills/                 Peaks short skill family
schemas/                shared artifact protocol schemas
templates/              CLI-managed hooks, agents, profiles, settings templates
docs/                   architecture, capability, and implementation notes
tests/                  Vitest test suite
```

## Development

```bash
npm install
npm run build
npm test
npm run test:coverage
node bin/peaks.js doctor --json
```

## Design stance

Peaks should coexist with tools such as cc-switch. It does not edit cc-switch state. Peaks manages Claude global skills, MCP, hooks, agents, and profiles only through Peaks-managed state, dry-run plans, backups, and rollback-aware sync.
