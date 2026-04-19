# ADR-002: Engineering Doc Structure — OpenAI Harness Pattern Alignment

## Status

Adopted — 2026-04-19

## Context

The project's documentation was ad-hoc: a README, a CLAUDE.md, and a flat `docs/` directory containing only `DESIGN.md` and an `decisions/` folder. There was no systematic approach to architecture visibility, security/reliability runbooks, tech debt tracking, or task lifecycle management.

To establish an intentional structure we performed a gap analysis against the OpenAI harness engineering doc pattern — a well-known reference layout used by AI-native engineering teams:

```
AGENTS.md
ARCHITECTURE.md
docs/
├── design-docs/
├── exec-plans/
│   ├── active/
│   ├── completed/
│   └── tech-debt-tracker.md
├── generated/
├── product-specs/
├── references/
├── DESIGN.md
├── FRONTEND.md
├── PLANS.md
├── PRODUCT_SENSE.md
├── QUALITY_SCORE.md
├── RELIABILITY.md
└── SECURITY.md
```

The question was: which of these patterns are genuinely useful for a focused GitLab CI pipeline tool, and which are intended for product teams, frontend apps, or larger engineering orgs?

## Decision

Adopt a constrained subset of the OpenAI harness pattern. Every item was evaluated against a single test: **does this fill a real gap for a CI pipeline tool, or is it cargo-culting structure from a different context?**

## Adopted

| Pattern | Adopted As | Rationale |
|---------|-----------|-----------|
| `AGENTS.md` at root | `AGENTS.md` | Multi-agent collaboration needs a tool-neutral contract. `AGENTS.md` defines shared rules such as `auto`, `ask`, and `skip`; `CLAUDE.md` remains Claude-specific guidance. |
| `ARCHITECTURE.md` at root | `ARCHITECTURE.md` | Architecture was buried in `docs/DESIGN.md`. Root placement makes it the first thing a new engineer or agent finds; `DESIGN.md` remains for detailed Mermaid diagrams. |
| `docs/RELIABILITY.md` | `docs/RELIABILITY.md` | The project makes real API calls against billed infrastructure and commits to live MR branches. Retry policy, failure modes, environment lifecycle guarantees, and tuning guidance were not documented anywhere. |
| `docs/SECURITY.md` | `docs/SECURITY.md` | `ANTHROPIC_API_KEY` and `GITLAB_TOKEN` are passed through CI; the agent runs in a cloud container with the repo mounted. Threat model, secrets handling, sandbox guarantees, and `[skip ci]` safety are genuinely necessary — not cosmetic. |
| `docs/exec-plans/` with `active/` + `completed/` split | `docs/exec-plans/active/` and `docs/exec-plans/completed/` | The flat `docs/tasks/` directory with a README status table does not scale. Separating active from completed makes current work immediately visible without scanning a table. Completed tasks become an auditable record. |
| `docs/exec-plans/tech-debt-tracker.md` | `docs/exec-plans/tech-debt-tracker.md` | Seven known debt items existed across task files and comments with no central view. A tracker makes the full picture — impact, effort, target version — visible in one place. |
| `docs/references/` with `*-llms.txt` files | `docs/references/managed-agents-api-llms.txt` | Condensed external API references for AI agent context injection is the pattern most directly relevant to this project. Without it, agents (including Claude Code itself) hallucinate Managed Agents API endpoints, event types, and error codes. |
| `docs/PLANS.md` | `docs/PLANS.md` | The roadmap (Docker image v2.3, Temporal v3.0) was implicit across CHANGELOG entries and task files. A single roadmap doc makes prioritisation visible and connects in-flight tasks to future milestones. |

## Not Adopted

| Pattern | Decision | Rationale |
|---------|----------|-----------|
| `docs/FRONTEND.md` | Not applicable | The project has no frontend. |
| `docs/PRODUCT_SENSE.md` | Not necessary | Product philosophy for a single-purpose CI tool is fully expressed through architecture decisions. A separate product-sense doc would be filler that drifts from the actual design. |
| `docs/QUALITY_SCORE.md` | Not necessary | No formal quality rubric exists or is needed. The test suite — 112 tests across 5 suites, run with `npm test` — is the quality gate. A score doc would duplicate what CI already enforces. |
| `docs/generated/` | Deferred | No auto-generated documentation exists yet. Create this directory when the first generated artifact is introduced (e.g. a schema derived from `manifest.yaml`). Do not create it speculatively. |
| `docs/product-specs/` | Superseded by `docs/decisions/` | ADRs provide product intent with more rigour than a general product-specs folder: they include context, decision rationale, consequences, and binding agent instructions. A parallel product-specs layer would duplicate content without adding value. |
| `docs/design-docs/` | Superseded by `docs/decisions/` | The ADR format is more structured than a general design-docs folder, and `docs/DESIGN.md` already covers the technical design narrative with Mermaid diagrams. A separate design-docs directory would fragment rather than organise. |

## Consequences

- `docs/tasks/` is deleted; all internal references updated to `docs/exec-plans/`
- `AGENTS.md` is the shared multi-agent collaboration contract; `CLAUDE.md` points to it and keeps Claude-specific guidance
- `CLAUDE.md` navigation pointers updated to `docs/exec-plans/` throughout
- New contributors and AI agents land at `ARCHITECTURE.md` for a system overview, then follow links to `docs/DESIGN.md` for diagrams
- Agents editing `manifests/` or `src/harness.js` can find relevant runbooks at `docs/RELIABILITY.md` and `docs/SECURITY.md`
- Tech debt is tracked centrally at `docs/exec-plans/tech-debt-tracker.md`; new debt items belong there, not in task comments or commit messages
- When a future pattern from the OpenAI harness (or another reference) is proposed, this ADR's "Not Adopted" table is the first check — if a pattern was explicitly rejected, the decision record explains why

## Related Tasks

> The structural changes described in this ADR were executed directly without a separate task file, as the work was scoped and completed in a single session.

| Task | Description | Status |
|------|-------------|--------|
| — | Doc restructure executed directly; no open task | Done — 2026-04-19 |

## Agent Instructions

> These instructions are binding when Claude Code works on documentation structure in this repository.

**Navigation:** When asked about project structure, point to `ARCHITECTURE.md` first, then `docs/DESIGN.md` for diagrams.

**Before adding a new doc to `docs/`:** Check the "Not Adopted" table in this ADR. If the pattern was explicitly rejected, do not add it without first superseding this ADR with a new decision record.

**Task files:** Always create new task files in `docs/exec-plans/active/` — never in `docs/tasks/` (deleted) or any other location.

**Tech debt:** When identifying a new debt item, add it to `docs/exec-plans/tech-debt-tracker.md`, not to a task file, commit message, or inline comment.

**Security and reliability:** Route security concerns (secrets, threat model, sandbox) to `docs/SECURITY.md`. Route operational concerns (retry policy, failure modes, environment lifecycle) to `docs/RELIABILITY.md`. Do not scatter these across README or CLAUDE.md.
