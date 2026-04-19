# T-002 Plan: Codex

## Goal

Implement `T-002` by breaking the handshake feature into five sequenced
sub-tasks that can be implemented and reviewed independently.

## Sub-task sequence

### 1. `t002-a-handshake-contract.md`

**Title:** Define handshake contract

**Purpose**

Define the bounded "hello world" handshake behavior for
`npm run handshake:claude-ma`.

This sub-task should lock down:

- the exact managed-agent task intent
- the read-only constraint
- the required JSON-only output
- the required result fields
- the success and failure contract for the command

**Expected tests**

- unit test for expected handshake JSON schema
- unit test rejecting malformed JSON
- unit test rejecting extra prose around the JSON payload
- integration or prompt-content test asserting the handshake prompt is read-only

### 2. `t002-b-handshake-command.md`

**Title:** Add handshake command entrypoint

**Purpose**

Add the local developer command and the entrypoint that validates local
prerequisites before starting a real managed-agent run.

This sub-task should cover:

- `package.json` script entry for `handshake:claude-ma`
- local command entrypoint implementation
- required environment variable checks
- clear startup failure messages

**Expected tests**

- unit test for missing `ANTHROPIC_API_KEY`
- unit test for missing agent/config prerequisites
- unit test asserting non-zero exit on missing prerequisites
- unit test asserting clear startup error output

### 3. `t002-c-managed-agent-session.md`

**Title:** Implement managed-agent handshake session

**Purpose**

Execute the real Claude Managed Agents lifecycle for the handshake task using
the repository's configured agent and runtime configuration.

This sub-task should cover:

- session startup
- stream handling until completion
- capture of the final agent result
- cleanup behavior on success and failure

**Expected tests**

- integration test with mocked Managed Agents lifecycle for successful session completion
- integration test for session creation failure
- integration test for stream failure or incomplete session
- integration test for cleanup behavior if cleanup is part of the flow
- manual validation step: run `npm run handshake:claude-ma` against a real configured agent before closing `T-002`

### 4. `t002-d-result-parsing-and-version-check.md`

**Title:** Parse handshake result and validate versions

**Purpose**

Parse the handshake result, validate its shape, compare the repo versions, and
emit a clear success or failure outcome.

This sub-task should cover:

- JSON extraction and validation
- reading `package.json` and `manifest.yaml` result fields from the handshake output
- comparing package version and manifest version
- implementing success and failure reporting from the contract defined in `t002-a`
- clear reporting of match or mismatch

**Expected tests**

- unit test for matching versions
- unit test for mismatched versions
- unit test for missing version fields
- unit test for invalid JSON shape
- integration test for successful parsed handshake output

### 5. `t002-e-handshake-docs.md`

**Title:** Document handshake command usage

**Purpose**

Document how a developer runs the handshake command and interprets the result.

This sub-task should cover:

- required environment variables
- command usage
- expected success output
- expected failure cases
- explicit statement that the handshake is read-only

**Expected tests**

- doc review only
- verify documented command name matches implementation
- verify documented environment variables match implementation

## Notes

- These sub-tasks are ordered and should generally be implemented in sequence.
- `T-002` remains the feature spec. This file is the implementation plan only.
- If sub-task specs are created, they should use the filenames listed above and
  include a `Parent task` field linking back to `T-002`.
