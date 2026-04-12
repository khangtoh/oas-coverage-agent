/**
 * detect-spec.js
 *
 * Determines the spec file path and format (swagger 2.0 / openapi 3.x)
 * BEFORE the session starts, so the task prompt can give the agent
 * explicit, unambiguous structural instructions.
 *
 * Detection priority:
 *   1. .oas-checker.yaml → spec.path + spec.oas_version  (explicit, highest)
 *   2. OAS_PATH env var  → read file, sniff content
 *   3. Auto-discover     → swagger.yaml/json, openapi.yaml/json at repo root
 *   4. Fallback          → default path "openapi.yaml", create as OAS 3.1
 *
 * Returns a SpecContext object consumed by buildTaskPrompt() in harness.js.
 */

import fs   from "fs";
import path from "path";
import yaml from "js-yaml";

// Filenames to probe in order when no explicit path is configured.
// swagger.* first so legacy repos are naturally detected.
const DISCOVERY_CANDIDATES = [
  "swagger.yaml",
  "swagger.json",
  "swagger/swagger.yaml",
  "swagger/swagger.json",
  "api/swagger.yaml",
  "api/swagger.json",
  "openapi.yaml",
  "openapi.json",
  "api/openapi.yaml",
  "api/openapi.json",
  "docs/openapi.yaml",
  "docs/swagger.yaml",
];

/**
 * @typedef {Object} SpecContext
 * @property {string}  specPath      - Absolute path to the spec file
 * @property {string}  specRelPath   - Relative path from repo root (for agent)
 * @property {"swagger_2"|"openapi_30"|"openapi_31"} format
 * @property {string}  formatLabel   - Human-readable: "Swagger 2.0" | "OpenAPI 3.0" | "OpenAPI 3.1"
 * @property {boolean} isNew         - true if the file does not exist yet
 * @property {object|null} checkerConfig - Parsed .oas-checker.yaml (if present)
 */

/**
 * @param {string} repoRoot   Absolute path to the repo checkout
 * @param {string} oasPathEnv Value of OAS_PATH env var (may be empty)
 * @returns {SpecContext}
 */
export function detectSpec(repoRoot, oasPathEnv) {
  // ── 1. Read .oas-checker.yaml ─────────────────────────────────────────────
  const checkerConfig = loadCheckerConfig(repoRoot);

  // ── 2. Resolve spec path ──────────────────────────────────────────────────
  let specRelPath =
    checkerConfig?.spec?.path ||   // explicit in .oas-checker.yaml
    oasPathEnv                  || // CI variable
    null;

  if (!specRelPath) {
    // Auto-discover
    specRelPath = discoverSpecPath(repoRoot);
  }

  // Still nothing — we'll create a new OAS 3.1 file at the default location
  if (!specRelPath) {
    specRelPath = "openapi.yaml";
  }

  const specPath = path.join(repoRoot, specRelPath);
  const isNew    = !fs.existsSync(specPath);

  // ── 3. Determine format ───────────────────────────────────────────────────
  let format = "openapi_31"; // default for new files

  if (!isNew) {
    format = sniffFormat(specPath, checkerConfig?.spec?.oas_version);
  } else if (checkerConfig?.spec?.oas_version) {
    format = parseVersionString(checkerConfig.spec.oas_version);
  }

  const formatLabel = {
    swagger_2:  "Swagger 2.0",
    openapi_30: "OpenAPI 3.0",
    openapi_31: "OpenAPI 3.1",
  }[format];

  return { specPath, specRelPath, format, formatLabel, isNew, checkerConfig };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadCheckerConfig(repoRoot) {
  const checkerPath = path.join(repoRoot, ".oas-checker.yaml");
  if (!fs.existsSync(checkerPath)) return null;
  try {
    return yaml.load(fs.readFileSync(checkerPath, "utf8"));
  } catch {
    return null; // malformed — ignore and continue
  }
}

function discoverSpecPath(repoRoot) {
  for (const candidate of DISCOVERY_CANDIDATES) {
    if (fs.existsSync(path.join(repoRoot, candidate))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Read the first ~20 lines of a spec file and look for the version key.
 * Avoids parsing the whole file for large specs.
 */
function sniffFormat(specPath, explicitVersion) {
  // Explicit override in .oas-checker.yaml always wins
  if (explicitVersion) return parseVersionString(explicitVersion);

  let raw;
  try {
    // Read only the first 2 KB — version key is always near the top
    const buf = Buffer.alloc(2048);
    const fd  = fs.openSync(specPath, "r");
    const read = fs.readSync(fd, buf, 0, 2048, 0);
    fs.closeSync(fd);
    raw = buf.slice(0, read).toString("utf8");
  } catch {
    return "openapi_31";
  }

  // swagger: "2.0" or swagger: '2.0'
  if (/^swagger\s*:\s*['"]?2\.0['"]?/m.test(raw)) return "swagger_2";

  // openapi: 3.0.x
  if (/^openapi\s*:\s*['"]?3\.0\./m.test(raw)) return "openapi_30";

  // openapi: 3.1.x  (or 3.x without minor — treat as 3.1)
  if (/^openapi\s*:\s*['"]?3\.[1-9]/m.test(raw)) return "openapi_31";

  // JSON format: "swagger": "2.0"
  if (/"swagger"\s*:\s*"2\.0"/.test(raw)) return "swagger_2";
  if (/"openapi"\s*:\s*"3\.0\./.test(raw)) return "openapi_30";
  if (/"openapi"\s*:\s*"3\.[1-9]/.test(raw)) return "openapi_31";

  // Cannot determine — default to 3.1
  return "openapi_31";
}

function parseVersionString(v) {
  const s = String(v).trim();
  if (s === "2.0" || s === "swagger_2" || s === "swagger2") return "swagger_2";
  if (s.startsWith("3.0")) return "openapi_30";
  return "openapi_31";
}
