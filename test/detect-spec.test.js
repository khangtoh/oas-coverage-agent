/**
 * test/detect-spec.test.js
 *
 * Unit tests for src/detect-spec.js
 * Uses Node.js built-in test runner — no extra dependencies.
 *
 * Run:  npm test
 *       npm run test:unit
 *       node --test test/detect-spec.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";
import { detectSpec } from "../src/detect-spec.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const FIXTURES = new URL("./fixtures", import.meta.url).pathname;

function fixture(name) {
  return path.join(FIXTURES, name);
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "oas-test-"));
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

// ── Format detection from file content ───────────────────────────────────────

describe("detectSpec — format sniffing from file header", () => {

  test("detects swagger: \"2.0\" (YAML)", () => {
    const ctx = detectSpec(fixture("swagger2-repo"), "swagger.yaml");
    assert.equal(ctx.format,      "swagger_2");
    assert.equal(ctx.formatLabel, "Swagger 2.0");
    assert.equal(ctx.isNew,       false);
    assert.equal(ctx.specRelPath, "swagger.yaml");
  });

  test("detects openapi: \"3.0.3\" (YAML)", () => {
    const ctx = detectSpec(fixture("oas30-repo"), "openapi.yaml");
    assert.equal(ctx.format,      "openapi_30");
    assert.equal(ctx.formatLabel, "OpenAPI 3.0");
    assert.equal(ctx.isNew,       false);
  });

  test("detects openapi: \"3.1.0\" (YAML)", () => {
    const ctx = detectSpec(fixture("oas31-repo"), "openapi.yaml");
    assert.equal(ctx.format,      "openapi_31");
    assert.equal(ctx.formatLabel, "OpenAPI 3.1");
    assert.equal(ctx.isNew,       false);
  });

  test("detects swagger 2.0 from JSON content", () => {
    const dir = tmpDir();
    writeFile(dir, "openapi.json", JSON.stringify({ swagger: "2.0", info: { title: "T", version: "1" }, paths: {} }));
    const ctx = detectSpec(dir, "openapi.json");
    assert.equal(ctx.format, "swagger_2");
  });

  test("detects openapi 3.0 from JSON content", () => {
    const dir = tmpDir();
    writeFile(dir, "openapi.json", JSON.stringify({ openapi: "3.0.3", info: { title: "T", version: "1" }, paths: {} }));
    const ctx = detectSpec(dir, "openapi.json");
    assert.equal(ctx.format, "openapi_30");
  });

  test("detects openapi 3.1 from JSON content", () => {
    const dir = tmpDir();
    writeFile(dir, "openapi.json", JSON.stringify({ openapi: "3.1.0", info: { title: "T", version: "1" }, paths: {} }));
    const ctx = detectSpec(dir, "openapi.json");
    assert.equal(ctx.format, "openapi_31");
  });

  test("defaults to openapi_31 when header is unrecognised", () => {
    const dir = tmpDir();
    writeFile(dir, "api.yaml", "title: Something\nversion: 1\n");
    const ctx = detectSpec(dir, "api.yaml");
    assert.equal(ctx.format, "openapi_31");
  });

});

// ── Auto-discovery ────────────────────────────────────────────────────────────

describe("detectSpec — auto-discovery of spec filename", () => {

  test("discovers swagger.yaml before openapi.yaml when both exist", () => {
    const dir = tmpDir();
    writeFile(dir, "swagger.yaml",  'swagger: "2.0"\ninfo:\n  title: T\n  version: "1"\npaths: {}\n');
    writeFile(dir, "openapi.yaml",  'openapi: "3.1.0"\ninfo:\n  title: T\n  version: "1"\npaths: {}\n');
    const ctx = detectSpec(dir, "");
    assert.equal(ctx.specRelPath, "swagger.yaml");
    assert.equal(ctx.format, "swagger_2");
  });

  test("discovers openapi.yaml when no swagger.yaml present", () => {
    const dir = tmpDir();
    writeFile(dir, "openapi.yaml", 'openapi: "3.1.0"\ninfo:\n  title: T\n  version: "1"\npaths: {}\n');
    const ctx = detectSpec(dir, "");
    assert.equal(ctx.specRelPath, "openapi.yaml");
    assert.equal(ctx.format, "openapi_31");
  });

  test("discovers swagger/swagger.yaml in subdirectory", () => {
    const dir = tmpDir();
    writeFile(dir, "swagger/swagger.yaml", 'swagger: "2.0"\ninfo:\n  title: T\n  version: "1"\npaths: {}\n');
    const ctx = detectSpec(dir, "");
    assert.equal(ctx.specRelPath, "swagger/swagger.yaml");
    assert.equal(ctx.format, "swagger_2");
  });

  test("falls back to openapi.yaml (isNew=true) when nothing discovered", () => {
    const ctx = detectSpec(fixture("empty-repo"), "");
    assert.equal(ctx.specRelPath, "openapi.yaml");
    assert.equal(ctx.format,      "openapi_31");
    assert.equal(ctx.isNew,       true);
  });

});

// ── .oas-checker.yaml overrides ───────────────────────────────────────────────

describe("detectSpec — .oas-checker.yaml config", () => {

  test("reads spec.path from .oas-checker.yaml", () => {
    const ctx = detectSpec(fixture("checker-repo"), "");
    assert.equal(ctx.specRelPath, "api/swagger.yaml");
  });

  test("reads spec.oas_version from .oas-checker.yaml and overrides sniff", () => {
    const ctx = detectSpec(fixture("checker-repo"), "");
    assert.equal(ctx.format, "swagger_2");
  });

  test("exposes parsed checkerConfig", () => {
    const ctx = detectSpec(fixture("checker-repo"), "");
    assert.ok(ctx.checkerConfig);
    assert.deepEqual(ctx.checkerConfig.scan.include, ["src/handlers", "src/routes"]);
    assert.deepEqual(ctx.checkerConfig.generate.exclude_routes, ["DELETE /internal/reset"]);
  });

  test("OAS_PATH env var takes precedence over auto-discovery but not .oas-checker.yaml", () => {
    // .oas-checker.yaml says api/swagger.yaml — env var is ignored
    const ctx = detectSpec(fixture("checker-repo"), "some-other.yaml");
    assert.equal(ctx.specRelPath, "api/swagger.yaml"); // checker wins
  });

  test("OAS_PATH env var is used when no .oas-checker.yaml exists", () => {
    const ctx = detectSpec(fixture("oas31-repo"), "openapi.yaml");
    assert.equal(ctx.specRelPath, "openapi.yaml");
    assert.equal(ctx.checkerConfig, null);
  });

  test("malformed .oas-checker.yaml is silently ignored", () => {
    const dir = tmpDir();
    writeFile(dir, ".oas-checker.yaml", "{ invalid yaml: [[\n");
    writeFile(dir, "openapi.yaml", 'openapi: "3.1.0"\ninfo:\n  title: T\n  version: "1"\npaths: {}\n');
    // Should not throw — bad checker config is treated as absent
    const ctx = detectSpec(dir, "openapi.yaml");
    assert.equal(ctx.checkerConfig, null);
    assert.equal(ctx.format, "openapi_31");
  });

});

// ── SpecContext shape ─────────────────────────────────────────────────────────

describe("detectSpec — SpecContext return shape", () => {

  test("returns all required fields", () => {
    const ctx = detectSpec(fixture("oas31-repo"), "openapi.yaml");
    assert.ok(typeof ctx.specPath    === "string", "specPath");
    assert.ok(typeof ctx.specRelPath === "string", "specRelPath");
    assert.ok(typeof ctx.format      === "string", "format");
    assert.ok(typeof ctx.formatLabel === "string", "formatLabel");
    assert.ok(typeof ctx.isNew       === "boolean","isNew");
    // checkerConfig may be null
  });

  test("isNew=false for existing file", () => {
    const ctx = detectSpec(fixture("swagger2-repo"), "swagger.yaml");
    assert.equal(ctx.isNew, false);
  });

  test("isNew=true for non-existent file", () => {
    const ctx = detectSpec(fixture("empty-repo"), "ghost.yaml");
    assert.equal(ctx.isNew, true);
  });

  test("specPath is the absolute path join of root + relPath", () => {
    const root = fixture("oas31-repo");
    const ctx  = detectSpec(root, "openapi.yaml");
    assert.equal(ctx.specPath, path.join(root, "openapi.yaml"));
  });

});
