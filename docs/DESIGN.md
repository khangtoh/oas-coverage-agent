# OAS Coverage Agent — Technical Design Document

**Version:** 2.0  
**Architecture:** Claude Managed Agents  
**Status:** Beta  

> For a high-level summary of components, layers, and design decisions, see [`ARCHITECTURE.md`](../ARCHITECTURE.md) at the repo root. This document contains the detailed Mermaid diagrams, state machines, and API reference.

---

## Overview

When a Merge Request is opened or updated in GitLab, a CI pipeline job automatically audits the microservice codebase for OpenAPI Specification (OAS) coverage. Any HTTP routes implemented in code but absent from `openapi.yaml` are detected and documented by an AI agent running in a cloud-managed container. The patched spec is committed back to the MR branch with no human intervention.

---

## End-to-End Data Flow

```mermaid
sequenceDiagram
    autonumber

    actor Dev as Developer
    participant GL as GitLab
    participant Runner as GitLab Runner<br/>(CI Job)
    participant H as harness.js
    participant MA as Claude Managed Agents<br/>(Anthropic Platform)
    participant Env as Cloud Container<br/>(Environment)
    participant Agent as OAS Agent<br/>(Claude Sonnet)
    participant Git as Git Remote<br/>(MR Branch)

    Dev->>GL: Opens / pushes to MR

    GL->>Runner: Trigger pipeline<br/>source: merge_request_event

    Runner->>H: node harness.js<br/>(CI_PROJECT_DIR mounted)

    Note over H: Validate env vars<br/>OAS_AGENT_ID, ANTHROPIC_API_KEY

    H->>MA: POST /v1/environments<br/>{ image, packages, mounts: [REPO_ROOT → /repo] }
    MA-->>H: { environment_id }

    H->>MA: POST /v1/sessions<br/>{ agent_id, environment_id, initial_event: task_prompt }
    MA-->>H: { session_id }

    MA->>Env: Provision container<br/>Node.js + Python + Go + ripgrep
    MA->>Env: Mount repo at /repo (read-write)
    MA->>Agent: Start agent loop with task prompt

    Note over Agent: System prompt:<br/>OAS audit engineer

    H->>MA: GET /v1/sessions/:id/stream (SSE)

    loop Agent autonomous execution
        Agent->>Env: bash: find /repo/src -type f
        Env-->>Agent: [file list]

        Agent->>Env: file_read: /repo/src/**/*.{js,ts,py,go,...}
        Env-->>Agent: source file contents

        Note over Agent: Extract routes<br/>across all frameworks/languages<br/>Normalise :id → {id}

        Agent->>Env: file_read: /repo/openapi.yaml
        Env-->>Agent: existing OAS document

        Note over Agent: Diff extracted routes<br/>vs documented paths + methods<br/>→ identify gaps

        Agent->>Env: file_read: handler files for missing routes
        Env-->>Agent: handler source (for schema inference)

        Note over Agent: Generate OAS 3.1 path items<br/>operationId, tags, parameters,<br/>requestBody, responses

        Agent->>Env: file_write: /repo/openapi.yaml (patched)
        Env-->>Agent: write confirmed

        MA-->>H: SSE: tool.use events (streamed)
        MA-->>H: SSE: message.text.delta (progress)
        MA-->>H: SSE: session.checkpoint
    end

    Agent->>MA: Emit final JSON report line<br/>{"routesFound":N,"missing":[...],"generated":[...]}
    MA-->>H: SSE: session.status completed

    H->>H: parseReport(agentOutput)

    alt Missing routes were found & documented
        H->>Git: git add openapi.yaml
        H->>Git: git commit -m "chore(oas): add missing paths [skip ci]"
        H->>Git: git push origin HEAD:branch
        Git-->>GL: Push received (no new pipeline — [skip ci])
    else Full coverage — no changes needed
        H->>H: Log "OAS coverage complete"
    end

    H->>MA: DELETE /v1/environments/:id (terminate)
    MA-->>H: environment terminated

    H->>Runner: Write oas-check-report.json (CI artifact)
    Runner-->>GL: Job completed + artifact uploaded

    GL-->>Dev: Pipeline status + artifact link on MR
```

---

## Component Breakdown

### Actors & Systems

