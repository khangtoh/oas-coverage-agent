/**
 * test/manifest.test.js
 *
 * Tests for manifest.yaml read (resolveAgentId) and write (register-agent).
 * Uses Node.js built-in test runner.
 *
 * Run:  node --test test/manifest.test.js
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";
import yaml  from "js-yaml";

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "manifest-test-"));
}

function writeManifest(dir, data) {
  const p = path.join(dir, "manifest.yaml");
  fs.writeFileSync(p, yaml.dump(data, { indent: 2 }));
  return p;
}

function readManifest(dir) {
  return yaml.load(fs.readFileSync(path.join(dir, "manifest.yaml"), "utf8"));
}

/**
 * Inline replica of harness.js resolveAgentId() for unit testing.
 * We test the logic directly without importing the full harness
 * (which has top-level side effects like process.env reads).
 */
function resolveAgentId(manifestPath, envOverride) {
  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = null;
  }

  const manifestId      = manifest?.agent?.current?.id;
  const manifestVersion = manifest?.agent?.current?.tool_version ?? manifest?.version ?? "unknown";
  const envId           = envOverride ?? null;

  if (!manifestId && !envId) {
    throw new Error("No agent ID found. Run `npm run register`.");
  }

  let warning = null;
  if (envId && manifestId && envId !== manifestId) {
    warning = `OAS_AGENT_ID (${envId}) does not match manifest.yaml (${manifestId}).`;
  }

  return { agentId: envId ?? manifestId, toolVersion: manifestVersion, warning };
}

/**
 * Inline replica of register-agent.js updateManifest() write logic.
 */
function updateManifest(manifestPath, agentId, toolVersion, model) {
  const manifest = yaml.load(fs.readFileSync(manifestPath, "utf8"));

  if (manifest.agent.current?.id) {
    manifest.agent.history = manifest.agent.history ?? [];
    manifest.agent.history.unshift({
      ...manifest.agent.current,
      retired_at: new Date().toISOString(),
      retired_by: "test-runner",
    });
  }

  manifest.agent.current = {
    id:            agentId,
    tool_version:  toolVersion,
    model,
    registered_at: new Date().toISOString(),
    registered_by: "test-runner",
    commit:        "abc1234",
  };

  fs.writeFileSync(manifestPath, yaml.dump(manifest, { indent: 2 }));
}

// ── Base manifest template ────────────────────────────────────────────────────

const BASE_MANIFEST = {
  name:           "oas-coverage-agent",
  version:        "2.2.0",
  schema_version: 1,
  agent: {
    current: { id: "", tool_version: "2.2.0", model: "claude-sonnet-4-20250514", registered_at: "", registered_by: "" },
    history: [],
  },
  compatibility: {
    managed_agents_beta: "managed-agents-2026-04-01",
    node_min: "20",
    spec_formats: ["swagger_2", "openapi_30", "openapi_31"],
  },
  release: { date: "2026-04-10", tag: "v2.2.0" },
};

// ── resolveAgentId tests ──────────────────────────────────────────────────────

describe("resolveAgentId — agent ID resolution", () => {

  test("resolves from manifest when env override absent", () => {
    const dir = tmpDir();
    const m = structuredClone(BASE_MANIFEST);
    m.agent.current.id = "agt_from_manifest";
    const mp = writeManifest(dir, m);

    const result = resolveAgentId(mp, null);
    assert.equal(result.agentId, "agt_from_manifest");
    assert.equal(result.warning, null);
  });

  test("env override wins over manifest", () => {
    const dir = tmpDir();
    const m = structuredClone(BASE_MANIFEST);
    m.agent.current.id = "agt_from_manifest";
    const mp = writeManifest(dir, m);

    const result = resolveAgentId(mp, "agt_env_override");
    assert.equal(result.agentId, "agt_env_override");
  });

  test("warns when env and manifest IDs differ", () => {
    const dir = tmpDir();
    const m = structuredClone(BASE_MANIFEST);
    m.agent.current.id = "agt_manifest_id";
    const mp = writeManifest(dir, m);

    const result = resolveAgentId(mp, "agt_different_env");
    assert.ok(result.warning, "should produce a warning");
    assert.ok(result.warning.includes("agt_different_env"));
    assert.ok(result.warning.includes("agt_manifest_id"));
  });

  test("no warning when env and manifest IDs match", () => {
    const dir = tmpDir();
    const m = structuredClone(BASE_MANIFEST);
    m.agent.current.id = "agt_same";
    const mp = writeManifest(dir, m);

    const result = resolveAgentId(mp, "agt_same");
    assert.equal(result.warning, null);
  });

  test("env-only works when manifest has no ID", () => {
    const dir = tmpDir();
    const mp = writeManifest(dir, BASE_MANIFEST); // current.id is ""
    const result = resolveAgentId(mp, "agt_env_only");
    assert.equal(result.agentId, "agt_env_only");
  });

  test("throws when neither manifest nor env has an ID", () => {
    const dir = tmpDir();
    const mp = writeManifest(dir, BASE_MANIFEST); // current.id is ""
    assert.throws(() => resolveAgentId(mp, null), /No agent ID found/);
  });

  test("throws when manifest file is missing and no env override", () => {
    assert.throws(
      () => resolveAgentId("/nonexistent/manifest.yaml", null),
      /No agent ID found/
    );
  });

  test("env override works even when manifest file is missing", () => {
    const result = resolveAgentId("/nonexistent/manifest.yaml", "agt_fallback");
    assert.equal(result.agentId, "agt_fallback");
  });

  test("returns toolVersion from manifest", () => {
    const dir = tmpDir();
    const m = structuredClone(BASE_MANIFEST);
    m.agent.current.id = "agt_x";
    m.agent.current.tool_version = "2.2.0";
    const mp = writeManifest(dir, m);

    const result = resolveAgentId(mp, null);
    assert.equal(result.toolVersion, "2.2.0");
  });

  test("toolVersion falls back to manifest.version when current missing", () => {
    const dir = tmpDir();
    const m = structuredClone(BASE_MANIFEST);
    m.agent.current = null;
    const mp = writeManifest(dir, m);

    const result = resolveAgentId(mp, "agt_env");
    assert.equal(result.toolVersion, "2.2.0");
  });

});

