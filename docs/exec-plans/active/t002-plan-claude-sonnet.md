# T-002 Implementation Plan — claude-sonnet

| Field | Value |
|-------|-------|
| **Parent task** | [T-002](./t-002-claude-ma-handshake-command.md) |
| **Planned by** | claude-sonnet |
| **Status** | Proposed |

## Sub-tasks

Implement in order. Each sub-task has its own tests that must pass before moving on.

---

### T-002-a: Handshake response schema and validator

**File:** `src/handshake-validator.js`

Define the JSON contract the agent must return and a pure validator function.

```js
// expected shape
{
  name:            string,   // repository name from package.json
  packageVersion:  string,   // version from package.json
  manifestVersion: string,   // version from manifest.yaml
  versionsMatch:   boolean   // packageVersion === manifestVersion
}
```

**Tests** (`test/handshake-validator.test.js`) — all offline, no API key needed:

| # | Test |
|---|------|
| 1 | valid response passes validation |
| 2 | missing `name` throws with field name in message |
| 3 | missing `packageVersion` throws with field name in message |
| 4 | missing `manifestVersion` throws with field name in message |
| 5 | missing `versionsMatch` throws with field name in message |
| 6 | non-boolean `versionsMatch` throws |
| 7 | non-string version fields throw |
| 8 | extra fields are allowed (non-strict) |
| 9 | `versionsMatch: true` when both versions are the same string |
| 10 | `versionsMatch: false` when versions differ |

---

### T-002-b: Handshake prompt builder

**File:** `test/helpers/handshake-prompt-builder.js`
(follows existing pattern: `test/helpers/prompt-builder.js`)

A pure function `buildHandshakePrompt()` that returns the task string sent to
the agent. Extracting it as a helper keeps the session runner thin and makes
the prompt constraints directly testable without an API call.

**Tests** (`test/handshake.prompt.test.js`) — all offline:

| # | Test |
|---|------|
| 1 | prompt instructs agent to read `package.json` |
| 2 | prompt instructs agent to read `manifest.yaml` |
| 3 | prompt instructs agent to return JSON only, no prose |
| 4 | prompt explicitly forbids writing or modifying files |
| 5 | prompt specifies all four required JSON fields by name |
| 6 | prompt is a non-empty string |

---

### T-002-c: JSON extraction from stream output

**File:** `src/handshake-extractor.js`

A pure function `extractHandshakeJson(text)` that finds and parses the JSON
object from the agent's raw stream output. The agent may emit prose around
the JSON block; the extractor must isolate it.

**Tests** (`test/handshake-extractor.test.js`) — all offline:

| # | Test |
|---|------|
| 1 | extracts JSON from clean output (JSON only, no surrounding text) |
| 2 | extracts JSON when agent wraps it in prose before and after |
| 3 | extracts JSON from a fenced code block (` ```json ... ``` `) |
| 4 | throws a clear error when no JSON object is found |
| 5 | throws a clear error when JSON is malformed (invalid syntax) |
| 6 | throws a clear error when output contains multiple top-level JSON objects |
| 7 | extracted value is a plain JS object, not a string |

---

### T-002-d: Session orchestration

**File:** `src/handshake.js`

The CLI entrypoint. Orchestrates the full flow:

```
resolveAgentId()
  → createEnvironment()
  → startSession(buildHandshakePrompt())
  → streamOutput()
  → extractHandshakeJson()
  → validateHandshakeResponse()
  → print result
  → deleteEnvironment()   ← must run even on failure
```

Uses the same mock-client pattern as `test/harness.integration.test.js` —
the Anthropic SDK client is monkey-patched before import so all tests are
fully offline.

**Tests** (`test/handshake.integration.test.js`) — offline, mock API client:

| # | Test |
|---|------|
| 1 | creates environment with correct managed-agents header |
| 2 | starts session with the handshake prompt (not the OAS audit prompt) |
| 3 | streams output and extracts JSON from agent response |
| 4 | validates extracted JSON shape; exits 0 on valid response |
| 5 | exits 1 with clear message when agent returns malformed JSON |
| 6 | exits 1 with clear message when agent returns wrong JSON shape |
| 7 | deletes environment on success |
| 8 | deletes environment even when JSON validation fails |
| 9 | deletes environment even when session throws |
| 10 | prints version-mismatch warning when `versionsMatch: false` |
| 11 | prints success confirmation when `versionsMatch: true` |
| 12 | resolves agent ID from `manifest.yaml` (no env override needed) |

---

### T-002-e: npm script and docs

**Files:** `package.json`, `CONTRIBUTING.md`

Wire the command and document it for contributors.

- Add `"handshake:claude-ma": "node src/handshake.js"` to `package.json` scripts
- Document required env vars (`ANTHROPIC_API_KEY`) and expected output in `CONTRIBUTING.md`

**Tests** (add to existing `test/register-agent.test.js` version-sync suite) — offline:

| # | Test |
|---|------|
| 1 | `package.json` contains a `handshake:claude-ma` script |
| 2 | script value points to `src/handshake.js` |
