/**
 * harness.js — OAS Coverage Checker via Claude Managed Agents
 *
 * Supports Swagger 2.0, OpenAPI 3.0, and OpenAPI 3.1.
 * Spec format is auto-detected from the repo before the session starts
 * and injected into the task prompt so the agent uses the correct structure.
 */

import fs   from "fs";
import path from "path";
import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import { detectSpec } from "./detect-spec.js";
import yaml from "js-yaml";

// ── Config ────────────────────────────────────────────────────────────────────

const REPO_ROOT     = process.env.CI_PROJECT_DIR    ?? process.cwd();
const OAS_PATH      = process.env.OAS_PATH           ?? "";
const SRC_DIRS      = process.env.SRC_DIRS           ?? "src,app,lib,routes,api";
const BRANCH        = process.env.CI_COMMIT_REF_NAME ?? "main";
const REPORT_PATH   = path.join(REPO_ROOT, "oas-check-report.json");
const COMMIT_MSG    = process.env.OAS_COMMIT_MESSAGE ?? "chore(oas): update API spec coverage [skip ci]";
const BETA_HEADER   = "managed-agents-2026-04-01";

// Tool manifest — resolved relative to this file, regardless of which repo calls us
const TOOL_ROOT     = new URL("..", import.meta.url).pathname;
const MANIFEST_PATH = path.join(TOOL_ROOT, "manifest.yaml");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(emoji, msg) { console.log(`${emoji}  ${msg}`); }

function fail(msg, data = {}) {
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ success: false, error: msg, ...data }, null, 2));
  console.error(`\n❌  ${msg}`);
  process.exit(1);
}

function exec(cmd, opts = {}) {
  return execSync(cmd, { stdio: opts.silent ? "pipe" : "inherit", encoding: "utf8" });
}


// ── Resolve agent ID ──────────────────────────────────────────────────────────
//
// Priority:
//   1. OAS_AGENT_ID env var — explicit override (advanced use, CI variable)
//   2. manifest.yaml agent.current.id — standard path for version-pinned setups
//
// The manifest is resolved relative to this file, so it always points to the
// tool version that is actually running — not whatever is in the consumer repo.

function resolveAgentId() {
  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    manifest = null;
  }

  const manifestId      = manifest?.agent?.current?.id;
  const manifestVersion = manifest?.agent?.current?.tool_version ?? manifest?.version ?? "unknown";
  const envId           = process.env.OAS_AGENT_ID;

  if (!manifestId && !envId) {
    fail(
      "No agent ID found. Run `npm run register` to register the agent, " +
      "or set OAS_AGENT_ID as a CI variable."
    );
  }

  let warning = null;

  if (envId && manifestId && envId !== manifestId) {
    warning =
      `OAS_AGENT_ID (${envId}) does not match manifest.yaml (${manifestId}). ` +
      `Using OAS_AGENT_ID override. Run 'npm run register' if the manifest is stale.`;
  }

  const agentId     = envId ?? manifestId;
  const toolVersion = manifestVersion;

  return { agentId, toolVersion, manifestWarning: warning };
}

// ── Step 1: Detect spec format ────────────────────────────────────────────────

function resolveSpecContext() {
  const ctx = detectSpec(REPO_ROOT, OAS_PATH);
  log("📄", `Spec: ${ctx.specRelPath} (${ctx.formatLabel}${ctx.isNew ? " — will be created" : ""})`);
  const checkerDirs = ctx.checkerConfig?.scan?.include;
  if (checkerDirs?.length) log("📂", `Scan dirs from .oas-checker.yaml: ${checkerDirs.join(", ")}`);
  return ctx;
}

// ── Step 2: Create Environment ────────────────────────────────────────────────

async function createEnvironment(specCtx) {
  log("🏗 ", "Creating Managed Agent environment…");
  const scanDirs = specCtx.checkerConfig?.scan?.include?.join(",") || SRC_DIRS;

  const response = await client.beta.managedAgents.environments.create(
    {
      name: `oas-check-${process.env.CI_MERGE_REQUEST_IID ?? Date.now()}`,
      description: `OAS coverage check (${specCtx.formatLabel}) for MR !${process.env.CI_MERGE_REQUEST_IID}`,
      container: {
        image: "anthropic/agent-runtime:latest",
        packages: ["nodejs", "python3", "golang", "ripgrep"],
        network_access: { outbound: false },
      },
      mounts: [{ source_type: "local_path", source: REPO_ROOT, destination: "/repo", read_only: false }],
      env: { SPEC_PATH: specCtx.specRelPath, SPEC_FORMAT: specCtx.format, SRC_DIRS: scanDirs, REPO_ROOT: "/repo" },
    },
    { headers: { "anthropic-beta": BETA_HEADER } }
  );

  log("✅", `Environment created: ${response.id}`);
  return response.id;
}

