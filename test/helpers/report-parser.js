/**
 * test/helpers/report-parser.js
 *
 * Pure functions extracted from harness.js for unit testing.
 * parseReport() and buildArtifact() have no side effects and
 * do not need the Anthropic SDK — safe to import in any test.
 */

/**
 * Extracts the JSON report from the agent's final text output.
 * Searches from the last line backwards for the first parseable JSON object.
 *
 * @param {string} agentOutput
 * @returns {{ routesFound: number, missing: string[], generated: string[], oasPath: string, specFormat: string }}
 */
export function parseReport(agentOutput) {
  const lines = agentOutput.trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{")) {
      try { return JSON.parse(line); } catch { /* keep searching */ }
    }
  }
  return { routesFound: 0, missing: [], generated: [] };
}

/**
 * Builds the CI artifact JSON written to oas-check-report.json.
 *
 * @param {object} opts
 * @param {object} opts.report   - Parsed JSON report from agent output
 * @param {object} opts.specCtx  - SpecContext from detectSpec
 * @param {string} opts.sessionId
 * @returns {object}
 */
export function buildArtifact({ report, specCtx, sessionId }) {
  return {
    success:     true,
    specFormat:  specCtx.format,
    formatLabel: specCtx.formatLabel,
    routesFound: report.routesFound ?? 0,
    missing:     report.missing     ?? [],
    generated:   report.generated   ?? [],
    oasPath:     specCtx.specRelPath,
    sessionId,
    message: report.generated?.length > 0
      ? `Added ${report.generated.length} missing path(s) to ${specCtx.specRelPath}`
      : `Coverage complete — no changes needed`,
  };
}
