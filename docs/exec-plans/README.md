# Exec Plans

> **Current work:** see [`active/`](active/) — every file there is in-flight.
> If the directory is empty (or only contains this README), nothing is in progress.

Implementation tasks for OAS Coverage Agent. Active work lives in `active/`; completed work is archived in `completed/`.

---

## Association model

Tasks and ADRs have a bidirectional relationship. See `docs/decisions/README.md` for the full model. Key rules:

- If a task implements or is bounded by an ADR, its **filename** is `adr-NNN-<slug>.md` and its **Related decisions** field links to that ADR.
- If a task is not governed by any ADR, its **Related decisions** field is `none` (explicit, not blank).
- The ADR's `Related Tasks` table lists that task. The ADR is authoritative for this list.

---

## Active

| ID | Task | Version | Decision |
|----|------|---------|----------|
| [T-001](active/t-001-ci-docker-integration.md) | Migrate CI integration to Docker image | 2.3.0 | none |
| [T-002](active/adr-002-pr-lifecycle-agents-md.md) | PR lifecycle rule + AGENTS.md cross-vendor layer | 2.3.0 | [ADR-002](../decisions/adr-002-doc-structure.md) |

## Completed

| Task | Version | Completed |
|------|---------|-----------|
| [Manifest-based version tracking](completed/manifest-versioning.md) | 2.2.0 | 2026-04-10 |
| [Swagger 2.0 backwards compatibility + detect-spec](completed/swagger-2-support.md) | 2.1.0 | 2026-04-01 |
| [Rewrite: replace DIY loop with Claude Managed Agents](completed/managed-agents-rewrite.md) | 2.0.0 | 2026-03-20 |

---

## Adding a task

1. **Determine if an ADR governs this work.**
   - Yes → name the file `docs/exec-plans/active/adr-NNN-<slug>.md`; set Related decisions to that ADR; add the task to the ADR's Related Tasks table.
   - No  → name the file `docs/exec-plans/active/<slug>.md`; set Related decisions to `none`.
2. Add a row to the Active table above.
3. When work is merged: move the file to `completed/`, add a row to the Completed table, remove from Active.

### Template

```markdown
# T-NNN: <Title>

| Field | Value |
|-------|-------|
| **ID** | T-NNN |
| **Status** | Open / In Progress / Done |
| **Target version** | x.y.z |
| **Related decisions** | [ADR-NNN: <Title>](../../decisions/adr-NNN-<slug>.md) — one line on how it constrains this task. Or: `none` |

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
