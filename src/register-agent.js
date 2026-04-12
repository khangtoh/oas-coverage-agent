/**
 * register-agent.js
 *
 * Registers the OAS Coverage Agent with Claude Managed Agents and
 * writes the agent ID back into manifest.yaml.
 *
 * Usage:
 *   npm run register
 *   # or: ANTHROPIC_API_KEY=sk-ant-... node src/register-agent.js
 *
 * After running:
 *   1. Commit the updated manifest.yaml
 *   2. Tag the release:  git tag v$(node -p "require('./package.json').version")
 *   3. Push:             git push origin main --tags
 *
 * Consumer repos that pin to the version tag get the agent ID from
 * manifest.yaml automatically — no OAS_AGENT_ID CI variable needed.
 */

import fs   from "fs";
import path from "path";
import yaml  from "js-yaml";
import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";

const ROOT         = new URL("..", import.meta.url).pathname;
const MANIFEST_PATH = path.join(ROOT, "manifest.yaml");
const AGENT_PATH    = path.join(ROOT, "manifests", "oas-agent.yaml");
const PKG_PATH      = path.join(ROOT, "package.json");
const BETA_HEADER  = "managed-agents-2026-04-01";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Helpers ───────────────────────────────────────────────────────────────────

function readYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, "utf8"));
}

function writeYaml(filePath, doc) {
  fs.writeFileSync(filePath, yaml.dump(doc, { indent: 2, lineWidth: 120, noRefs: true }));
}

function getGitUser() {
  try {
    return execSync("git config user.name", { stdio: "pipe", encoding: "utf8" }).trim();
  } catch {
    return process.env.USER ?? "unknown";
  }
}

function getGitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: "pipe", encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function register() {
  // ── 1. Read current state ─────────────────────────────────────────────────

  const agentDef  = readYaml(AGENT_PATH);
  const manifest  = readYaml(MANIFEST_PATH);
  const pkg       = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));

  console.log("oas-coverage-agent — Agent Registration\n");
  console.log(`Tool version:  ${pkg.version}`);
  console.log(`Model:         ${agentDef.model}`);
  console.log(`Manifest:      ${MANIFEST_PATH}\n`);

  // Warn if package.json version doesn't match manifest version
  if (manifest.version !== pkg.version) {
    console.warn(`⚠️  Version mismatch: manifest=${manifest.version}, package.json=${pkg.version}`);
    console.warn("   Update manifest.yaml version to match package.json before registering.\n");
  }

  // ── 2. Register with Managed Agents API ──────────────────────────────────

  console.log("Registering with Claude Managed Agents…");

  const agent = await client.beta.managedAgents.agents.create(
    {
      name:          agentDef.name,
      description:   agentDef.description,
      model:         agentDef.model,
      system_prompt: agentDef.system_prompt,
      tools:         agentDef.tools.map((t) => ({ type: t })),
    },
    { headers: { "anthropic-beta": BETA_HEADER } }
  );

  console.log(`✅ Registered: ${agent.id}\n`);

  // ── 3. Update manifest.yaml ───────────────────────────────────────────────

  const now          = new Date().toISOString();
  const registeredBy = getGitUser();
  const commit       = getGitCommit();

  // Move current → history (if an agent was previously registered)
  if (manifest.agent.current?.id) {
    manifest.agent.history = manifest.agent.history ?? [];
    manifest.agent.history.unshift({
      ...manifest.agent.current,
      retired_at:  now,
      retired_by:  registeredBy,
    });
  }

  // Write new current
  manifest.agent.current = {
    id:            agent.id,
    tool_version:  pkg.version,
    model:         agentDef.model,
    registered_at: now,
    registered_by: registeredBy,
    commit,
  };

  writeYaml(MANIFEST_PATH, manifest);
  console.log(`✅ manifest.yaml updated`);

  // ── 4. Print next steps ───────────────────────────────────────────────────

  const tag = `v${pkg.version}`;

  console.log(`
─────────────────────────────────────────────────────────────────────
  Agent ID:   ${agent.id}
  Version:    ${pkg.version}
  Tag:        ${tag}
─────────────────────────────────────────────────────────────────────

Next steps:

  1. Commit the updated manifest:
       git add manifest.yaml
       git commit -m "chore: register agent ${pkg.version}"

  2. Tag and push the release:
       git tag ${tag}
       git push origin main ${tag}

  3. Consumer repos that pin to ${tag} get the agent ID automatically.
     No OAS_AGENT_ID CI variable needed for standard setups.

  4. For repos overriding with OAS_AGENT_ID CI variable, update it to:
       ${agent.id}
─────────────────────────────────────────────────────────────────────
`);
}

register().catch((err) => {
  console.error("Registration failed:", err.message);
  process.exit(1);
});
