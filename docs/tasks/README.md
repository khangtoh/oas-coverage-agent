# Task Ledger

> **Current tasks:** see the In Progress section below — every row there is active work.
> If it is empty, nothing is in progress.

All planned and in-progress work. Each row links to a detailed task spec.

## Association model

Tasks and ADRs have a bidirectional relationship. See `docs/decisions/README.md`
for the full model. Key rules for this ledger:

- If a task implements or is bounded by an ADR, its **filename** is `adr-NNN-<slug>.md`
  and its **Related decisions** field links to that ADR.
- If a task is not governed by any ADR, its **Related decisions** field is `none`
  (explicit, not blank — `none` means "checked and not applicable").
- The Decision column below is a **derived view** of each task file's Related decisions field.
  The task file is authoritative. If they disagree, the task file wins.

## Open

| ID | Task | Version | Decision |
|----|------|---------|----------|
| [T-001](./ci-docker-integration.md) | Migrate CI integration to Docker image | 2.3.0 | none |

## In Progress

| ID | Task | Version | Decision |
|----|------|---------|----------|
| — | Nothing in progress | — | — |

## Done

| ID | Task | Version | Decision | Completed |
|----|------|---------|----------|-----------|
| — | Manifest-based version tracking | 2.2.0 | none | 2026-04-10 |
| — | Swagger 2.0 backwards compatibility + detect-spec | 2.1.0 | none | 2026-04-01 |
| — | Rewrite: replace DIY loop with Claude Managed Agents | 2.0.0 | none | 2026-03-20 |

## Adding a task

1. **Determine if an ADR governs this work.**
   - Yes → name the file `docs/tasks/adr-NNN-<slug>.md`; set Related decisions to that ADR; add the task to the ADR's Related Tasks table.
   - No  → name the file `docs/tasks/<slug>.md`; set Related decisions to `none`.
2. Add a row to the Open table above.
3. Move to In Progress when work starts; move to Done (with date) when merged.

### Template

```markdown
# T-NNN: <Title>

| Field | Value |
|-------|-------|
| **ID** | T-NNN |
| **Status** | Open / In Progress / Done |
| **Target version** | x.y.z |
| **Related decisions** | [ADR-NNN: <Title>](../decisions/adr-NNN-<slug>.md) — one line on how it constrains this task. Or: `none` |

## Problem
Why this work is needed. What is broken or missing.

## Proposed Solution
How it will be fixed or built.

## Acceptance Criteria
- [ ] Criterion one
- [ ] Criterion two

## Out of Scope
What this task deliberately does not address.
```
