# Agent Rules

Read these before making changes:

1. `AGENTS.md`
2. `CLAUDE.md`
3. the relevant task file in `docs/exec-plans/active/`
4. any ADR linked from that task

## Modes

- `auto` means the agent should perform or enforce the rule automatically.
- `ask` means the agent should prompt the user for approval before proceeding.
- `skip` means the agent should not perform or enforce the rule unless the user explicitly asks for it.

## Tactics

These rules are interpreted through three tactics:

- `auto` is the default execution tactic. Use it for baseline engineering discipline that should happen every time without creating review overhead.
- `ask` is the user-control tactic. Use it when an action changes scope, architecture, or shared process and should not proceed without explicit approval.
- `skip` is the restraint tactic. Use it for optional work that may be helpful but should stay off by default unless the user requests it.

## Rules

- Rule: `task_required`
  Mode: `auto`
  Instruction: Every code change must map to a task in `docs/exec-plans/active/`.

- Rule: `task_assignment_required`
  Mode: `auto`
  Instruction: Do not start implementation until the task names an assignee.

- Rule: `write_scope_declared`
  Mode: `skip`
  Instruction: Declare a write scope when the task would benefit from explicit file or directory boundaries.

- Rule: `write_scope_expansion`
  Mode: `skip`
  Instruction: Do not expand an explicitly declared write scope unless the user explicitly asks for it.

- Rule: `shared_contract_update`
  Mode: `ask`
  Instruction: Prompt the user before changing shared process or governance files such as `AGENTS.md`, `CLAUDE.md`, `docs/exec-plans/README.md`, or `docs/decisions/README.md`.

- Rule: `architecture_change_without_decision`
  Mode: `ask`
  Instruction: Prompt the user before making an architectural change that is not already covered by the current task or a linked ADR.

- Rule: `broader_validation`
  Mode: `skip`
  Instruction: Do not run validation beyond the task's declared minimum unless the user explicitly asks for it.

- Rule: `extra_documentation_updates`
  Mode: `skip`
  Instruction: Do not update non-essential documentation beyond what the task requires unless the user explicitly asks for it.

- Rule: `secondary_reviewer`
  Mode: `skip`
  Instruction: Do not request an additional reviewer beyond the normal single-agent review unless the user explicitly asks for it.

- Rule: `followup_task_creation`
  Mode: `skip`
  Instruction: Do not create extra follow-up tasks for optional improvements unless the user explicitly asks for it.

- Rule: `expanded_refactor_cleanup`
  Mode: `skip`
  Instruction: Do not perform opportunistic cleanup or refactoring outside the task's core scope unless the user explicitly asks for it.

- Rule: `design_doc_expansion`
  Mode: `skip`
  Instruction: Do not add or expand long-form design documentation beyond what the task requires unless the user explicitly asks for it.

- Rule: `dedicated_worktree`
  Mode: `auto`
  Instruction: Always use a dedicated worktree.

- Rule: `branch_required`
  Mode: `auto`
  Instruction: Always work on a branch.

- Rule: `pr_required`
  Mode: `auto`
  Instruction: Open a PR/MR; do not commit directly to `main`.

- Rule: `peer_review_required`
  Mode: `auto`
  Instruction: Ask another agent to review before merge approval.

- Rule: `validation_required`
  Mode: `auto`
  Instruction: Run the validation required by the task before requesting review.

- Rule: `handoff_required`
  Mode: `auto`
  Instruction: If you stop mid-task, leave a short handoff note in the task, PR/MR, or user-facing status update with current state, blockers, and next step.
