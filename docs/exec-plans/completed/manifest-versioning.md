# Manifest-Based Version Tracking

| Field | Value |
|-------|-------|
| **Status** | Done |
| **Version** | 2.2.0 |
| **Completed** | 2026-04-10 |
| **Related decisions** | none |

## What Was Done

Established `manifest.yaml` as the single source of truth for the currently deployed agent ID and registration history. Introduced `resolveAgentId()` in `harness.js` to implement a two-level resolution strategy:

1. **`manifest.yaml` `agent.current.id`** — standard path; always reflects the version of the tool that is actually running (resolved relative to `harness.js`, not the consumer repo).
2. **`OAS_AGENT_ID` env var** — explicit override for advanced use cases; triggers a warning if it differs from the manifest.

Added version sync enforcement: `manifest.yaml` version must match `package.json` version. Validated in `test/manifest.test.js` and `test/register-agent.test.js`.

`register-agent.js` now:
- Appends an entry to `manifest.yaml` history on every registration (append-only, never overwrites history)
- Updates `agent.current` to the new ID
- Validates version sync before registering

## Key Files Changed

- `manifest.yaml` — new: deployment state file (agent ID + history)
- `src/register-agent.js` — history tracking, version sync check
- `src/harness.js` — `resolveAgentId()` with two-level priority
- `test/manifest.test.js` — 22 new unit tests
- `CLAUDE.md` — manifest versioning guidance added
