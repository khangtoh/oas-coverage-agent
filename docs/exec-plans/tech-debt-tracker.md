# Tech Debt Tracker

Known technical debt in OAS Coverage Agent. Each item has an impact assessment, effort estimate, and target version or status.

---

## Open Debt

| # | Item | Impact | Effort | Target |
|---|------|--------|--------|--------|
| D-001 | `include: project:` CI pattern doesn't actually clone the project | **High** — current setup is broken for consumers who don't do an explicit clone | Medium | v2.3.0 (T-001) |
| D-002 | `npm ci` at job time on every MR | Medium — adds 20-40s latency + npm network dependency per pipeline | Low (fixed by D-001) | v2.3.0 (T-001) |
| D-003 | `node:20-alpine` + `apk add git` in the job definition | Low — fragile, slow, leaks OS package management into consumer CI | Low (fixed by D-001) | v2.3.0 (T-001) |
| D-004 | `OAS_TOOL_REF` variable must be kept in sync with `include: ref:` manually | Low — version drift risk is latent, not immediate | Low (fixed by D-001) | v2.3.0 (T-001) |
| D-005 | No retry logic in `harness.js` itself — retry config exists in `harness.yaml` but isn't wired up | Medium — `manifests/harness.yaml` declares retry policy but `harness.js` doesn't read it; retries aren't implemented | High | Backlog |
| D-006 | `parseReport()` silently returns defaults on parse failure | Low — a malformed agent report produces a no-op rather than a visible error | Low | Backlog |
| D-007 | Git commit uses `execSync` with string interpolation for commit message | Low — potential shell injection if `OAS_COMMIT_MESSAGE` contains special characters | Medium | Backlog |

---

## Resolved Debt

| # | Item | Resolved In |
|---|------|-------------|
| — | DIY agent loop (manual chunking, orchestration, error recovery in harness) | v2.0.0 — replaced by Managed Agents |
| — | No Swagger 2.0 support | v2.1.0 — `detect-spec.js` added |
| — | Agent ID hardcoded in harness | v2.2.0 — manifest-based resolution with env var override |

---

## Notes

- Items D-001 through D-004 are all resolved by T-001 (Docker image packaging). They are tracked separately so the root causes are visible individually.
- D-005 is the highest-priority standalone item: the retry config in `harness.yaml` creates a false sense of reliability — the file is parsed but the retry logic is not implemented.
- D-007 should be addressed before any production deployment where `OAS_COMMIT_MESSAGE` can be set by untrusted input.
