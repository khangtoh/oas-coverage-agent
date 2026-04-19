# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Lint (syntax check JS + validate YAML manifests)
npm run lint

# Run all tests (112 tests)
npm test

# Run subsets
npm run test:unit          # 63 tests — detect-spec, manifest, register-agent (offline)
npm run test:spec          # 35 tests — OAS/Swagger example validation
npm run test:integration   # 12 tests — harness prompt/report logic
npm run test:watch         # re-run on file change

# One-time agent registration (requires ANTHROPIC_API_KEY)
npm run register
```

## Architecture

This is a **GitLab CI AI agent** that automatically audits microservice repos for OpenAPI Specification (OAS) coverage. When a merge request opens, it provisions a cloud container with the repo mounted, runs Claude to extract HTTP routes and diff them against the spec, generates any missing OAS entries, and commits the patched spec back to the MR branch.

### Separation of concerns

The project intentionally separates three layers:

| Layer | Files | What to change |
|-------|-------|---------------|
| **Harness** (CI lifecycle) | `src/harness.js` | Only Managed Agents API calls: create env → start session → stream → parse → commit → cleanup |
| **Agent** (AI brain) | `manifests/oas-agent.yaml` | System prompt (670+ lines), model, tools — run `npm run register` after editing |
| **Environment** (container) | `manifests/environment.yaml` | Runtimes (Node/Python/Go), memory, network, `/repo` mount |
| **Harness config** | `manifests/harness.yaml` | Retry policy, logging, git config, MR comment template |

Keep `src/harness.js` thin — no AI logic, only lifecycle coordination.

### Key files

- `src/detect-spec.js` — auto-detects Swagger 2.0 / OAS 3.0 / 3.1 and resolves `.oas-checker.yaml` config before the session starts
- `src/register-agent.js` — one-time registration: POSTs `manifests/oas-agent.yaml` to Anthropic API, writes agent ID into `manifest.yaml`
- `manifest.yaml` — single source of truth for deployment state; maintains append-only registration history; version must stay in sync with `package.json`
- `examples/.oas-checker.yaml` — per-repo config template (scan dirs, spec path, tag strategy, schema hints, exclusions)
- `test/helpers/` — extracted pure functions (`buildTaskPrompt`, `parseReport`, `buildArtifact`) used by integration tests to avoid needing live API calls

### Data flow

```
MR opened → GitLab CI → harness.js
  1. POST /v1/environments  (provision container, mount /repo)
  2. POST /v1/sessions      (start agent with format-specific prompt)
  3. GET  /v1/sessions/{id}/stream  (SSE: bash → find routes, file_read → spec, file_write → patch)
  4. Parse JSON report from agent output
  5. git commit + push if generated.length > 0
  6. DELETE /v1/environments (stop billing)
  7. Write oas-check-report.json artifact
```

### Environment variables (CI runtime)

`CI_PROJECT_DIR`, `CI_COMMIT_REF_NAME`, `CI_MERGE_REQUEST_IID`, `ANTHROPIC_API_KEY`, `OAS_AGENT_ID`, `GITLAB_TOKEN`, `OAS_PATH` (default `openapi.yaml`), `SRC_DIRS` (default `src,app,lib,routes,api`)

### Manifest versioning

`manifest.yaml` tracks the currently registered agent ID and full history. When changing the agent definition in `manifests/oas-agent.yaml`, always run `npm run register` to obtain a new agent ID and keep `manifest.yaml` in sync with `package.json` version.

### CHANGELOG

Document all manifest changes in `CHANGELOG.md`. Update `docs/DESIGN.md` Mermaid diagrams if the data flow changes.

## PR Workflow Rules

`.claude/settings.json` contains a `PostToolUse` hook that fires after every `mcp__github__create_pull_request` call and injects a mandatory reminder to subscribe. When that reminder arrives, call `subscribe_pr_activity` immediately with the PR number — do not defer this.

Once subscribed, handle incoming `<github-webhook-activity>` events as follows:
- **Review comments**: Investigate. Fix and push if clear and non-destructive; use `AskUserQuestion` if ambiguous or architecturally significant.
- **CI failures**: Investigate and fix if tractable, then push. Surface to user if root cause is unclear.
- **Duplicate or no-action events**: State so and skip.

**Codex agents**: Codex (OpenAI) has no equivalent `subscribe_pr_activity` tool and cannot receive webhook events. For Codex sessions, PR monitoring must be done manually — ask the user to notify you of new activity or check the PR explicitly when requested.

## Current tasks

To answer "what is being worked on right now", look at the files in
`docs/exec-plans/active/`. Every file there is an active task. If the directory is empty, nothing is in progress.

## Technology Decisions and Task Association

ADRs (in `docs/decisions/`) are the **feature specs**: they document why a technology was chosen,
what patterns are required, and contain **binding agent instructions** for that technology area.

Tasks (in `docs/exec-plans/`) are the **implementation units**: concrete work items that implement or
are constrained by an ADR. Active work lives in `docs/exec-plans/active/`; completed work is archived in `docs/exec-plans/completed/`.

**Association rules — follow these exactly:**

1. A task governed by an ADR is named `docs/exec-plans/active/adr-NNN-<slug>.md` — the slug encodes the ADR.
2. That task's `Related decisions` field links to the ADR and says how it constrains the work.
3. The ADR's `Related Tasks` table lists that task. The ADR is authoritative for this list.
4. Tasks not governed by any ADR use a plain name and set `Related decisions: none`.

**Navigation:**
- Start from a task → follow `Related decisions` to find the spec and binding constraints.
- Start from a spec → check `Related Tasks` to find all implementation work.
- See `docs/decisions/README.md` for the full decision ledger and association model diagram.
- See `docs/exec-plans/README.md` for the task ledger.

**Before implementing any feature involving scheduling, orchestration, retries, fan-out, or long-running jobs:**
read `docs/decisions/adr-001-temporal.md` and follow its Agent Instructions.
