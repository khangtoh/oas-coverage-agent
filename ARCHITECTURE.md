# Architecture

OAS Coverage Agent is a **GitLab CI AI agent** that automatically audits microservice repos for OpenAPI Specification coverage. When a merge request opens, it provisions a cloud container with the repo mounted, runs Claude to extract HTTP routes and diff them against the spec, generates any missing OAS entries, and commits the patched spec back to the MR branch.

For the full technical design — sequence diagrams, state machines, and API call details — see [`docs/DESIGN.md`](docs/DESIGN.md).

---

## Layers

The project separates four concerns. Keep them separate — don't bleed AI logic into the harness or operational config into the agent definition.

| Layer | Files | What to change |
|-------|-------|----------------|
| **Harness** (CI lifecycle) | `src/harness.js` | Managed Agents API calls only: create env → start session → stream → parse → commit → cleanup |
| **Agent** (AI brain) | `manifests/oas-agent.yaml` | System prompt, model, tools — run `npm run register` after editing |
| **Environment** (container) | `manifests/environment.yaml` | Runtimes (Node/Python/Go), memory, network, `/repo` mount |
| **Harness config** | `manifests/harness.yaml` | Retry policy, logging, git config, MR comment template |

---

## Data Flow

```
MR opened → GitLab CI → harness.js
  1. POST /v1/environments   provision container, mount repo at /repo
  2. POST /v1/sessions       start agent with format-specific task prompt
  3. GET  /v1/sessions/stream  SSE: bash → find routes, file_read → spec, file_write → patch
  4. Parse JSON report from final agent output line
  5. git add + commit + push if generated.length > 0   [skip ci]
  6. DELETE /v1/environments  stop billing
  7. Write oas-check-report.json artifact
```

---

## Components

| Component | Role | Where it runs |
|-----------|------|---------------|
| **GitLab** | MR event trigger, pipeline orchestration, artifact storage | GitLab SaaS / self-hosted |
| **GitLab Runner** | Executes the CI job; hosts `harness.js` | Runner VM / Docker executor |
| **harness.js** | Thin lifecycle controller — 3 API calls, no AI logic | Runner process |
| **Claude Managed Agents** | Provisions environments, manages the agent loop, checkpointing | Anthropic Platform |
| **Cloud Container** | Isolated sandbox with repo mounted; tool execution surface | Anthropic-managed infra |
| **OAS Agent (Claude Sonnet)** | Reads source, extracts routes, diffs OAS, generates and writes entries | Inside managed container |
| **Git Remote** | Receives the patched `openapi.yaml` commit | GitLab repository |

---

## Key Files

```
src/
  harness.js            CI entrypoint — Managed Agents lifecycle only
  detect-spec.js        Auto-detects Swagger 2.0 / OAS 3.0 / 3.1; resolves .oas-checker.yaml
  register-agent.js     One-time agent registration (POST /v1/agents)
manifests/
  oas-agent.yaml        Agent definition: model, system prompt, tools
  environment.yaml      Cloud container spec: image, packages, mounts
  harness.yaml          Operational config: retry, logging, git, MR comments
manifest.yaml           Deployment state: registered agent ID + history
examples/
  openapi.yaml          Full OAS 3.1 example (order-service, 9 paths)
  .oas-checker.yaml     Per-repo config template
```

---

## Design Decisions

**Why Managed Agents vs DIY harness** — The v1 harness owned the agent loop: chunking files, managing orchestration, implementing error recovery. All that logic encoded assumptions about what Claude couldn't handle — assumptions that go stale as models improve. In v2, the agent decides how to traverse the repo. The harness is three API calls with no AI logic.

**Why one Agent ID for all repos** — The agent definition contains the system prompt and tool config but no repo-specific context. Task context is injected at session creation via the initial user event. One registered agent serves every microservice, every language, every team.

**Why `[skip ci]` on the commit** — The agent commits back to the MR branch. Without `[skip ci]`, that push would trigger another pipeline, creating an infinite loop.

**Why terminate the environment explicitly** — Environments are billed by active session-hour. The harness terminates immediately after the session completes. Environments auto-expire after 24h as a safety net.

---

## Further Reading

- [`docs/DESIGN.md`](docs/DESIGN.md) — Mermaid sequence diagrams, state machine, API call detail, artifact schema, pricing
- [`docs/SECURITY.md`](docs/SECURITY.md) — Threat model, secrets handling, sandbox guarantees
- [`docs/RELIABILITY.md`](docs/RELIABILITY.md) — Retry policy, failure modes, environment lifecycle guarantees
- [`docs/decisions/`](docs/decisions/) — Architecture Decision Records (ADRs)
- [`docs/exec-plans/`](docs/exec-plans/) — Active and completed implementation tasks
