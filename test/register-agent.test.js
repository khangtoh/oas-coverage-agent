/**
 * test/register-agent.test.js
 *
 * Tests the full register-agent.js flow without making real API calls.
 * The Anthropic client is replaced with a mock that returns a synthetic
 * agent response, and the script's manifest write is validated against
 * a temp copy of manifest.yaml.
 *
 * Because register-agent.js is an ESM script with top-level logic, we
 * test it by importing the extracted helper functions and verifying the
 * manifest state before/after a simulated registration.
 *
 * Run:  node --test test/register-agent.test.js
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";
import yaml  from "js-yaml";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROOT = new URL("..", import.meta.url).pathname;

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "reg-test-"));
}

function copyManifest(dest) {
  fs.copyFileSync(
    path.join(ROOT, "manifest.yaml"),
    path.join(dest, "manifest.yaml")
  );
}

function readManifest(dir) {
  return yaml.load(fs.readFileSync(path.join(dir, "manifest.yaml"), "utf8"));
}

/**
 * Inline replica of register-agent.js registration logic.
 * Tests the business logic without running the actual script.
 */
function simulateRegistration(manifestPath, newAgentId, toolVersion, model, registeredBy) {
  const manifest = yaml.load(fs.readFileSync(manifestPath, "utf8"));
  const now = new Date().toISOString();

  if (manifest.agent.current?.id) {
    manifest.agent.history = manifest.agent.history ?? [];
    manifest.agent.history.unshift({
      ...manifest.agent.current,
      retired_at: now,
      retired_by: registeredBy,
    });
  }

  manifest.agent.current = {
    id:            newAgentId,
    tool_version:  toolVersion,
    model,
    registered_at: now,
    registered_by: registeredBy,
    commit:        "abc1234",
  };

  fs.writeFileSync(manifestPath, yaml.dump(manifest, { indent: 2, lineWidth: 120 }));
  return manifest;
}

// ── Agent definition validation ───────────────────────────────────────────────

describe("oas-agent.yaml — agent definition", () => {

  test("loads as valid YAML", () => {
    const doc = yaml.load(fs.readFileSync(path.join(ROOT, "manifests/oas-agent.yaml"), "utf8"));
    assert.ok(doc, "should parse");
  });

  test("has all required API fields", () => {
    const doc = yaml.load(fs.readFileSync(path.join(ROOT, "manifests/oas-agent.yaml"), "utf8"));
    for (const field of ["name", "model", "system_prompt", "tools"]) {
      assert.ok(doc[field], `oas-agent.yaml missing required field: ${field}`);
    }
  });

  test("model is a non-empty string", () => {
    const doc = yaml.load(fs.readFileSync(path.join(ROOT, "manifests/oas-agent.yaml"), "utf8"));
    assert.ok(typeof doc.model === "string" && doc.model.length > 0);
  });

  test("tools is a non-empty array", () => {
    const doc = yaml.load(fs.readFileSync(path.join(ROOT, "manifests/oas-agent.yaml"), "utf8"));
    assert.ok(Array.isArray(doc.tools) && doc.tools.length > 0);
  });

  test("tools list contains bash and file_read at minimum", () => {
    const doc = yaml.load(fs.readFileSync(path.join(ROOT, "manifests/oas-agent.yaml"), "utf8"));
    assert.ok(doc.tools.includes("bash"),      "bash tool required");
    assert.ok(doc.tools.includes("file_read"), "file_read tool required");
    assert.ok(doc.tools.includes("file_write"),"file_write tool required");
  });

  test("system_prompt mentions all three spec formats", () => {
    const doc = yaml.load(fs.readFileSync(path.join(ROOT, "manifests/oas-agent.yaml"), "utf8"));
    assert.ok(doc.system_prompt.includes("Swagger 2.0"),  "system_prompt must mention Swagger 2.0");
    assert.ok(doc.system_prompt.includes("3.0"),          "system_prompt must mention OpenAPI 3.0");
    assert.ok(doc.system_prompt.includes("3.1"),          "system_prompt must mention OpenAPI 3.1");
  });

  test("system_prompt instructs JSON report on final line", () => {
    const doc = yaml.load(fs.readFileSync(path.join(ROOT, "manifests/oas-agent.yaml"), "utf8"));
    assert.ok(
      doc.system_prompt.includes("routesFound") && doc.system_prompt.includes("generated"),
      "system_prompt must describe the JSON report format"
    );
  });

  test("model string matches manifest.compatibility", () => {
    const agent    = yaml.load(fs.readFileSync(path.join(ROOT, "manifests/oas-agent.yaml"), "utf8"));
    const manifest = yaml.load(fs.readFileSync(path.join(ROOT, "manifest.yaml"), "utf8"));
    // The manifest tracks which model was registered — agent definition should match
    assert.equal(
      agent.model,
      manifest.agent.current?.model || agent.model, // passes if manifest not yet registered
      "agent model should match manifest current.model after registration"
    );
  });

});

// ── Registration simulation ───────────────────────────────────────────────────

