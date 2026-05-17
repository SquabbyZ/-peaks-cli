---
name: peaks-qa
description: QA and verification skill for Peaks. Use when a workflow needs unit-test coverage evidence, regression matrices, baseline reports, validation reports, acceptance checks, or refactor verification gates.
---

# Peaks QA

Peaks QA proves that planned changes are protected and accepted.

## Responsibilities

- inspect unit-test coverage evidence;
- define regression matrices;
- produce baseline reports;
- define acceptance checks for refactor slices;
- validate that implementation satisfies the spec;
- record residual risks.

## Refactor role

For refactors, QA must be involved before implementation. It defines the regression and acceptance surface, then verifies the same surface after implementation.

## External capability guidance

Use `peaks capabilities --source access-repo --json` before recommending browser or validation MCPs.

- Playwright MCP can support controlled browser and E2E validation after the target app and environment are approved.
- Chrome DevTools MCP can support console, network, accessibility, and performance inspection for QA evidence.
- Agent Browser can support browser walkthroughs, but never submit forms, purchase, delete, or mutate authenticated state without explicit confirmation.
- If browser automation is unavailable, fall back to local Playwright, screenshots, logs, and manual regression steps.

## Boundaries

Do not own product scope or implementation. Do not modify runtime configuration.

Reference: `references/regression-gates.md`.
