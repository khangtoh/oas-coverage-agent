# Task: Migrate CI Integration to Docker Image

## Problem

The current `include: project:` approach has several issues:

1. **Broken assumption** — `include: project:` in GitLab CI only fetches the referenced YAML file; it does _not_ clone the project into `.oas-agent/`. The comment on line 38 of `.gitlab/oas-coverage.yml` ("cloned by GitLab") is incorrect. As written, `npm ci --prefix .oas-agent` would fail because `.oas-agent/` does not exist.

2. **Runtime dependency fetching** — `npm ci` runs on every MR pipeline, adding latency and a network dependency to npm at job time.

3. **Leaky base image** — the job uses `node:20-alpine` and manually installs `git` via `apk`, which is fragile and slow.

4. **Split version pinning** — the `include: ref:` and the `OAS_TOOL_REF` variable must be kept in sync manually; they can drift.

## Proposed Solution

Package the harness and all dependencies into a versioned Docker image published alongside each release. Consumer repos reference the image tag instead of cloning source.

### Consumer CI (after)

```yaml
include:
  - project: 'your-org/oas-coverage-agent'
    ref: v2.2.0
    file: '.gitlab/oas-coverage.yml'
```

```yaml
# .gitlab/oas-coverage.yml (new shape)
oas-coverage:
  stage: review
  image: registry.gitlab.com/your-org/oas-coverage-agent:v2.2.0
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  before_script:
    - git config user.email "ci-oas-bot@gitlab.com"
    - git config user.name "OAS Agent Bot"
    - git remote set-url origin
        "https://oauth2:${GITLAB_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"
  script:
    - node /app/src/harness.js
  artifacts:
    when: always
    paths:
      - oas-check-report.json
    expose_as: "OAS Coverage Report"
    expire_in: 30 days
  timeout: 30 minutes
```

### Dockerfile (to add)

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
COPY manifest.yaml ./
```

The image is built and pushed to the GitLab Container Registry as part of the release pipeline, tagged with the version (e.g. `v2.2.0`) and `latest`.

## Acceptance Criteria

- [ ] `Dockerfile` added at repo root; image builds cleanly
- [ ] Release pipeline (`.gitlab-ci.yml`) builds and pushes the image on version tags
- [ ] `.gitlab/oas-coverage.yml` updated to use `image:` instead of `before_script: npm ci`
- [ ] Explicit `git clone` step removed (no longer needed)
- [ ] `OAS_TOOL_REF` variable removed — version comes from the image tag alone
- [ ] `README.md` and `CONTRIBUTING.md` updated with new consumer setup instructions
- [ ] Existing integration tests still pass (`npm run test:integration`)

## Out of Scope

- Migrating to GitLab CI/CD Components (separate task — evaluate after Docker image is stable)
- Multi-arch image builds (linux/amd64 is sufficient for GitLab SaaS runners)