| Component | Role | Where it runs |
|---|---|---|
| **GitLab** | MR event trigger, pipeline orchestration, artifact storage | GitLab SaaS / self-hosted |
| **GitLab Runner** | Executes the CI job; hosts `harness.js` | Runner VM / Docker executor |
| **harness.js** | Thin lifecycle controller — 3 API calls, no AI logic | Runner process |
| **Claude Managed Agents** | Provisions environments, manages the agent loop, handles checkpointing | Anthropic Platform |
| **Cloud Container (Environment)** | Isolated sandbox with repo mounted; tool execution surface | Anthropic-managed infra |
| **OAS Agent (Claude Sonnet)** | Reads source, extracts routes, diffs OAS, generates and writes entries | Inside managed container |
| **Git Remote** | Receives the patched `openapi.yaml` commit | GitLab repository |

---

## State Machine — Session Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Provisioning : POST /v1/environments

    Provisioning --> Ready : Container live,<br/>repo mounted at /repo

    Ready --> Running : POST /v1/sessions<br/>initial_event injected

    Running --> Running : Agent tool calls<br/>(bash, file_read, file_write)

    Running --> Checkpointed : session.checkpoint event<br/>(resumable if disconnected)

    Checkpointed --> Running : Auto-resume

    Running --> Completed : Agent emits JSON report<br/>session.status = completed

    Running --> Failed : Unrecoverable error

    Running --> TimedOut : Exceeds 30 min wall clock

    Completed --> Committed : harness git push<br/>(if generated.length > 0)
    Completed --> Done : No changes needed

    Committed --> Done : push accepted

    Failed --> Done : harness writes error artifact
    TimedOut --> Done : harness writes error artifact

    Done --> Terminated : DELETE /v1/environments/:id

    Terminated --> [*]
```

---

## Data Flow — Inside the Agent

```mermaid
flowchart TD
    START([Session starts\nwith task prompt]) --> FIND

    FIND["bash: find /repo\nfilter by extension\nskip: node_modules, dist,\n__pycache__, test files"]

    FIND --> READ_SRC["file_read: source files\nin batches by directory"]

    READ_SRC --> EXTRACT["Extract HTTP routes\nacross all frameworks\n\nExpress · Fastify · Flask · FastAPI\nGin · Echo · Spring · Rails\nLaravel · Actix · .NET · Phoenix"]

    EXTRACT --> NORMALISE["Normalise path params\n:id → {id}\n<int:pk> → {pk}\n{userId} → {userId}"]

    NORMALISE --> READ_OAS{"file_read:\nopenapi.yaml\nexists?"}

    READ_OAS -- Yes --> PARSE_OAS["Parse existing paths\n+ methods"]
    READ_OAS -- No --> SCAFFOLD["Create OAS 3.1 scaffold\nwith service name from\ndirectory"]

    PARSE_OAS --> DIFF
    SCAFFOLD --> DIFF

    DIFF["Diff: extracted routes\nvs documented paths\n\nMissing path key?\nMissing method on path?"]

    DIFF --> COVERAGE{Any gaps\nfound?}

    COVERAGE -- None --> REPORT_CLEAN["Emit JSON report\ngenerated: []"]

    COVERAGE -- Yes --> READ_HANDLERS["file_read: handler files\nfor each missing route\n(using file hint from extraction)"]

    READ_HANDLERS --> GENERATE["Generate OAS 3.1 path items\n\noperationId (camelCase, unique)\nsummary + description\ntags (from resource name)\nparameters (types inferred)\nrequestBody (if POST/PUT/PATCH)\nresponses (200 + error codes)"]

    GENERATE --> MERGE["Merge into existing spec\nSort paths alphabetically\nPreserve existing entries"]

    MERGE --> WRITE["file_write:\n/repo/openapi.yaml"]

    WRITE --> REPORT_PATCHED["Emit JSON report\n{routesFound, missing,\ngenerated, oasPath}"]

    REPORT_CLEAN --> END([Session completes])
    REPORT_PATCHED --> END
```

---

## Harness Sequence — API Calls Detail

```mermaid
flowchart LR
    subgraph CI ["GitLab CI Runner"]
        H[harness.js]
    end

    subgraph AP ["Anthropic Platform — Managed Agents API"]
        ENV["POST /v1/environments\n─────────────────\nbody:\n  image: agent-runtime\n  packages: [node,python3,go,ripgrep]\n  mounts: [{src: REPO_ROOT, dst: /repo}]\n  env: {OAS_PATH, SRC_DIRS}\n─────────────────\nreturns: { id: env_xxx }"]

        SES["POST /v1/sessions\n─────────────────\nbody:\n  agent_id: OAS_AGENT_ID\n  environment_id: env_xxx\n  metadata: {mr_iid, commit_sha}\n  initial_event:\n    type: user\n    content: <task prompt>\n─────────────────\nreturns: { id: ses_xxx }"]

        STR["GET /v1/sessions/ses_xxx/stream\n─────────────────\nSSE events:\n  session.status\n  tool.use\n  tool.result\n  message.text.delta\n  session.checkpoint\n─────────────────\nterminates on: status=completed"]

        DEL["DELETE /v1/environments/env_xxx\n─────────────────\nStops billing session-hour\nAuto-expires after 24h\nif not explicitly terminated"]
    end

    H -->|"1 — create env"| ENV
    ENV -->|"env_id"| H
    H -->|"2 — start session"| SES
    SES -->|"session_id"| H
    H -->|"3 — observe stream"| STR
    STR -->|"final text + status"| H
    H -->|"4 — cleanup"| DEL
