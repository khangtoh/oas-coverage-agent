/**
 * watch.js — Local git watch mode for OAS Coverage Agent
 *
 * Polls the target repo for new commits. When HEAD changes, runs harness.js.
 * Intended for local development — not for use in CI.
 *
 * Usage:
 *   CI_PROJECT_DIR=/path/to/repo node src/watch.js
 *   npm run watch -- --repo /path/to/repo
 *
 * Env vars:
 *   CI_PROJECT_DIR    — path to the repo to watch (defaults to cwd)
 *   WATCH_INTERVAL    — poll interval in ms (default: 5000)
 *   ANTHROPIC_API_KEY — required for harness
 *   OAS_PATH          — optional, passed through to harness
 *   SRC_DIRS          — optional, passed through to harness
 */

import { execSync, spawn } from "child_process";
import path from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const args         = process.argv.slice(2);
const repoFlag     = args.indexOf("--repo");
const REPO_ROOT    = repoFlag !== -1 ? args[repoFlag + 1] : (process.env.CI_PROJECT_DIR ?? process.cwd());
const POLL_MS      = parseInt(process.env.WATCH_INTERVAL ?? "5000", 10);
const HARNESS      = new URL("./harness.js", import.meta.url).pathname;

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(emoji, msg) { console.log(`${emoji}  ${msg}`); }

function getHead() {
  try {
    return execSync(`git -C "${REPO_ROOT}" rev-parse HEAD`, { stdio: "pipe", encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getCommitSummary(sha) {
  try {
    return execSync(`git -C "${REPO_ROOT}" log -1 --pretty=format:"%h %s" ${sha}`, { stdio: "pipe", encoding: "utf8" }).trim();
  } catch {
    return sha?.slice(0, 8) ?? "unknown";
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function runCheck() {
  return new Promise((resolve) => {
    log("🚀", "Running OAS coverage check…\n");

    const proc = spawn("node", [HARNESS], {
      stdio: "inherit",
      env: {
        ...process.env,
        CI_PROJECT_DIR: REPO_ROOT,
      },
    });

    proc.on("close", (code) => {
      console.log("");
      if (code === 0) {
        log("✅", "Check completed successfully");
      } else {
        log("⚠️ ", `Check exited with code ${code}`);
      }
      resolve(code);
    });

    proc.on("error", (err) => {
      log("❌", `Failed to start harness: ${err.message}`);
      resolve(1);
    });
  });
}

// ── Watch loop ────────────────────────────────────────────────────────────────

async function watch() {
  log("👀", `Watching: ${REPO_ROOT}`);
  log("⏱ ", `Poll interval: ${POLL_MS}ms`);
  log("💡", "Press Ctrl+C to stop\n");

  if (!process.env.ANTHROPIC_API_KEY) {
    log("❌", "ANTHROPIC_API_KEY is not set — checks will fail");
    process.exit(1);
  }

  let lastHead = getHead();

  if (!lastHead) {
    log("❌", `No git repo found at: ${REPO_ROOT}`);
    process.exit(1);
  }

  log("📌", `HEAD: ${getCommitSummary(lastHead)}\n`);

  let running = false;

  // Run once immediately on start
  running = true;
  await runCheck();
  running = false;

  log("👀", "Watching for new commits…\n");

  while (true) {
    await sleep(POLL_MS);

    if (running) continue;

    const head = getHead();

    if (head && head !== lastHead) {
      log("🔔", `New commit: ${getCommitSummary(head)}`);
      lastHead = head;
      running = true;
      await runCheck();
      running = false;
      log("👀", "Watching for new commits…\n");
    }
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on("SIGINT",  () => { console.log("\n"); log("👋", "Watch stopped"); process.exit(0); });
process.on("SIGTERM", () => { log("👋", "Watch stopped"); process.exit(0); });

watch().catch((err) => { console.error(err); process.exit(1); });