// ── Step 3: Start Session ─────────────────────────────────────────────────────

async function startSession(environmentId, specCtx, agentId) {
  log("🚀", `Starting session (agent: ${agentId}, format: ${specCtx.formatLabel})…`);

  const response = await client.beta.managedAgents.sessions.create(
    {
      agent_id:       agentId,
      environment_id: environmentId,
      metadata: {
        gitlab_project:    process.env.CI_PROJECT_PATH,
        gitlab_mr_iid:     process.env.CI_MERGE_REQUEST_IID,
        gitlab_commit_sha: process.env.CI_COMMIT_SHA,
        pipeline_url:      process.env.CI_PIPELINE_URL,
        spec_format:       specCtx.format,
      },
      initial_event: { type: "user", content: buildTaskPrompt(specCtx) },
    },
    { headers: { "anthropic-beta": BETA_HEADER } }
  );

  log("✅", `Session started: ${response.id}`);
  return response.id;
}

// ── Step 4: Stream Events ─────────────────────────────────────────────────────

async function streamSession(sessionId) {
  log("📡", "Streaming session events…\n");
  let finalText = "", sessionState = "running";

  const stream = await client.beta.managedAgents.sessions.stream(
    sessionId, { headers: { "anthropic-beta": BETA_HEADER } }
  );

  for await (const event of stream) {
    switch (event.type) {
      case "session.status":
        sessionState = event.status;
        if (event.status === "completed") log("✅", "Session completed");
        if (event.status === "failed")    log("❌", `Session failed: ${event.error?.message}`);
        if (event.status === "timed_out") log("⏱ ", "Session timed out");
        break;
      case "message.text.delta":
        process.stdout.write(event.delta);
        finalText += event.delta;
        break;
      case "tool.use":
        log("🔧", `Tool: ${event.name}${event.input?.command ? ` → ${String(event.input.command).slice(0, 80)}` : ""}`);
        break;
      case "tool.result":
        if (event.is_error) log("⚠️ ", `Tool error: ${String(event.content).slice(0, 120)}`);
        break;
      case "session.checkpoint":
        log("💾", `Checkpoint: ${event.checkpoint_id}`);
        break;
    }
  }

  console.log("\n");
  if (sessionState !== "completed") fail(`Session ended in unexpected state: ${sessionState}`);
  return finalText;
}

// ── Step 5: Parse Report ──────────────────────────────────────────────────────

function parseReport(agentOutput) {
  const lines = agentOutput.trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{")) {
      try { return JSON.parse(line); } catch { /* keep searching */ }
    }
  }
  log("⚠️ ", "No JSON report found in agent output — using defaults");
  return { routesFound: 0, missing: [], generated: [] };
}

// ── Step 6: Commit Back ───────────────────────────────────────────────────────

