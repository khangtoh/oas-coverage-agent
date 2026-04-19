# T-002: Add local Claude Managed Agents handshake command

| Field | Value |
|-------|-------|
| **ID** | T-002 |
| **Status** | Open |
| **Target version** | 2.3.0 |
| **Related decisions** | `none` |
| **Assignee** | unassigned |
| **Validation required** | `npm run lint`, `npm test` |

## Problem

The repository validates Managed Agents configuration indirectly through manifest
parsing, prompt tests, and harness-focused integration tests, but it does not
provide a simple developer command that proves the configured Claude Managed
Agent can start a real session and complete a bounded agentic task.

This leaves a gap between static validation and operational validation. A broken
agent definition, manifest mismatch, or session startup issue may only be found
at runtime in CI or during ad hoc manual testing.

## Proposed Solution

Add a local developer command:

`npm run handshake:claude-ma`

The command should execute a real Claude Managed Agents session using the repo's
configured agent and a small, deterministic handshake task. The handshake is the
"hello world" for managed-agent execution in this repository.

The handshake task should:

- start a real managed-agent session
- read `package.json` and `manifest.yaml`
- return only JSON
- report the repository name
- report the package version and manifest version
- report whether the two versions match
- make no repository file changes

The command should parse and validate the returned JSON, then print a clear
success or failure result for the developer.

## Acceptance Criteria

- [ ] `package.json` includes a developer command named `handshake:claude-ma`
- [ ] The command starts a real Claude Managed Agents session using repo configuration
- [ ] The handshake task reads `package.json` and `manifest.yaml`
- [ ] The handshake task returns only structured JSON
- [ ] The command validates the JSON shape and fails clearly on malformed output
- [ ] The command reports whether `package.json` version and `manifest.yaml` version match
- [ ] The command does not modify repository files
- [ ] The README or contributor docs explain required environment variables and expected output

## Out of Scope

- Full OAS coverage generation or patching
- GitLab CI integration for the handshake command
- Broad end-to-end validation of the complete audit workflow
- Temporal orchestration, scheduling, or fan-out behavior
