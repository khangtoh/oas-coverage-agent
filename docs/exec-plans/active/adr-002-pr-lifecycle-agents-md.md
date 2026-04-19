# T-002: PR Lifecycle Rule + AGENTS.md cross-vendor layer

| Field | Value |
|-------|-------|
| **ID** | T-002 |
| **Status** | In Progress |
| **Target version** | 2.3.0 |
| **Related decisions** | [ADR-002: Engineering Doc Structure](../../decisions/adr-002-doc-structure.md) — governs root-level doc files; initial AGENTS.md rejection corrected by this task |

## Problem

The PR subscription rule ("subscribe to PR activity immediately after creating a PR") existed only in `CLAUDE.md` and `.claude/settings.json`, making it invisible to non-Claude agents. The project uses a multi-agent workflow (Claude Code for interactive dev, Codex or other agents for automated tasks) and any agent that creates a PR but doesn't subscribe will miss review comments and CI failures.

Additionally, ADR-002 had rejected `AGENTS.md` based on two factual errors:
1. That creating `AGENTS.md` would rename or replace `CLAUDE.md` — it does not.
2. That `AGENTS.md` would "break the Claude Code toolchain" — Claude Code reads `AGENTS.md` as a fallback/supplement alongside `CLAUDE.md`.

`AGENTS.md` is now the cross-vendor open standard backed by the Agentic AI Foundation (Linux Foundation initiative, co-founded by Anthropic, OpenAI, and Block — Dec 2025), read natively by Claude Code, Codex, Windsurf, Devin, Cursor, Gemini CLI, and ~60,000 open-source projects.

## Proposed Solution

Three-layer approach:

| Layer | File | Role |
|-------|------|------|
| Cross-vendor rule | `AGENTS.md` | Canonical PR Lifecycle rule in agent-agnostic language; implementation notes per agent type |
| Claude Code augmentation | `CLAUDE.md` § PR Workflow Rules | Reference to `AGENTS.md` + Claude-specific detail (hook, event handling) |
| Machine enforcement | `.claude/settings.json` PostToolUse hook | Injects mandatory reminder after `mcp__github__create_pull_request` |

ADR-002 is corrected in the same PR: AGENTS.md moves from "Not Adopted" to "Adopted" with the correct rationale.

## Acceptance Criteria

- [x] `AGENTS.md` exists at root with a `## PR Lifecycle` section covering all agent types
- [x] `CLAUDE.md` § PR Workflow Rules references `AGENTS.md` as canonical; adds only Claude-specific detail
- [x] `.claude/settings.json` PostToolUse hook fires after `mcp__github__create_pull_request` and injects PR number reminder
- [x] ADR-002 "Not Adopted" table updated: AGENTS.md moved to "Adopted" with corrected rationale
- [x] ADR-002 Consequences and Related Tasks updated
- [x] This exec plan linked in `docs/exec-plans/README.md` Active table

## Out of Scope

- Enforcing subscription for agents other than Claude Code (no equivalent tooling exists)
- Modifying the Codex/Windsurf workflow — `AGENTS.md` documents what those agents should do manually
