# AGENTS.md

Project-level instructions for any coding agent working in this repository.
This file is the canonical source for rules that apply regardless of which agent is used.
Agent-specific files (`CLAUDE.md`, etc.) augment these rules with tool-specific details.

## Project overview

This is a GitLab CI AI agent that audits microservice repos for OpenAPI Specification (OAS)
coverage. See `docs/DESIGN.md` for the full architecture and data flow.

## Key commands

```bash
npm run lint      # syntax check JS + validate YAML manifests
npm test          # run all 112 tests
npm run register  # one-time agent registration (requires ANTHROPIC_API_KEY)
```

## Architecture rule

Keep `src/harness.js` thin — no AI logic, only Managed Agents lifecycle calls.
Intelligence lives in `manifests/oas-agent.yaml` (system prompt + tools).

## PR Lifecycle

**Rule:** After creating any pull request, immediately subscribe to its activity to monitor
review comments, CI results, and replies. Respond to actionable events without waiting for
the user to re-prompt.

**Claude Code:** Call `subscribe_pr_activity` with the PR number immediately after
`mcp__github__create_pull_request` succeeds. (A `.claude/settings.json` hook reinforces
this by injecting a mandatory reminder.) Handle incoming `<github-webhook-activity>` events:
- Review comments — investigate; fix and push if clear; use `AskUserQuestion` if ambiguous or architecturally significant
- CI failures — investigate and fix if tractable, then push; surface to user if root cause is unclear
- Duplicate / no-action events — state so and skip

**Codex and other agents:** No equivalent webhook subscription tool is available. Ask the
user to notify you of new PR activity, or re-check the PR explicitly when requested.