```

---

## CI Variables Reference

| Variable | Required | Scope | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Masked, Protected | Anthropic API key |
| `OAS_AGENT_ID` | ✅ | Masked, Protected | UUID from `register-agent.js` |
| `GITLAB_TOKEN` | ✅ | Masked, Protected | Project access token (`write_repository`) |
| `OAS_PATH` | optional | — | Path to spec file; default `openapi.yaml` |
| `SRC_DIRS` | optional | — | Comma-separated source dirs; default `src,app,lib,routes,api` |
| `OAS_COMMIT_MESSAGE` | optional | — | Commit message for spec updates |

---

## Agent Registration (One-Time Setup)

```mermaid
sequenceDiagram
    actor Eng as Platform Engineer
    participant Script as register-agent.js
    participant MA as Managed Agents API
    participant GL as GitLab CI Variables

    Eng->>Script: ANTHROPIC_API_KEY=... node register-agent.js

    Script->>Script: Load oas-agent.yaml\n(name, model, system_prompt, tools)

    Script->>MA: POST /v1/agents\n{ name, model, system_prompt, tools }
    MA-->>Script: { id: agt_xxx, created_at }

    Script->>Eng: Print agent ID

    Eng->>GL: Set OAS_AGENT_ID = agt_xxx\n(masked + protected)

    Note over GL: One agent ID serves\nall microservice repos.\nRe-register only to\nchange system prompt or model.
```

---

## Artifact Schema

`oas-check-report.json` is uploaded as a GitLab CI artifact on every run:

```json
{
  "success": true,
  "routesFound": 14,
  "missing": [
    "POST /orders",
    "DELETE /orders/{id}",
    "GET /orders/{id}/status"
  ],
  "generated": [
    "/orders",
    "/orders/{id}",
    "/orders/{id}/status"
  ],
  "oasPath": "openapi.yaml",
  "sessionId": "ses_01ABCxyz...",
  "message": "Added 3 missing path(s) to openapi.yaml"
}
```

On full coverage (no changes):

```json
{
  "success": true,
  "routesFound": 14,
  "missing": [],
  "generated": [],
  "oasPath": "openapi.yaml",
  "sessionId": "ses_01ABCxyz...",
  "message": "OAS coverage complete — no changes needed"
}
```

---

## Pricing Model

| Item | Rate | Typical MR run |
|---|---|---|
| Claude Sonnet tokens | Standard API pricing | ~50K–150K tokens |
| Active session runtime | $0.08 / session-hour | 3–8 min active → $0.004–$0.011 |
| Idle time (waiting on tools) | Free | Not billed |
| Total per MR | — | **~$0.01–$0.05** |

---

## Design Decisions

### Why Managed Agents vs DIY harness

The v1 harness owned the agent loop: batching files into 60 KB chunks, managing multi-call orchestration, and implementing error recovery. All of that logic encoded assumptions about what Claude couldn't handle. Those assumptions go stale as models improve.

In v2, the agent decides how to traverse the repo, which files to read, and how to handle large codebases. The harness is reduced to three API calls — environment, session, stream — with no AI logic of its own.

### Why one Agent ID for all repos

The agent definition contains the system prompt and tool configuration but no repo-specific context. All task context is injected at session creation time via the initial user event. This means a single registered agent serves every microservice, every language, every team.

### Why `[skip ci]` on the commit

The agent commits back to the MR branch. Without `[skip ci]`, that push would trigger another pipeline run, creating an infinite loop. The `[skip ci]` token in the commit message instructs GitLab to suppress pipeline creation for that push.

### Why terminate the environment explicitly

Environments are billed by active session-hour. The harness terminates the environment immediately after the session completes to stop the meter. Environments auto-expire after 24 hours as a safety net.