// ── Manifest write / history tests ───────────────────────────────────────────

describe("updateManifest — registration write path", () => {

  test("writes agent ID to current", () => {
    const dir = tmpDir();
    writeManifest(dir, BASE_MANIFEST);
    updateManifest(path.join(dir, "manifest.yaml"), "agt_new", "2.2.0", "claude-sonnet-4-20250514");

    const m = readManifest(dir);
    assert.equal(m.agent.current.id, "agt_new");
  });

  test("moves previous current to history on re-registration", () => {
    const dir = tmpDir();
    const m1 = structuredClone(BASE_MANIFEST);
    m1.agent.current.id = "agt_old";
    writeManifest(dir, m1);

    updateManifest(path.join(dir, "manifest.yaml"), "agt_new", "2.2.0", "claude-sonnet-4-20250514");

    const m2 = readManifest(dir);
    assert.equal(m2.agent.current.id, "agt_new");
    assert.equal(m2.agent.history.length, 1);
    assert.equal(m2.agent.history[0].id, "agt_old");
  });

  test("history grows on each re-registration", () => {
    const dir = tmpDir();
    writeManifest(dir, BASE_MANIFEST);

    for (const [id, ver] of [["agt_1","2.0.0"],["agt_2","2.1.0"],["agt_3","2.2.0"]]) {
      updateManifest(path.join(dir, "manifest.yaml"), id, ver, "claude-sonnet");
    }

    const m = readManifest(dir);
    assert.equal(m.agent.current.id, "agt_3");
    assert.equal(m.agent.history.length, 2);
    assert.equal(m.agent.history[0].id, "agt_2"); // most recent retired first
    assert.equal(m.agent.history[1].id, "agt_1");
  });

  test("retired entry has retired_at timestamp", () => {
    const dir = tmpDir();
    const m1 = structuredClone(BASE_MANIFEST);
    m1.agent.current.id = "agt_old";
    writeManifest(dir, m1);

    updateManifest(path.join(dir, "manifest.yaml"), "agt_new", "2.2.0", "claude-sonnet");

    const m2 = readManifest(dir);
    assert.ok(m2.agent.history[0].retired_at, "retired_at should be set");
    assert.ok(!isNaN(Date.parse(m2.agent.history[0].retired_at)), "retired_at should be valid ISO date");
  });

  test("registered_at is set on new current", () => {
    const dir = tmpDir();
    writeManifest(dir, BASE_MANIFEST);
    updateManifest(path.join(dir, "manifest.yaml"), "agt_x", "2.2.0", "claude-sonnet");

    const m = readManifest(dir);
    assert.ok(m.agent.current.registered_at);
    assert.ok(!isNaN(Date.parse(m.agent.current.registered_at)));
  });

  test("manifest remains valid YAML after write", () => {
    const dir = tmpDir();
    writeManifest(dir, BASE_MANIFEST);
    updateManifest(path.join(dir, "manifest.yaml"), "agt_x", "2.2.0", "claude-sonnet");

    // Should not throw
    const raw = fs.readFileSync(path.join(dir, "manifest.yaml"), "utf8");
    const parsed = yaml.load(raw);
    assert.ok(parsed, "should parse as valid YAML");
    assert.equal(parsed.name, "oas-coverage-agent");
  });

});

// ── manifest.yaml structure validation ───────────────────────────────────────

describe("manifest.yaml — structure validation", () => {

  const MANIFEST_PATH = new URL("../manifest.yaml", import.meta.url).pathname;

  test("manifest.yaml exists in repo root", () => {
    assert.ok(fs.existsSync(MANIFEST_PATH), "manifest.yaml should exist");
  });

  test("manifest.yaml is valid YAML", () => {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
    const doc = yaml.load(raw);
    assert.ok(doc, "should parse");
  });

  test("manifest.yaml has required top-level fields", () => {
    const doc = yaml.load(fs.readFileSync(MANIFEST_PATH, "utf8"));
    for (const field of ["name","version","schema_version","agent","compatibility","release"]) {
      assert.ok(field in doc, `missing field: ${field}`);
    }
  });

  test("manifest.yaml version matches package.json", () => {
    const doc = yaml.load(fs.readFileSync(MANIFEST_PATH, "utf8"));
    const pkg = JSON.parse(fs.readFileSync(
      new URL("../package.json", import.meta.url).pathname, "utf8"
    ));
    assert.equal(doc.version, pkg.version, "manifest version must match package.json version");
  });

  test("compatibility.spec_formats covers all three supported formats", () => {
    const doc = yaml.load(fs.readFileSync(MANIFEST_PATH, "utf8"));
    const formats = doc.compatibility.spec_formats;
    assert.ok(formats.includes("swagger_2"),  "missing swagger_2");
    assert.ok(formats.includes("openapi_30"), "missing openapi_30");
    assert.ok(formats.includes("openapi_31"), "missing openapi_31");
  });

  test("agent.history is an array", () => {
    const doc = yaml.load(fs.readFileSync(MANIFEST_PATH, "utf8"));
    assert.ok(Array.isArray(doc.agent.history), "agent.history must be an array");
  });

});
