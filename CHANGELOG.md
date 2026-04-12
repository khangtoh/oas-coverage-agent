# Changelog

All notable changes to `oas-coverage-agent` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.2.0] — 2026-04-10

### Added — Manifest-based version tracking

- `manifest.yaml` — single source of truth for deployment state. Tracks the
  registered agent ID, tool version, model, registration timestamp, git commit,
  and a full append-only history of past registrations. Committed and tagged
  with every release.
- `register-agent.js` now writes the agent ID back into `manifest.yaml` after
  a successful registration. It moves the previous `agent.current` entry to
  `agent.history` before writing the new one. Engineers commit `manifest.yaml`
  and tag the release — no manual copy of the agent ID needed.
- `harness.js` reads the agent ID from `manifest.yaml` at runtime (resolved
  relative to the tool file, not the consumer repo). `OAS_AGENT_ID` CI variable
  becomes an optional override. If both are present and differ, the harness
  logs a warning and uses the CI variable.
- `.gitlab/oas-coverage.yml` updated to document version-tag pinning
  (`ref: v2.1.0`) and remove `OAS_AGENT_ID` from required variables.

### Changed

- `register-agent.js` prints a post-registration checklist: commit the manifest,
  tag the release, push — rather than instructing engineers to copy a UUID
  into a CI variable.

---



### Added — Swagger 2.0 backwards compatibility

- `src/detect-spec.js` — new module that runs before the session starts and
  determines the spec format from the file's `swagger:`/`openapi:` header.
  Detection priority: `.oas-checker.yaml` explicit → `OAS_PATH` env var →
  auto-discovery (swagger.yaml/json, openapi.yaml/json) → default OAS 3.1.
- Auto-discovery of spec filenames — repos with `swagger.yaml`, `swagger/swagger.yaml`,
  or `api/swagger.json` are found without any CI variable configuration.
- `examples/swagger.yaml` — full Swagger 2.0 example (order-service, 9 paths,
  15 definitions) showing correct legacy syntax: `parameters[in=body]`,
  `definitions`, integer response codes, `x-nullable`.
- Format-specific task prompt injection — `harness.js` now passes the detected
  format and explicit structural rules to the agent at session start. The agent
  receives unambiguous instructions for whichever format it is targeting.
- `spec.oas_version` field in `.oas-checker.yaml` — explicit override for repos
  where auto-detection is insufficient (new services, non-standard filenames).

### Changed

- `src/harness.js` — calls `detectSpec()` before environment creation; passes
  `specCtx` through `createEnvironment`, `startSession`, `commitPatched`.
  `SPEC_FORMAT` and `SPEC_PATH` are now injected as container env vars.
- `manifests/oas-agent.yaml` — system prompt rewritten to be format-agnostic.
  Per-format structural rules are injected via the task prompt, not baked
  into the persistent agent definition. One agent ID handles all three formats.
- CI artifact `oas-check-report.json` now includes `specFormat` and `formatLabel`
  fields for dashboarding and debugging.

---



### Changed — Architecture

- **Replaced DIY agent loop with Claude Managed Agents.** The harness no longer
  implements batching, context chunking, route extraction, or OAS generation.
  All intelligence runs inside Anthropic's managed cloud container.
- **`harness.js` reduced from ~500 LOC to ~200 LOC.** It now makes exactly
  3 Managed Agents API calls: create environment, start session, stream events.
- **Prompt caching and context compaction** are now handled automatically by
  the platform — removed manual 60 KB batching logic.

### Added

- `manifests/environment.yaml` — extracted container spec from hardcoded
  `harness.js` values. Independently versioned and overridable per repo.
- `manifests/harness.yaml` — operational config for retry policy, logging,
  artifact paths, git identity, and optional MR comment posting.
- `examples/.oas-checker.yaml` — per-repo project config for scan directories,
  tag strategy, schema hints, exclusion rules, and coverage thresholds.
- `examples/openapi.yaml` — full OAS 3.1 example showing hand-authored vs
  agent-generated path items, with 14 reusable component schemas.
- `docs/DESIGN.md` — technical design document with 5 embedded Mermaid
  diagrams covering the full data flow, session state machine, agent internals,
  and API call sequence.
- `.github/workflows/ci.yml` — GitHub Actions CI for the tool repo (syntax
  check, YAML validation, OAS structure validation).
- `.gitlab/oas-coverage.yml` — shareable GitLab CI job definition, includable
  via GitLab's `include: project:` directive.

### Removed

- `extract-routes.js` — route extraction now runs inside the managed container
- `compare-oas.js` — OAS diffing now runs inside the managed container
- `generate-oas.js` — OAS generation now runs inside the managed container
- `patch-oas.js` — file patching now runs inside the managed container

---

## [1.0.0] — 2026-03-15

### Added — Initial release

- DIY harness with 5-module pipeline: extract → compare → generate → patch → commit
- Polyglot route extraction via Claude API (Express, Flask, FastAPI, Gin, Spring, Rails, etc.)
- Structural path matching with `{param}` normalisation
- Automatic `openapi.yaml` patching and git commit back to MR branch
- `oas-check-report.json` CI artifact
- Configurable via `SRC_DIRS`, `OAS_PATH` environment variables
