# ADR-001: Temporal for Workflow Orchestration

## Status
Adopted — 2026-04-18

## Context

As oas-coverage-agent evolves beyond a single CI job, several features require
reliable multi-step execution: scheduled spec audits across multiple repos,
fan-out pipelines that audit N microservices in parallel, retry logic for
transient Anthropic API failures, and long-running sessions that outlast a
single GitLab runner timeout.

The current harness (`src/harness.js`) encodes a linear 3-step lifecycle
(create environment → start session → stream). Any fan-out, scheduling, or
retry behaviour added on top of this would need to be hand-rolled, producing
fragile custom orchestration logic that is hard to test and observe.

## Decision

Use **Temporal** as the workflow orchestration layer for any feature that requires:

- Multi-step execution with durable state
- Scheduled or recurring runs (cron-style triggers)
- Fan-out / fan-in across multiple repos or services
- Retries with backoff on external API calls (Anthropic, GitLab)
- Long-running jobs that exceed CI runner timeout limits
- Human-in-the-loop approval steps before committing patches

The existing `harness.js` lifecycle steps map directly to Temporal Activities.
The overall audit pipeline (detect spec → provision environment → run session →
commit patch → cleanup) becomes a Temporal Workflow.

## Why Temporal

**Durability** — Temporal persists workflow state to its database. If a worker
crashes mid-audit, the workflow resumes exactly where it left off. A hand-rolled
queue or cron job loses in-flight state.

**Retries as first-class citizens** — `RetryPolicy` on an Activity eliminates
manual retry loops. Exponential backoff, max attempts, and non-retryable error
lists are declared in code, not implemented.

**Visibility** — Temporal UI shows every workflow execution, its current state,
and the full event history. Debugging a stuck audit does not require grepping
CI logs.

**Testability** — the Temporal test framework lets unit tests replay deterministic
workflow histories without a live server. This fits the project's offline-first
test philosophy (`npm run test:unit` runs without any API key).

**Fan-out is native** — `Promise.all` over child workflows or parallel activities
is idiomatic Temporal; it does not require a custom worker pool or job queue.

**Alternatives considered:**

| Option | Why rejected |
|--------|-------------|
| Hand-rolled retry in `harness.js` | Non-durable; state lost on crash; grows into spaghetti |
| BullMQ / Redis queue | Durable queues but no workflow primitives; fan-out needs custom code |
| GitHub/GitLab scheduled pipelines | CI-native but no cross-repo fan-out, no mid-job durability |
| AWS Step Functions | Cloud-locked; local dev and test story is poor |

## Consequences

- New orchestration features are implemented as **Temporal Workflows and Activities**, not as imperative harness code.
- `src/harness.js` remains the Activity implementation layer — it should stay thin and side-effect free (no retry loops, no polling).
- A `src/worker.js` entry point registers Activities and starts the Temporal worker.
- Scheduled audits use Temporal Schedules (not GitLab cron jobs) so the schedule is version-controlled alongside the workflow code.
- The `manifests/environment.yaml` container spec remains unchanged — Activities call the Managed Agents API exactly as `harness.js` does today.
- Local development requires a running Temporal server (`temporal server start-dev`).

## Related Tasks

> Authoritative list of tasks that implement or are constrained by this decision.
> When a task is added here, its Related decisions field must also link back to this ADR.
> Task filenames follow the convention: `adr-001-<slug>.md`

| Task | Description | Status |
|------|-------------|--------|
| none yet | Tasks will appear here when Temporal features are scoped | — |

## Agent Instructions

> These instructions are binding when Claude Code works on any feature involving
> scheduling, fan-out, retries, long-running jobs, or multi-step orchestration.

**Always invoke the `/temporal-developer` skill** before implementing or modifying
workflow orchestration code. Do not start writing Temporal code without it.

**Workflow patterns to follow:**

- Define one Workflow per logical audit pipeline (e.g. `OasCoverageWorkflow`)
- Keep Workflows deterministic — no `Date.now()`, `Math.random()`, or direct I/O inside a Workflow function
- Implement all side effects (API calls, git operations, file I/O) as Activities
- Declare `RetryPolicy` on every Activity that calls an external API; never write a manual retry loop
- Use `continueAsNew` for workflows that fan out over large repo lists to avoid history bloat
- Use Temporal Schedules for recurring audits; remove any GitLab cron job that duplicates the schedule

**Anti-patterns to avoid:**

- Do not add retry loops, sleep/poll patterns, or stateful queues to `harness.js`
- Do not use `setTimeout` or `setInterval` inside a Workflow function
- Do not call the Anthropic or GitLab APIs directly from a Workflow — always via an Activity
- Do not use a separate job queue (BullMQ, pg-boss, etc.) alongside Temporal; pick one
