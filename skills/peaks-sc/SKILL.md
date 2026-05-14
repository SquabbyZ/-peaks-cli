---
name: peaks-sc
description: Source control, sync, and change-control skill for Peaks. Use when a workflow needs change impact, artifact retention, commit boundaries, GitHub artifact repository pointers, sync state, or rollback evidence.
---

# Peaks SC

Peaks SC records how product, RD, QA, code, and artifacts move together.

## Responsibilities

- produce change-impact artifacts;
- record commit boundaries;
- ensure intermediate artifacts are retained with code changes;
- track artifact repository pointers;
- record sync state and rollback points.

## Refactor role

Each refactor slice must leave a traceable commit boundary containing code changes and PRD/RD/QA/TXT intermediate artifacts.

## Boundaries

Do not implement code or test logic. Do not create GitHub repositories directly from the skill body. Use the Peaks CLI artifact commands.

Reference: `references/artifact-retention.md`.
