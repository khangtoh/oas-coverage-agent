# Technology Decision Ledger

Architecture Decision Records (ADRs) for adopted technology choices.
Each ADR documents the context, rationale, consequences, and **agent instructions**
— the skills and patterns Claude Code must use when working in that technology area.

## Association model

ADRs and tasks have a bidirectional relationship:

```
ADR (the spec)           Task (the work)
─────────────────        ──────────────────────────────
WHY a technology         WHAT to build / fix
Binding constraints      Acceptance criteria
Agent instructions       Implementation detail

ADR.Related Tasks ──────► links to task files
                 ◄──────  Task.Related decisions
```

**Source of truth rules:**

- An **ADR's Related Tasks table** is authoritative for "which tasks this decision spawned or constrains."
  When you create a task that implements or is bounded by an ADR, add it to the ADR's Related Tasks table first.
- A **task's Related decisions field** must mirror that link.
  These two must always agree. If they disagree, the ADR is authoritative.

**Slug convention:**
Tasks that directly implement an ADR use the filename `adr-NNN-<slug>.md`
so the association is visible from the filesystem without opening either file.
Tasks not governed by any ADR use a plain `<slug>.md` name (stored in `docs/exec-plans/active/`).

## Decisions

| ADR | Title | Status | Date | Tasks |
|-----|-------|--------|------|-------|
| [ADR-001](./adr-001-temporal.md) | Temporal for workflow orchestration | Adopted | 2026-04-18 | none yet |

> The Tasks column is a derived view. The ADR file's Related Tasks section is authoritative.

## Status values

- **Proposed** — under discussion, not yet binding
- **Adopted** — active; agent instructions are enforced
- **Superseded** — replaced by a newer ADR (link to successor)
- **Deprecated** — no longer applies; kept for historical record

## Adding a new ADR

1. Create `docs/decisions/adr-NNN-<slug>.md` from the template below
2. Add a row to the Decisions table above
3. For each task that will implement it, either create the task file now or note it as "none yet"

### Template

```markdown
# ADR-NNN: <Title>

## Status
Proposed | Adopted | Superseded by [ADR-NNN](./adr-NNN-<slug>.md) | Deprecated

## Context
Why this decision was needed. What problem or constraint prompted it.

## Decision
What was decided, stated plainly.

## Why <Technology>
Specific reasons this technology was chosen over alternatives.
Include any alternatives considered and why they were rejected.

## Consequences
What this means for the codebase going forward —
new patterns introduced, things that are now off-limits, operational implications.

## Related Tasks
> Authoritative list of tasks that implement or are constrained by this decision.
> When a task is added here, its Related decisions field must also link back to this ADR.
> Task filenames follow the convention: `adr-NNN-<slug>.md`

| Task | Description | Status |
|------|-------------|--------|
| none yet | | |

## Agent Instructions
> These instructions are binding when Claude Code works in this technology area.

- Which skill to invoke
- Patterns that must be followed
- Anti-patterns that must be avoided
```
