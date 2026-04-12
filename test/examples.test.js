/**
 * test/examples.test.js
 *
 * Validates the structural correctness of both example spec files:
 *   examples/openapi.yaml  — OAS 3.1
 *   examples/swagger.yaml  — Swagger 2.0
 *
 * These are the reference outputs the agent is expected to produce.
 * Tests act as a contract: if a spec structure change would break
 * a consumer, it will break here first.
 *
 * Run:  node --test test/examples.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs   from "node:fs";
import yaml  from "js-yaml";

// ── Loaders ───────────────────────────────────────────────────────────────────

const ROOT = new URL("..", import.meta.url).pathname;

function loadExample(filename) {
  return yaml.load(fs.readFileSync(`${ROOT}/examples/${filename}`, "utf8"));
}

const OAS31  = loadExample("openapi.yaml");
const SWAGGER = loadExample("swagger.yaml");

// ── Shared path/operation validator ──────────────────────────────────────────

function getOperations(paths) {
  const ops = [];
  const HTTP_METHODS = ["get","post","put","patch","delete","head","options"];
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) ops.push({ path: pathKey, method, op: pathItem[method] });
    }
  }
  return ops;
}

// ── OAS 3.1 (examples/openapi.yaml) ──────────────────────────────────────────

describe("examples/openapi.yaml — OAS 3.1 structure", () => {

  test("has correct openapi version", () => {
    assert.ok(OAS31.openapi.startsWith("3.1"), `expected 3.1.x, got ${OAS31.openapi}`);
  });

  test("has required info fields", () => {
    assert.ok(OAS31.info?.title,   "info.title required");
    assert.ok(OAS31.info?.version, "info.version required");
  });

  test("has at least one server", () => {
    assert.ok(Array.isArray(OAS31.servers) && OAS31.servers.length > 0, "servers array required");
    assert.ok(OAS31.servers[0].url, "server must have url");
  });

  test("has paths with at least 5 entries", () => {
    const count = Object.keys(OAS31.paths ?? {}).length;
    assert.ok(count >= 5, `expected >= 5 paths, got ${count}`);
  });

  test("uses components/schemas (not definitions)", () => {
    assert.ok(OAS31.components?.schemas, "components.schemas must exist");
    assert.equal(OAS31.definitions, undefined, "definitions must NOT exist in OAS 3.1");
  });

  test("has at least 10 reusable schemas", () => {
    const count = Object.keys(OAS31.components.schemas).length;
    assert.ok(count >= 10, `expected >= 10 schemas, got ${count}`);
  });

  test("all operations have operationId", () => {
    const ops = getOperations(OAS31.paths);
    const missing = ops.filter(({ op }) => !op.operationId);
    assert.equal(missing.length, 0,
      `missing operationId on: ${missing.map(o => `${o.method.toUpperCase()} ${o.path}`).join(", ")}`);
  });

  test("all operationIds are camelCase and unique", () => {
    const ops = getOperations(OAS31.paths);
    const ids  = ops.map(({ op }) => op.operationId);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, `duplicate operationIds: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
    for (const id of ids) {
      assert.match(id, /^[a-z][a-zA-Z0-9]*$/, `operationId "${id}" must be camelCase`);
    }
  });

  test("all operations have at least one tag", () => {
    const ops = getOperations(OAS31.paths);
    const untagged = ops.filter(({ op }) => !op.tags?.length);
    assert.equal(untagged.length, 0,
      `untagged ops: ${untagged.map(o => `${o.method.toUpperCase()} ${o.path}`).join(", ")}`);
  });

  test("all operations have at least a 200 response", () => {
    const ops = getOperations(OAS31.paths);
    const noSuccess = ops.filter(({ op }) => {
      const codes = Object.keys(op.responses ?? {});
      return !codes.some(c => c === "200" || c === "201" || c === "204");
    });
    assert.equal(noSuccess.length, 0,
      `ops missing success response: ${noSuccess.map(o => `${o.method.toUpperCase()} ${o.path}`).join(", ")}`);
  });

  test("response codes are quoted strings (OAS 3.x requirement)", () => {
    const ops = getOperations(OAS31.paths);
    for (const { path, method, op } of ops) {
      for (const code of Object.keys(op.responses ?? {})) {
        assert.equal(typeof code, "string",
          `${method.toUpperCase()} ${path}: response code ${code} must be a quoted string`);
      }
    }
  });

  test("$ref paths use #/components/schemas/ prefix", () => {
    const raw = fs.readFileSync(`${ROOT}/examples/openapi.yaml`, "utf8");
    const badRefs = [...raw.matchAll(/\$ref:\s*['"]#\/definitions\//g)];
    assert.equal(badRefs.length, 0, "OAS 3.1 must not use #/definitions/ — use #/components/schemas/");
  });

  test("no x-nullable (OAS 3.1 uses type arrays)", () => {
    const raw = fs.readFileSync(`${ROOT}/examples/openapi.yaml`, "utf8");
    const xNull = [...raw.matchAll(/x-nullable/g)];
    assert.equal(xNull.length, 0, "OAS 3.1 must not use x-nullable");
  });

  test("no requestBody on GET or DELETE operations", () => {
    const ops = getOperations(OAS31.paths).filter(o => ["get","delete"].includes(o.method));
    const withBody = ops.filter(({ op }) => op.requestBody);
    assert.equal(withBody.length, 0,
      `GET/DELETE with requestBody: ${withBody.map(o => `${o.method.toUpperCase()} ${o.path}`).join(", ")}`);
  });

  test("tags declared at top level match tags used in operations", () => {
    const declared = new Set((OAS31.tags ?? []).map(t => t.name));
    const ops = getOperations(OAS31.paths);
    const used = new Set(ops.flatMap(({ op }) => op.tags ?? []));
    for (const tag of used) {
      assert.ok(declared.has(tag), `tag "${tag}" used in operation but not declared in top-level tags`);
    }
  });

});

// ── Swagger 2.0 (examples/swagger.yaml) ──────────────────────────────────────

describe("examples/swagger.yaml — Swagger 2.0 structure", () => {

  test("has correct swagger version", () => {
    assert.equal(String(SWAGGER.swagger), "2.0");
  });

  test("has required info fields", () => {
    assert.ok(SWAGGER.info?.title,   "info.title required");
    assert.ok(SWAGGER.info?.version, "info.version required");
  });

  test("has host and basePath (not servers)", () => {
    assert.ok(SWAGGER.host,     "host required in Swagger 2.0");
    assert.ok(SWAGGER.basePath, "basePath required in Swagger 2.0");
    assert.equal(SWAGGER.servers, undefined, "servers must NOT exist in Swagger 2.0");
  });

  test("basePath starts with /", () => {
    assert.ok(SWAGGER.basePath.startsWith("/"), "basePath must start with /");
  });

  test("host has no scheme or trailing slash", () => {
    assert.ok(!SWAGGER.host.includes("://"), "host must not include scheme");
    assert.ok(!SWAGGER.host.endsWith("/"),   "host must not end with /");
  });

  test("uses definitions (not components/schemas)", () => {
    assert.ok(SWAGGER.definitions, "definitions must exist in Swagger 2.0");
    assert.equal(SWAGGER.components, undefined, "components must NOT exist in Swagger 2.0");
  });

  test("has at least 10 definitions", () => {
    const count = Object.keys(SWAGGER.definitions).length;
    assert.ok(count >= 10, `expected >= 10 definitions, got ${count}`);
  });

  test("has same paths as openapi.yaml (parity check)", () => {
    const oas31Paths  = new Set(Object.keys(OAS31.paths));
    const swaggerPaths = new Set(Object.keys(SWAGGER.paths));
    assert.deepEqual(
      [...swaggerPaths].sort(),
      [...oas31Paths].sort(),
      "swagger.yaml and openapi.yaml must document the same paths"
    );
  });

  test("all operations have operationId", () => {
    const ops = getOperations(SWAGGER.paths);
    const missing = ops.filter(({ op }) => !op.operationId);
    assert.equal(missing.length, 0,
      `missing operationId: ${missing.map(o => `${o.method.toUpperCase()} ${o.path}`).join(", ")}`);
  });

  test("all operationIds are unique across the spec", () => {
    const ops = getOperations(SWAGGER.paths);
    const ids  = ops.map(({ op }) => op.operationId);
    const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.equal(dups.length, 0, `duplicate operationIds: ${dups.join(", ")}`);
  });

  test("response codes are integers (Swagger 2.0 requirement)", () => {
    const ops = getOperations(SWAGGER.paths);
    for (const { path, method, op } of ops) {
      for (const code of Object.keys(op.responses ?? {})) {
        // YAML parses integer keys as numbers; js-yaml may give strings —
        // either is acceptable as long as it's not a non-numeric string
        assert.ok(/^\d+$/.test(String(code)),
          `${method.toUpperCase()} ${path}: response code "${code}" must be an integer`);
      }
    }
  });

  test("body params use 'in: body' style (no requestBody: key)", () => {
    const ops = getOperations(SWAGGER.paths);
    for (const { path, method, op } of ops) {
      if (["post","put","patch"].includes(method)) {
        assert.ok(!op.requestBody,
          `${method.toUpperCase()} ${path}: must use body parameter, not requestBody`);
      }
    }
  });

  test("no requestBody: as YAML key in any operation", () => {
    const ops = getOperations(SWAGGER.paths);
    const withKey = ops.filter(({ op }) => "requestBody" in op);
    assert.equal(withKey.length, 0,
      `ops with requestBody key: ${withKey.map(o => `${o.method.toUpperCase()} ${o.path}`).join(", ")}`);
  });

  test("$ref paths use #/definitions/ prefix", () => {
    const raw = fs.readFileSync(`${ROOT}/examples/swagger.yaml`, "utf8");
    const badRefs = [...raw.matchAll(/\$ref:\s*['"]#\/components\//g)];
    assert.equal(badRefs.length, 0, "Swagger 2.0 must not use #/components/ — use #/definitions/");
  });

  test("no openapi: key (would be Swagger 2.0 structural error)", () => {
    assert.equal(SWAGGER.openapi, undefined, "swagger.yaml must not have openapi: key");
  });

  test("all $ref definitions exist in definitions block", () => {
    const raw = fs.readFileSync(`${ROOT}/examples/swagger.yaml`, "utf8");
    const refs = [...raw.matchAll(/\$ref:\s*['"]#\/definitions\/([^'"]+)['"]/g)]
      .map(m => m[1]);
    const defined = new Set(Object.keys(SWAGGER.definitions));
    const broken  = refs.filter(r => !defined.has(r));
    assert.equal(broken.length, 0, `broken $refs: ${[...new Set(broken)].join(", ")}`);
  });

  test("all $ref schemas in openapi.yaml exist in components.schemas", () => {
    const raw = fs.readFileSync(`${ROOT}/examples/openapi.yaml`, "utf8");
    const refs = [...raw.matchAll(/\$ref:\s*['"]#\/components\/schemas\/([^'"]+)['"]/g)]
      .map(m => m[1]);
    const defined = new Set(Object.keys(OAS31.components.schemas));
    const broken  = refs.filter(r => !defined.has(r));
    assert.equal(broken.length, 0, `broken $refs in openapi.yaml: ${[...new Set(broken)].join(", ")}`);
  });

});

// ── Cross-spec parity ─────────────────────────────────────────────────────────

describe("cross-spec parity — openapi.yaml vs swagger.yaml", () => {

  test("same number of operations in both specs", () => {
    const oas31Count   = getOperations(OAS31.paths).length;
    const swaggerCount = getOperations(SWAGGER.paths).length;
    assert.equal(oas31Count, swaggerCount,
      `operation count mismatch: openapi.yaml=${oas31Count}, swagger.yaml=${swaggerCount}`);
  });

  test("same operationIds in both specs", () => {
    const oas31Ids   = new Set(getOperations(OAS31.paths).map(o => o.op.operationId));
    const swaggerIds = new Set(getOperations(SWAGGER.paths).map(o => o.op.operationId));
    const onlyInOas31   = [...oas31Ids].filter(id => !swaggerIds.has(id));
    const onlyInSwagger = [...swaggerIds].filter(id => !oas31Ids.has(id));
    assert.equal(onlyInOas31.length,   0, `operationIds only in openapi.yaml: ${onlyInOas31.join(", ")}`);
    assert.equal(onlyInSwagger.length, 0, `operationIds only in swagger.yaml: ${onlyInSwagger.join(", ")}`);
  });

  test("same schema/definition names in both specs", () => {
    const oas31Names   = new Set(Object.keys(OAS31.components.schemas));
    const swaggerNames = new Set(Object.keys(SWAGGER.definitions));
    const onlyInOas31   = [...oas31Names].filter(n => !swaggerNames.has(n));
    const onlyInSwagger = [...swaggerNames].filter(n => !oas31Names.has(n));
    assert.equal(onlyInOas31.length,   0, `schemas only in openapi.yaml: ${onlyInOas31.join(", ")}`);
    assert.equal(onlyInSwagger.length, 0, `definitions only in swagger.yaml: ${onlyInSwagger.join(", ")}`);
  });

});
