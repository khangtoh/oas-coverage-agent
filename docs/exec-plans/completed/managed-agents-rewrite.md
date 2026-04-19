# Rewrite: Replace DIY Loop with Claude Managed Agents

| Field | Value |
|-------|-------|
| **Status** | Done |
| **Version** | 2.0.0 |
| **Completed** | 2026-03-20 |
| **Related decisions** | none |

## What Was Done

Rewrote the v1 harness, which owned the full agent loop (file chunking, multi-call orchestration, manual retry, error recovery), to use the Claude Managed Agents API.

The v2 harness is ~200 LOC and makes exactly three API calls:

1. `POST /v1/environments` — provision a cloud container with the repo mounted
2. `POST /v1/sessions` — start the agent with a task prompt
3. `GET /v1/sessions/:id/stream` — stream SSE events until `session.status = completed`

All AI logic (file traversal strategy, route extraction, OAS diffing, schema inference) moved into the agent's system prompt and runs inside the managed container. The harness has no AI logic of its own.

## Why

The v1 harness encoded assumptions about what Claude couldn't handle — chunking files into 60 KB batches, orchestrating multi-call sessions. Those assumptions go stale as models improve. Moving to Managed Agents transfers responsibility for context management and tool orchestration to the platform.

## Key Files Changed

- `src/harness.js` — full rewrite
- `manifests/oas-agent.yaml` — new: agent definition (system prompt 670+ lines, tool list)
- `manifests/environment.yaml` — new: container spec
- `manifests/harness.yaml` — new: operational config
- `src/register-agent.js` — new: one-time agent registration script
- `manifest.yaml` — new: deployment state tracking
