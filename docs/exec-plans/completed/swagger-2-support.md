# Swagger 2.0 Backwards Compatibility + detect-spec

| Field | Value |
|-------|-------|
| **Status** | Done |
| **Version** | 2.1.0 |
| **Completed** | 2026-04-01 |
| **Related decisions** | none |

## What Was Done

Added auto-detection of OpenAPI spec format (Swagger 2.0, OAS 3.0, OAS 3.1) before the session starts. The detected format is injected into the task prompt so the agent uses the correct structure for the target spec without needing separate agent registrations per format.

Added `src/detect-spec.js`:
- Reads the spec file header to sniff `swagger: "2.0"`, `openapi: "3.0.x"`, or `openapi: "3.1.x"`
- Resolves `.oas-checker.yaml` per-repo config (scan dirs, spec path overrides, schema hints)
- Returns a `SpecContext` object consumed by `buildTaskPrompt()` and `createEnvironment()`

Added format-specific `FORMAT_INSTRUCTIONS` in `harness.js` covering:
- Swagger 2.0: `definitions`, integer response codes, body parameters, `x-nullable`
- OAS 3.0: `components/schemas`, quoted response codes, `nullable: true`
- OAS 3.1: full JSON Schema 2020-12, `type: [string, "null"]`

Added scaffold generation (`SCAFFOLD_INSTRUCTIONS`) for repos with no existing spec.

## Key Files Changed

- `src/detect-spec.js` — new
- `src/harness.js` — format-specific prompt injection, scaffold instructions
- `test/detect-spec.test.js` — 21 new unit tests
- `test/examples.test.js` — Swagger 2.0 structural tests added
- `test/fixtures/swagger2-repo/` — new fixture
- `examples/` — Swagger 2.0 example added alongside existing OAS 3.1 example
