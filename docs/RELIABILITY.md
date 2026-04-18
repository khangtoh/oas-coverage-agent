# Reliability

Retry policy, failure modes, environment lifecycle guarantees, and observability for the OAS Coverage Agent.

---

## Retry Policy

Configured in `manifests/harness.yaml` under `retry:`.

| Setting | Value | Notes |
|---------|-------|-------|
| `enabled` | `true` | Retry is on by default |
| `max_attempts` | 2 | First try + 2 retries = 3 total attempts |
| `initial_delay_seconds` | 10 | Wait before first retry |
| `backoff_multiplier` | 2 | Exponential: 10s → 20s |
| Retryable HTTP codes | `429, 500, 502, 503, 504` | Transient Managed Agents API errors |

**What is retried:** the entire harness flow — create environment, start session, stream. If any API call fails with a retryable status code, the harness tears down the environment (if created) and starts again from the beginning.

**What is NOT retried:**
- Sessions that reach `failed` status — these indicate an agent-level issue requiring investigation, not a transient failure.
- Sessions that reach `timed_out` status — extend `timeout_minutes` in `manifests/harness.yaml` if the repo is large.
- Git commit/push failures — these are logged and fail the job without retry.

---

## Failure Modes

| Failure | Behaviour | Recovery |
|---------|-----------|----------|
| `ANTHROPIC_API_KEY` missing | Immediate `process.exit(1)` before any API call | Set the CI variable |
| Environment creation fails (5xx) | Retry up to `max_attempts` times with backoff | Automatic |
| Session start fails | Retry (environment is terminated first) | Automatic |
| Session `timed_out` | Job fails; artifact written with `success: false` | Increase `session.timeout_minutes` |
| Session `failed` | Job fails; artifact written with `success: false` | Inspect session in Claude Console |
| Agent output has no JSON report | `parseReport()` returns empty defaults; no commit | Check agent output in CI log |
| Git push fails | Job fails with error; artifact still written | Check `GITLAB_TOKEN` permissions |
| Environment termination fails | Warning logged; environment auto-expires in 24h | No action needed |

---

## Artifact Guarantee

`oas-check-report.json` is **always written**, even on failure. The GitLab CI job uses `artifacts: when: always`, so the report is uploaded regardless of job exit code.

On success:
```json
{
  "success": true,
  "routesFound": 14,
  "missing": ["POST /orders"],
  "generated": ["/orders"],
  "oasPath": "openapi.yaml",
  "sessionId": "ses_01ABCxyz...",
  "message": "Added 1 missing path(s) to openapi.yaml"
}
```

On failure (`fail()` called in harness):
```json
{
  "success": false,
  "error": "Session ended in unexpected state: timed_out"
}
```

---

## Environment Lifecycle

```
POST /v1/environments   → environment created, billed by session-hour
POST /v1/sessions       → session started, agent loop running
GET  /v1/sessions/stream → stream until status = completed | failed | timed_out
DELETE /v1/environments → terminated immediately, billing stops
```

The `finally` block in `harness.js:main()` guarantees `terminateEnvironment()` is called even if the session fails. Environments auto-expire after **24 hours** as a safety net if the harness process is killed unexpectedly.

**Billing exposure window:** at most 24h if the process is killed mid-run with no cleanup. In normal operation: 3–8 minutes of active session time per MR.

---

## Session Checkpointing

The Managed Agents platform emits `session.checkpoint` events during long-running sessions. These allow the platform to resume a session if the SSE connection drops.

The harness logs checkpoint IDs (`💾 Checkpoint: chk_xxx`) but does not use them for resumption — it relies on the platform to auto-resume. If the runner is killed mid-stream, the session may continue running in the platform until it either completes or times out. The commit will not happen (since the harness process is dead), but the environment will eventually auto-expire.

---

## Observability

### CI Log

Every tool call is logged to the CI job output by default (`logging.log_tool_calls: true`):

```
🔧  Tool: bash → find /repo/src -name "*.js" -type f
🔧  Tool: file_read → /repo/src/routes/orders.js
🔧  Tool: file_write → /repo/openapi.yaml
```

Agent text output is streamed in real time (`logging.stream_agent_output: true`).

### Claude Console

Every session includes metadata (`gitlab_project`, `gitlab_mr_iid`, `gitlab_commit_sha`, `pipeline_url`) that appears in the Claude Console for filtering and debugging.

### MR Comments (optional)

Set `observability.post_mr_comment: true` in `manifests/harness.yaml` to post a formatted summary table on the GitLab MR. Requires `api` scope on `GITLAB_TOKEN`.

### Session Transcript (optional)

Set `artifact.write_transcript: true` to write the full session transcript alongside `oas-check-report.json`. Useful for debugging agent decisions on difficult repos. Disabled by default to reduce CI artifact size.

---

## Tuning for Large Repos

If sessions time out on large monorepos:

1. Increase `session.timeout_minutes` in `manifests/harness.yaml` (must be ≤ the GitLab CI job `timeout`)
2. Use `.oas-checker.yaml` in the target repo to narrow `scan.include` to only the relevant source directories
3. Use `.oas-checker.yaml` `scan.exclude` to skip generated code, vendor directories, or test fixtures
