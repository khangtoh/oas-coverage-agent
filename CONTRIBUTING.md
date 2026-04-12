# Contributing

## Development setup

```bash
git clone https://github.com/khangtoh/oas-coverage-agent.git
cd oas-coverage-agent
npm install
```

## Project structure

```
oas-coverage-agent/
├── src/
│   ├── harness.js          # CI entrypoint — Managed Agents lifecycle
│   └── register-agent.js   # One-time agent registration script
├── manifests/
│   ├── oas-agent.yaml      # Agent definition (model, system prompt, tools)
│   ├── environment.yaml    # Cloud container spec
│   └── harness.yaml        # Harness operational config
├── examples/
│   ├── openapi.yaml        # Example generated OAS (order-service)
│   └── .oas-checker.yaml   # Example per-repo project config
├── docs/
│   └── DESIGN.md           # Technical design doc with Mermaid diagrams
├── .github/
│   └── workflows/ci.yml    # CI for this repo (validate manifests + syntax)
└── .gitlab/
    └── oas-coverage.yml    # Shareable GitLab CI job definition
```

## Where things live

| Concern | File |
|---|---|
| Agent intelligence (prompt) | `manifests/oas-agent.yaml` → `system_prompt` |
| Container runtime | `manifests/environment.yaml` |
| Retry / logging / git config | `manifests/harness.yaml` |
| Per-repo scan rules & OAS metadata | `examples/.oas-checker.yaml` (copy to each repo) |
| Harness lifecycle code | `src/harness.js` |

## Making changes

**To change agent behaviour** (route extraction logic, OAS generation style,
report format): edit `system_prompt` in `manifests/oas-agent.yaml`, then
re-run `npm run register` and update `OAS_AGENT_ID` in CI variables.

**To change the container** (add a language runtime, adjust memory): edit
`manifests/environment.yaml`. The new spec is picked up on the next pipeline run.

**To change harness behaviour** (retry policy, logging, MR comments): edit
`manifests/harness.yaml`. No code change or re-registration needed.

**To change CI job definition**: edit `.gitlab/oas-coverage.yml`.

## Validation

```bash
# Syntax check
node --check src/harness.js src/register-agent.js

# Validate all manifests parse as valid YAML
npm run lint
```

## Pull requests

- Keep `src/harness.js` thin — no AI logic, only Managed Agents lifecycle calls
- Document manifest changes in `CHANGELOG.md`
- Update `docs/DESIGN.md` diagrams if the data flow changes