function commitPatched(report, specCtx) {
  if (!report.generated?.length) { log("ℹ️ ", "No new paths generated — nothing to commit"); return; }

  const oasAbsPath = path.join(REPO_ROOT, specCtx.specRelPath);
  if (!fs.existsSync(oasAbsPath)) { log("⚠️ ", `Spec file not found at ${oasAbsPath} after agent run`); return; }

  log("💾", `Committing patched ${specCtx.specRelPath} to branch: ${BRANCH}`);

  const msgTemplate = specCtx.checkerConfig?.commit?.message || COMMIT_MSG;
  const commitMsg = msgTemplate
    .replace("{count}",  report.generated.length)
    .replace("{paths}",  report.generated.join(", "))
    .replace("{branch}", BRANCH);

  const authorName  = specCtx.checkerConfig?.commit?.author?.name  || "OAS Agent Bot";
  const authorEmail = specCtx.checkerConfig?.commit?.author?.email || "ci-oas-bot@gitlab.com";

  try {
    exec(`git -C "${REPO_ROOT}" config user.email "${authorEmail}"`, { silent: true });
    exec(`git -C "${REPO_ROOT}" config user.name  "${authorName}"`,  { silent: true });
    exec(`git -C "${REPO_ROOT}" add "${specCtx.specRelPath}"`,        { silent: true });

    const staged = execSync(`git -C "${REPO_ROOT}" diff --cached --name-only`, { stdio: "pipe", encoding: "utf8" }).trim();
    if (!staged) { log("ℹ️ ", "No file changes staged — spec already up to date"); return; }

    exec(`git -C "${REPO_ROOT}" commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { silent: true });
    exec(`git -C "${REPO_ROOT}" push origin HEAD:"${BRANCH}"`, { silent: true });
    log("🚀", "Committed and pushed successfully");
  } catch (err) {
    fail(`Git commit/push failed: ${err.message}`);
  }
}

// ── Step 7: Cleanup ───────────────────────────────────────────────────────────

async function terminateEnvironment(environmentId) {
  try {
    await client.beta.managedAgents.environments.terminate(environmentId, { headers: { "anthropic-beta": BETA_HEADER } });
    log("🧹", `Environment ${environmentId} terminated`);
  } catch (err) {
    log("⚠️ ", `Environment termination failed (will auto-expire): ${err.message}`);
  }
}

// ── Task Prompt ───────────────────────────────────────────────────────────────

function buildTaskPrompt(specCtx) {
  const mrCtx = process.env.CI_MERGE_REQUEST_IID
    ? `\nThis check is running for MR !${process.env.CI_MERGE_REQUEST_IID} on branch ${BRANCH}.`
    : "";

  const cfg            = specCtx.checkerConfig;
  const scanDirs       = cfg?.scan?.include?.join(", ") || SRC_DIRS;
  const excludeRoutes  = cfg?.generate?.exclude_routes ?? [];
  const schemaHints    = cfg?.generate?.schema_hints   ?? {};
  const commonHeaders  = cfg?.generate?.common_headers  ?? [];

  const excludeSection     = excludeRoutes.length ? `\nRoutes to EXCLUDE from documentation:\n${excludeRoutes.map(r => `  - ${r}`).join("\n")}` : "";
  const schemaHintSection  = Object.keys(schemaHints).length ? `\nSchema hints:\n${Object.entries(schemaHints).map(([k,v]) => `  ${k}: ${v}`).join("\n")}` : "";
  const headerSection      = commonHeaders.length ? `\nInject these headers as parameters in every generated operation:\n${JSON.stringify(commonHeaders, null, 2)}` : "";

  const formatInstructions   = FORMAT_INSTRUCTIONS[specCtx.format];
  const scaffoldInstructions = specCtx.isNew ? SCAFFOLD_INSTRUCTIONS[specCtx.format](cfg) : "";

  return `You are running inside a CI container. The microservice repository is mounted at /repo.${mrCtx}

═══════════════════════════════════════════════════════════
SPEC FORMAT: ${specCtx.formatLabel}
SPEC FILE:   /repo/${specCtx.specRelPath}${specCtx.isNew ? "  (DOES NOT EXIST — create it)" : ""}
═══════════════════════════════════════════════════════════

${formatInstructions}
${scaffoldInstructions}

YOUR TASK:

1. SCAN source files in: ${scanDirs}
   Skip: node_modules, __pycache__, .git, dist, build, vendor, target, .venv
   Skip test files: *.test.*, *.spec.*, *_test.*, test_*.*
${excludeSection}

2. EXTRACT every implemented HTTP route across ALL languages and frameworks.
   Normalise path params: :id → {id}, <int:pk> → {pk}

3. READ the spec at /repo/${specCtx.specRelPath}${specCtx.isNew ? " (create scaffold first)" : ""}

4. DIFF: find routes missing from the spec (absent path key OR absent HTTP method)

5. GENERATE entries for each missing route using ${specCtx.formatLabel} syntax (see rules above).
   - Read the handler source to infer types and behaviour
   - operationId: camelCase, globally unique
${schemaHintSection}
${headerSection}

6. MERGE generated entries into the spec. Sort paths alphabetically. Do not alter existing entries.

7. WRITE the updated spec back to /repo/${specCtx.specRelPath}

8. OUTPUT on your FINAL line (no fences, no other text):
   {"routesFound": <n>, "missing": ["METHOD /path",...], "generated": ["/path",...], "oasPath": "${specCtx.specRelPath}", "specFormat": "${specCtx.format}"}`.trim();
}

const FORMAT_INSTRUCTIONS = {
  swagger_2: `
SWAGGER 2.0 STRUCTURE — use these patterns exactly:

Top-level keys: swagger, info, host, basePath, schemes, consumes, produces, securityDefinitions, definitions, paths
  - definitions (NOT components/schemas)
  - securityDefinitions (NOT components/securitySchemes)
  - host: api.example.com  (no scheme, no trailing slash)
  - basePath: /v1

Operation structure:
  /path/{id}:
    get:
      operationId: camelCaseId
      tags: [Tag]
      parameters:
        - name: id
          in: path
          required: true
          type: string          # type directly on param — NO nested schema:
      responses:
        200:                    # INTEGER key — NOT quoted "200"
          description: Success
          schema:               # NOT content: → application/json:
            $ref: '#/definitions/MySchema'

Request body — body parameter (NOT requestBody):
  - name: body
    in: body
    required: true
    schema:
      $ref: '#/definitions/CreateRequest'

Nullable: x-nullable: true  (NOT type: [string, null], NOT nullable: true)
$ref prefix: #/definitions/  (NOT #/components/schemas/)
`,

  openapi_30: `
OPENAPI 3.0 STRUCTURE — use these patterns exactly:

Top-level keys: openapi, info, servers, components, paths
  - components/schemas (NOT definitions)
  - components/securitySchemes

Operation structure:
  /path/{id}:
    get:
      operationId: camelCaseId
      tags: [Tag]
      parameters:
        - name: id
          in: path
          required: true
          schema:               # schema: nested inside parameter
            type: string
      responses:
        '200':                  # QUOTED STRING key
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MySchema'

Request body:
  requestBody:
    required: true
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/CreateRequest'

Nullable: nullable: true  (NOT type: [string, null])
$ref prefix: #/components/schemas/
`,

  openapi_31: `
OPENAPI 3.1 STRUCTURE — use these patterns exactly:

Top-level keys: openapi, info, servers, components, paths
  - components/schemas (NOT definitions)

Operation structure:
  /path/{id}:
    get:
      operationId: camelCaseId
      tags: [Tag]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':                  # QUOTED STRING key
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MySchema'

Request body:
  requestBody:
    required: true
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/CreateRequest'

Nullable: type: [string, "null"]  (full JSON Schema 2020-12 — NOT nullable: true)
$ref prefix: #/components/schemas/
`,
};

function buildScaffold(format, cfg) {
  const title   = cfg?.info?.title   ?? "Service API";
  const version = cfg?.info?.version ?? "1.0.0";
  const serverUrl = cfg?.servers?.[0]?.url ?? "";
  if (format === "swagger_2") {
    const hostRaw = serverUrl.replace(/^https?:\/\//, "").split("/")[0] || "api.example.com";
    const basePath = "/" + (serverUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "") || "v1");
    return `\nSCAFFOLD (new Swagger 2.0 file):\n  swagger: "2.0"\n  info:\n    title: "${title}"\n    version: "${version}"\n  host: "${hostRaw}"\n  basePath: "${basePath}"\n  schemes: [https]\n  consumes: [application/json]\n  produces: [application/json]\n  paths: {}\n  definitions: {}`;
  }
  const url = serverUrl || "https://api.example.com/v1";
  const oas = format === "openapi_30" ? "3.0.3" : "3.1.0";
  return `\nSCAFFOLD (new ${format === "openapi_30" ? "OpenAPI 3.0" : "OpenAPI 3.1"} file):\n  openapi: "${oas}"\n  info:\n    title: "${title}"\n    version: "${version}"\n  servers:\n    - url: "${url}"\n  paths: {}\n  components:\n    schemas: {}`;
}
const SCAFFOLD_INSTRUCTIONS = {
  swagger_2:  (cfg) => buildScaffold("swagger_2",  cfg),
  openapi_30: (cfg) => buildScaffold("openapi_30", cfg),
  openapi_31: (cfg) => buildScaffold("openapi_31", cfg),
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log("🔍", "OAS Coverage Check — Managed Agent Harness");
  log("📁", `Repo: ${REPO_ROOT}`);

  if (!process.env.ANTHROPIC_API_KEY) fail("ANTHROPIC_API_KEY is not set.");

  // Resolve agent ID: manifest → OAS_AGENT_ID env var (override)
  const { agentId, toolVersion, manifestWarning } = resolveAgentId();
  if (manifestWarning) log("⚠️ ", manifestWarning);
  log("🤖", `Agent: ${agentId} (tool v${toolVersion})`);

  const specCtx = resolveSpecContext();

  let environmentId;
  try {
    environmentId     = await createEnvironment(specCtx);
    const sessionId   = await startSession(environmentId, specCtx, agentId);
    const agentOutput = await streamSession(sessionId);
    const report      = parseReport(agentOutput);

    log("📊", `Routes found: ${report.routesFound} | Missing: ${report.missing?.length ?? 0} | Generated: ${report.generated?.length ?? 0}`);
    commitPatched(report, specCtx);

    const artifact = {
      success: true, specFormat: specCtx.format, formatLabel: specCtx.formatLabel,
      routesFound: report.routesFound ?? 0, missing: report.missing ?? [],
      generated: report.generated ?? [], oasPath: specCtx.specRelPath, sessionId,
      message: report.generated?.length > 0
        ? `Added ${report.generated.length} missing path(s) to ${specCtx.specRelPath}`
        : `Coverage complete — no changes needed`,
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(artifact, null, 2));
    log("🎉", artifact.message);

  } finally {
    if (environmentId) await terminateEnvironment(environmentId);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
