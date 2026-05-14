---
name: peaks-rd
description: Research and development skill for Peaks. Use for engineering analysis, refactor planning, project scanning, code standards, unit-test coverage gates, implementation contracts, task graphs, and RD handoffs. Always use this for Peaks refactor workflows.
---

# Peaks RD

Peaks RD owns engineering analysis, implementation planning, and refactor execution contracts.

## Responsibilities

- scan the current project before changes;
- prefer existing project standards over built-in language standards;
- enforce the 95% UT coverage refactor gate;
- split broad refactors by minimal functional slices;
- generate refactor options, risk matrix, rollback plan, and task graph preview;
- implement only after strict specs and confirmations exist.

## Refactor hard gates

If a request is refactor, cleanup, architecture adjustment, module split, or technical debt work:

1. scan project structure and existing standards;
2. locate or run UT coverage;
3. block implementation unless coverage is >= 95%;
4. treat missing, unknown, or unverifiable coverage as failing;
5. generate intermediate artifacts before implementation;
6. call or consume peaks-prd and peaks-qa artifacts even in direct RD mode;
7. require strict slice spec before each slice;
8. require 100% acceptance for the slice;
9. require code and intermediate artifacts to be committed before continuing.

## Boundaries

Do not bypass PRD/QA artifacts. Do not install hooks, agents, MCP, or settings. Ask the Peaks CLI to handle runtime side effects.

Reference: `references/refactor-workflow.md`.
