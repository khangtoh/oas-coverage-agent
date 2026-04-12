/**
 * test/helpers/prompt-builder.js
 *
 * Extracted pure function from harness.js buildTaskPrompt().
 * Allows unit testing of prompt content without importing the full harness
 * (which has module-level side effects: process.env reads, client init).
 *
 * Kept in sync with harness.js FORMAT_INSTRUCTIONS manually.
 * If you change the prompt format, update this file too.
 */

const FORMAT_INSTRUCTIONS = {
  swagger_2: `
SWAGGER 2.0 STRUCTURE — use these patterns exactly:

Top-level keys: swagger, info, host, basePath, schemes, consumes, produces, securityDefinitions, definitions, paths
  - definitions (NOT components/schemas)
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
  parameters[in=body]:
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

Operation structure:
  /path/{id}:
    get:
      parameters:
        - schema:
            type: string
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MySchema'

Request body:
  requestBody:
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/CreateRequest'

Nullable: nullable: true  (use this — do not use JSON Schema type arrays)
`,

  openapi_31: `
OPENAPI 3.1 STRUCTURE — use these patterns exactly:

Top-level keys: openapi, info, servers, components, paths
  - components/schemas (NOT definitions)

Request body:
  requestBody:
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/CreateRequest'

Nullable: type: [string, "null"]  (full JSON Schema 2020-12 — NOT nullable: true)
QUOTED STRING response code keys: '200', '404', etc.
`,
};

const SCAFFOLD_INSTRUCTIONS = {
  swagger_2:  () => `\nSCAFFOLD (new Swagger 2.0 file):\n  swagger: "2.0"\n  paths: {}\n  definitions: {}`,
  openapi_30: () => `\nSCAFFOLD (new OpenAPI 3.0 file):\n  openapi: "3.0.3"\n  paths: {}\n  components:\n    schemas: {}`,
  openapi_31: () => `\nSCAFFOLD (new OpenAPI 3.1 file):\n  openapi: "3.1.0"\n  paths: {}\n  components:\n    schemas: {}`,
};

/**
 * @param {object} opts
 * @param {"swagger_2"|"openapi_30"|"openapi_31"} opts.format
 * @param {string}  opts.formatLabel
 * @param {string}  opts.specRelPath
 * @param {boolean} opts.isNew
 * @param {string}  opts.srcDirs
 * @param {string}  opts.branch
 * @param {object|null} opts.checkerConfig
 * @returns {string}
 */
export function buildPromptForFormat(opts) {
  const { format, formatLabel, specRelPath, isNew, srcDirs, branch, checkerConfig } = opts;

  const excludeRoutes = checkerConfig?.generate?.exclude_routes ?? [];
  const schemaHints   = checkerConfig?.generate?.schema_hints   ?? {};
  const commonHeaders = checkerConfig?.generate?.common_headers  ?? [];

  const excludeSection    = excludeRoutes.length ? `\nRoutes to EXCLUDE:\n${excludeRoutes.map(r => `  - ${r}`).join("\n")}` : "";
  const schemaHintSection = Object.keys(schemaHints).length ? `\nSchema hints:\n${Object.entries(schemaHints).map(([k,v]) => `  ${k}: ${v}`).join("\n")}` : "";
  const headerSection     = commonHeaders.length ? `\nCommon headers:\n${JSON.stringify(commonHeaders, null, 2)}` : "";
  const scaffoldSection   = isNew ? SCAFFOLD_INSTRUCTIONS[format]() : "";

  return `You are running inside a CI container. MR branch: ${branch}

═══════════════════════════════════════════════════════════
SPEC FORMAT: ${formatLabel}
SPEC FILE:   /repo/${specRelPath}${isNew ? "  (DOES NOT EXIST — create it)" : ""}
═══════════════════════════════════════════════════════════

${FORMAT_INSTRUCTIONS[format]}
${scaffoldSection}

YOUR TASK:

1. SCAN source files in: ${srcDirs}
   Skip: node_modules, __pycache__, .git, dist, build, vendor, target, .venv
   Skip test files: *.test.*, *.spec.*, *_test.*, test_*.*
${excludeSection}

2. EXTRACT every implemented HTTP route across ALL languages and frameworks.
   Normalise path params: :id → {id}, <int:pk> → {pk}

3. READ the spec at /repo/${specRelPath}${isNew ? " (create scaffold first)" : ""}

4. DIFF: find routes missing from the spec

5. GENERATE entries for each missing route using ${formatLabel} syntax (see rules above).
${schemaHintSection}
${headerSection}

6. MERGE generated entries. Sort alphabetically. Do not alter existing entries.

7. WRITE the updated spec back to /repo/${specRelPath}

8. OUTPUT on your FINAL line:
   {"routesFound": <n>, "missing": [...], "generated": [...], "oasPath": "${specRelPath}", "specFormat": "${format}"}`.trim();
}
