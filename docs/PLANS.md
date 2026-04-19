# Plans

High-level roadmap for OAS Coverage Agent. For detailed implementation specs, see the active tasks in [`docs/exec-plans/active/`](exec-plans/active/).

---

## In Flight

### v2.3.0 — Docker Image Packaging
**Goal:** Eliminate the brittle `include: project:` + `npm ci` pattern. Package the harness into a versioned Docker image so consumer repos reference an image tag rather than cloning source.

**Status:** Open — see [`docs/exec-plans/active/t-001-ci-docker-integration.md`](exec-plans/active/t-001-ci-docker-integration.md)

**Why:** The current `include: project:` approach doesn't actually clone the project (GitLab only fetches the referenced YAML). Consumers need `npm ci` at job time, which adds latency and an npm network dependency. Moving to a Docker image fixes all of this and makes version pinning trivial.

---

## Upcoming

### v3.0.0 — Temporal Workflow Orchestration
**Goal:** Replace the single-pass harness with a durable Temporal workflow so the audit pipeline can handle fan-out (multiple repos), scheduled runs, retry-as-first-class, and long-running jobs.

**Decision:** [ADR-001 — Temporal for workflow orchestration](decisions/adr-001-temporal.md) (Adopted)

**Scope (planned):**
- `src/worker.js` — Temporal worker entry point
- Harness steps become Activities (environment create, session start, stream, commit, cleanup)
- Audit pipeline becomes a Workflow
- Local Temporal server required for development

---

## Completed

| Version | Feature | Date |
|---------|---------|------|
| v2.2.0 | Manifest-based version tracking | 2026-04-10 |
| v2.1.0 | Swagger 2.0 backwards compatibility + `detect-spec` | 2026-04-01 |
| v2.0.0 | Rewrite: replace DIY harness loop with Claude Managed Agents | 2026-03-20 |
| v1.0.0 | Initial release | 2026-03-15 |

---

## Not Planned

- **GitLab CI/CD Components migration** — evaluate after Docker image is stable (out of scope for v2.3)
- **Multi-arch Docker builds** — `linux/amd64` is sufficient for GitLab SaaS runners
- **Support for non-GitLab CI** — GitHub Actions, CircleCI, etc. would require a separate harness adapter; not in scope
