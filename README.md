# oas-coverage-agent

> AI-powered OpenAPI Spec coverage checker for GitLab CI, built on [Claude Managed Agents](https://claude.com/blog/claude-managed-agents).

[![CI](https://github.com/khangtoh/oas-coverage-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/khangtoh/oas-coverage-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![Managed Agents](https://img.shields.io/badge/Claude-Managed%20Agents-blueviolet)](https://claude.com/blog/claude-managed-agents)

When a Merge Request is opened, this tool spins up a Claude agent in a cloud container, reads your source code across any language or framework, diffs implemented routes against your `openapi.yaml`, and commits missing OAS 3.1 path entries back to the branch — automatically.

```
MR opened
   │
   ▼
GitLab CI → harness.js (3 API calls)
                │
                ▼
         Claude Managed Agent (cloud container)
         ├── bash: find + ripgrep source files
         ├── file_read: scan routes across all frameworks
         ├── Diff vs openapi.yaml
         ├── Generate OAS 3.1 path items from handler source
         └── file_write: patch openapi.yaml
                │
                ▼
         git commit → MR branch  +  oas-check-report.json artifact
```

---

## Features

- **Polyglot** — reads Express, Fastify, Flask, FastAPI, Gin, Echo, Spring, Rails, Laravel, Actix, .NET, and anything else via LLM-based route extraction; no per-framework parsers
- **Thin harness** — `harness.js` is ~200 LOC making exactly 3 API calls; all intelligence runs in the managed container
- **Auto-commit** — patched `openapi.yaml` is committed back to the MR branch with `[skip ci]` to avoid pipeline loops
- **Per-repo config** — `.oas-checker.yaml` in each service repo controls scan directories, tag strategy, schema hints, exclusion rules, and coverage thresholds
- **Full OAS 3.1** — generated entries include `operationId`, `tags`, `parameters` (typed), `requestBody`, and `responses` with error codes; not stubs
- **CI artifact** — `oas-check-report.json` uploaded on every run for dashboarding
- **Resumable** — Managed Agent sessions are checkpointed; disconnections don't lose progress
- **Observable** — session tracing in Claude Console; tool calls streamed to CI log in real time

---

## Repository layout

```
oas-coverage-agent/
├── ARCHITECTURE.md           Component overview, layers, data flow, design decisions
├── src/
│   ├── harness.js            CI entrypoint — Managed Agents lifecycle only
│   └── register-agent.js     One-time agent registration script
├── manifests/
│   ├── oas-agent.yaml        Agent definition: model, system prompt, tools
│   ├── environment.yaml      Cloud container spec: image, packages, mounts
│   └── harness.yaml          Operational config: retry, logging, git, MR comments
├── examples/
│   ├── openapi.yaml          Full OAS 3.1 example (order-service, 9 paths, 14 schemas)
│   └── .oas-checker.yaml     Per-repo project config — copy to each microservice
├── docs/
│   ├── DESIGN.md             Technical design doc with 5 Mermaid data flow diagrams
│   ├── SECURITY.md           Threat model, secrets handling, sandbox guarantees
│   ├── RELIABILITY.md        Retry policy, failure modes, environment lifecycle
│   ├── PLANS.md              Roadmap — in-flight and upcoming features
│   ├── decisions/            Architecture Decision Records (ADRs)
│   ├── exec-plans/           Implementation tasks (active/ and completed/)
│   └── references/           Condensed API references for AI agent context
├── .github/
│   └── workflows/ci.yml      GitHub Actions CI for this repo
└── .gitlab/
    └── oas-coverage.yml      Shareable GitLab CI job definition
```

---

## Quick start

### Prerequisites

- Node.js ≥ 20
- An [Anthropic API key](https://console.anthropic.com/) with Managed Agents access
- A GitLab project access token with `write_repository` + `api` scopes

### 1. Clone and install

```bash
git clone https://github.com/khangtoh/oas-coverage-agent.git
cd oas-coverage-agent
npm install
```

### 2. Register the agent _(once, ever)_

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run register
```

This calls `POST /v1/agents` and prints an agent UUID. Save it — you'll need it in step 4.

```
✅ Agent registered successfully!

Agent ID:   agt_01ABCDxyz...
Agent Name: oas-coverage-agent
Model:      claude-sonnet-4-20250514

─────────────────────────────────────────────────────────────
Add this to your GitLab CI/CD variables (masked + protected):

  OAS_AGENT_ID = agt_01ABCDxyz...
─────────────────────────────────────────────────────────────
```

### 3. Install in your microservice repo

Copy the tool into each microservice repo under `.oas-agent/`:

```bash
cp -r /path/to/oas-coverage-agent/.  your-service/.oas-agent/
cp oas-coverage-agent/examples/.oas-checker.yaml  your-service/.oas-checker.yaml
```

Edit `.oas-checker.yaml` to match your service's source layout, OAS path, and metadata.

### 4. Set CI/CD variables

In GitLab: **Settings → CI/CD → Variables**

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Masked, Protected |
| `OAS_AGENT_ID` | ✅ | UUID from step 2 — Masked, Protected |
| `GITLAB_TOKEN` | ✅ | Project access token (`write_repository`) — Masked, Protected |
| `OAS_PATH` | optional | Default: `openapi.yaml` |
| `SRC_DIRS` | optional | Default: `src,app,lib,routes,api` |

### 5. Add to `.gitlab-ci.yml`

**Option A — include from this repo (recommended):**

```yaml
include:
  - project: 'your-org/oas-coverage-agent'
    ref: main
    file: '.gitlab/oas-coverage.yml'
```

**Option B — copy the job definition directly:**

```yaml
oas-coverage:
  stage: review
  image: node:20-alpine
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  before_script:
    - apk add --no-cache git
    - git remote set-url origin
        "https://oauth2:${GITLAB_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"
    - npm ci --silent --prefix .oas-agent
  script:
    - node .oas-agent/src/harness.js
  artifacts:
    when: always
    paths: [oas-check-report.json]
    expire_in: 30 days
  timeout: 30 minutes
```

---

## Configuration reference

### `manifests/oas-agent.yaml` — Agent definition

Registered once on the Anthropic platform. Controls model, system prompt, and enabled tools.

| Field | Description |
|---|---|
| `name` | Display name in Claude Console |
| `model` | Claude model identifier |
| `system_prompt` | Full instructions for the agent |
| `tools` | `bash`, `file_read`, `file_write`, `file_edit` |
| `mcp_servers` | Optional — GitLab MCP for posting MR comments |

### `manifests/environment.yaml` — Container spec

Picked up on each pipeline run. Change packages or network rules here without touching code.

| Field | Description |
|---|---|
| `container.image` | Base image (`anthropic/agent-runtime:latest`) |
| `container.packages` | Pre-installed runtimes: `nodejs`, `python3`, `golang`, `ripgrep` |
| `container.network_access` | `outbound: false` by default (air-gapped) |
| `mounts` | Repo mounted read-write at `/repo` |
| `resources` | `memory_mb`, `cpu_millicores` |
| `timeout_minutes` | Wall-clock session limit |

### `manifests/harness.yaml` — Operational config

Controls harness behaviour without touching `harness.js`.

| Field | Description |
|---|---|
| `retry` | Enable retry on transient API errors; `max_attempts`, backoff config |
| `logging.level` | `debug` / `info` / `warn` / `error` |
| `logging.log_tool_calls` | Stream tool call names to CI log |
| `artifact.write_transcript` | Write full session transcript alongside report |
| `observability.post_mr_comment` | Post formatted MR comment with path table |
| `git` | Author name/email for the auto-commit |

### `.oas-checker.yaml` — Per-repo project config _(lives in each microservice)_

Commits alongside your service code. Engineers configure their own OAS settings here.

| Field | Description |
|---|---|
| `scan.include` | Directories to scan (overrides `SRC_DIRS` CI variable) |
| `scan.exclude` | Glob patterns to skip (in addition to built-in exclusions) |
| `spec.path` | Path to `openapi.yaml` (overrides `OAS_PATH` CI variable) |
| `info` | OAS `info` block used when creating a spec from scratch |
| `servers` | Server URLs injected into a new spec |
| `generate.tag_strategy` | `resource` / `directory` / `file` |
| `generate.tag_overrides` | Explicit path → tag mappings |
| `generate.schema_hints` | Field name patterns → `$ref` targets |
| `generate.exclude_routes` | Routes to exclude from OAS entirely |
| `validate.fail_on_uncovered` | Fail pipeline if agent can't generate coverage |
| `validate.min_coverage_percent` | Minimum coverage threshold (0 = disabled) |
| `commit.message` | Commit message template with `{count}`, `{paths}` placeholders |

---

## How it works — data flow

```
Developer opens MR
       │
       ▼
GitLab triggers pipeline (merge_request_event)
       │
       ▼
harness.js
  ├─ POST /v1/environments   mount repo at /repo, provision Node+Python+Go+ripgrep
  ├─ POST /v1/sessions       start agent with task prompt
  └─ GET  /v1/sessions/stream  observe SSE events until session.status=completed
       │
       ▼
Claude Managed Agent (inside cloud container)
  ├─ bash: find /repo, skip test/vendor files
  ├─ file_read: source files → extract routes (all frameworks, all languages)
  ├─ file_read: openapi.yaml → parse existing paths
  ├─ diff: find paths/methods with no OAS entry
  ├─ file_read: handler files for missing routes
  ├─ generate: full OAS 3.1 path items (operationId, tags, params, requestBody, responses)
  ├─ merge: sort alphabetically, preserve existing entries
  └─ file_write: /repo/openapi.yaml (patched)
       │
       ▼
harness.js
  ├─ parse JSON report from final agent output
  ├─ git add / commit / push (if generated.length > 0)
  ├─ DELETE /v1/environments (stop billing)
  └─ write oas-check-report.json artifact
       │
       ▼
GitLab: pipeline status + artifact on MR
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for a component overview, or [`docs/DESIGN.md`](docs/DESIGN.md) for the full technical design with Mermaid sequence diagrams and state machines.

---

## CI artifact

`oas-check-report.json` is uploaded on every run:

```json
{
  "success": true,
  "routesFound": 14,
  "missing": ["POST /orders", "DELETE /orders/{id}", "GET /orders/{id}/status"],
  "generated": ["/orders", "/orders/{id}", "/orders/{id}/status"],
  "oasPath": "openapi.yaml",
  "sessionId": "ses_01ABCxyz...",
  "message": "Added 3 missing path(s) to openapi.yaml"
}
```

---

## Pricing

| Item | Rate | Typical MR |
|---|---|---|
| Claude Sonnet tokens | Standard API pricing | ~50K–150K tokens |
| Active session runtime | $0.08 / session-hour | 3–8 min → $0.004–$0.011 |
| Idle time (tool execution) | Free | Not billed |
| **Total per MR** | | **~$0.01–$0.05** |

---

## Updating the agent

Edit `manifests/oas-agent.yaml`, re-run `npm run register`, update `OAS_AGENT_ID` in CI variables. Old sessions continue against their registered version — no disruption to active pipelines.

---

## Testing

The test suite uses Node.js's built-in test runner — no extra dependencies.

```bash
npm test              # all 112 tests across 4 suites
npm run test:unit     # detect-spec, manifest, register-agent (offline, fast)
npm run test:spec     # example OAS file validation
npm run test:integration  # harness prompt/report logic
npm run test:watch    # re-run on file change (development)
```

### What is tested

| Suite | File | Tests | What it covers |
|---|---|---|---|
| **detect-spec** | `test/detect-spec.test.js` | 21 | Format sniffing from YAML/JSON headers, auto-discovery priority, `.oas-checker.yaml` overrides, malformed config handling, `SpecContext` shape |
| **manifest** | `test/manifest.test.js` | 22 | `resolveAgentId` all 8 resolution cases, `updateManifest` write + history accumulation, `manifest.yaml` structure validation, version sync with `package.json` |
| **register-agent** | `test/register-agent.test.js` | 20 | `oas-agent.yaml` required fields, system prompt content, registration flow with history, version sync, CHANGELOG entry check |
| **examples** | `test/examples.test.js` | 35 | OAS 3.1 structure (operationIds, tags, `$ref` validity, response code quoting), Swagger 2.0 structure (definitions, body params, integer codes, `host`/`basePath`), cross-spec parity |
| **integration** | `test/harness.integration.test.js` | 12 | Task prompt content per format, report JSON parsing, artifact shape, GitLab CI YAML structure |

### Test architecture

The harness (`src/harness.js`) makes real Managed Agents API calls and cannot be imported cleanly in tests. The solution is extraction — `test/helpers/prompt-builder.js` and `test/helpers/report-parser.js` contain the pure logic from the harness as standalone modules that can be tested without any SDK or network dependency.

```
test/
├── detect-spec.test.js       Unit — real temp filesystem
├── manifest.test.js          Unit — real temp filesystem
├── register-agent.test.js    Unit — inline replica of register logic
├── examples.test.js          Structural — validates example YAML files
├── harness.integration.test.js  Integration — tests extracted pure functions
├── helpers/
│   ├── prompt-builder.js     Extracted buildTaskPrompt() → testable
│   └── report-parser.js      Extracted parseReport() + buildArtifact() → testable
└── fixtures/
    ├── swagger2-repo/        swagger.yaml with swagger: "2.0"
    ├── oas30-repo/           openapi.yaml with openapi: "3.0.3"
    ├── oas31-repo/           openapi.yaml with openapi: "3.1.0"
    ├── checker-repo/         .oas-checker.yaml + api/swagger.yaml
    └── empty-repo/           (no spec file — tests isNew=true path)
```

---

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE) © [khangtoh](https://github.com/khangtoh)