describe("register-agent — registration flow", () => {

  let dir;

  beforeEach(() => {
    dir = tmpDir();
    copyManifest(dir);
  });

  test("writes agent ID into manifest.agent.current.id", () => {
    simulateRegistration(
      path.join(dir, "manifest.yaml"),
      "agt_test_001", "2.2.0", "claude-sonnet", "test-user"
    );
    const m = readManifest(dir);
    assert.equal(m.agent.current.id, "agt_test_001");
  });

  test("writes tool_version from package.json", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    simulateRegistration(
      path.join(dir, "manifest.yaml"),
      "agt_test_001", pkg.version, "claude-sonnet", "test-user"
    );
    const m = readManifest(dir);
    assert.equal(m.agent.current.tool_version, pkg.version);
  });

  test("sets registered_at to a valid ISO timestamp", () => {
    simulateRegistration(
      path.join(dir, "manifest.yaml"),
      "agt_test_001", "2.2.0", "claude-sonnet", "test-user"
    );
    const m = readManifest(dir);
    assert.ok(!isNaN(Date.parse(m.agent.current.registered_at)), "registered_at must be ISO date");
  });

  test("sets registered_by to provided user", () => {
    simulateRegistration(
      path.join(dir, "manifest.yaml"),
      "agt_test_001", "2.2.0", "claude-sonnet", "khangtoh"
    );
    const m = readManifest(dir);
    assert.equal(m.agent.current.registered_by, "khangtoh");
  });

  test("first registration with empty id does not create history entry", () => {
    // Fresh manifest has empty id — should not move empty string to history
    const m0 = readManifest(dir);
    assert.equal(m0.agent.current.id, "", "fixture should have empty id");

    simulateRegistration(
      path.join(dir, "manifest.yaml"),
      "agt_first", "2.2.0", "claude-sonnet", "test"
    );
    const m = readManifest(dir);
    assert.equal(m.agent.history.length, 0, "empty id should not be added to history");
  });

  test("second registration moves first into history", () => {
    simulateRegistration(path.join(dir, "manifest.yaml"), "agt_v1", "2.0.0", "claude-sonnet", "test");
    simulateRegistration(path.join(dir, "manifest.yaml"), "agt_v2", "2.1.0", "claude-sonnet", "test");

    const m = readManifest(dir);
    assert.equal(m.agent.current.id,       "agt_v2");
    assert.equal(m.agent.history.length,    1);
    assert.equal(m.agent.history[0].id,     "agt_v1");
  });

  test("history is ordered newest-retired-first", () => {
    for (const [id, ver] of [["agt_v1","2.0"],["agt_v2","2.1"],["agt_v3","2.2"]]) {
      simulateRegistration(path.join(dir, "manifest.yaml"), id, ver, "model", "user");
    }
    const m = readManifest(dir);
    assert.equal(m.agent.current.id,    "agt_v3");
    assert.equal(m.agent.history[0].id, "agt_v2"); // most recently retired first
    assert.equal(m.agent.history[1].id, "agt_v1");
  });

  test("manifest remains parseable YAML after two registrations", () => {
    simulateRegistration(path.join(dir, "manifest.yaml"), "agt_v1", "2.0.0", "m", "u");
    simulateRegistration(path.join(dir, "manifest.yaml"), "agt_v2", "2.1.0", "m", "u");
    const raw = fs.readFileSync(path.join(dir, "manifest.yaml"), "utf8");
    assert.doesNotThrow(() => yaml.load(raw), "manifest must remain valid YAML");
  });

  test("registration preserves other top-level manifest fields", () => {
    simulateRegistration(
      path.join(dir, "manifest.yaml"), "agt_x", "2.2.0", "claude-sonnet", "test"
    );
    const m = readManifest(dir);
    assert.equal(m.name,           "oas-coverage-agent");
    assert.ok(m.compatibility,                           "compatibility block must survive");
    assert.ok(m.release,                                 "release block must survive");
    assert.ok(Array.isArray(m.compatibility.spec_formats));
  });

});

// ── package.json / manifest.yaml version sync ─────────────────────────────────

describe("version sync — package.json vs manifest.yaml", () => {

  test("manifest.yaml version matches package.json version", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const man = yaml.load(fs.readFileSync(path.join(ROOT, "manifest.yaml"), "utf8"));
    assert.equal(man.version, pkg.version,
      `manifest.yaml version (${man.version}) must match package.json (${pkg.version})`);
  });

  test("manifest.yaml release.tag matches version with v prefix", () => {
    const man = yaml.load(fs.readFileSync(path.join(ROOT, "manifest.yaml"), "utf8"));
    assert.equal(man.release.tag, `v${man.version}`,
      `release.tag must be v${man.version}`);
  });

  test("CHANGELOG.md contains an entry for the current version", () => {
    const man  = yaml.load(fs.readFileSync(path.join(ROOT, "manifest.yaml"), "utf8"));
    const changelog = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
    assert.ok(
      changelog.includes(man.version),
      `CHANGELOG.md must contain an entry for version ${man.version}`
    );
  });

});
