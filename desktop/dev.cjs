/**
 * Starts Vite (desktop mode) if needed, waits until ready, then launches Electron.
 */
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const VITE_URL = "http://127.0.0.1:5173/";

function checkVite() {
  return new Promise((resolve) => {
    const req = http.get(VITE_URL, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForVite(maxMs = 90000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await checkVite()) {
        resolve();
        return;
      }
      if (Date.now() - start > maxMs) {
        reject(new Error("Timed out waiting for Vite on http://localhost:5173"));
        return;
      }
      setTimeout(tick, 400);
    };
    void tick();
  });
}

function run(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
    ...opts,
  });
}

async function main() {
  let viteProc = null;
  const alreadyUp = await checkVite();

  if (!alreadyUp) {
    console.log("[electron:dev] Starting Vite (npm run dev:desktop)...");
    viteProc = run("npm", ["run", "dev:desktop"], { detached: false });
    viteProc.on("error", (err) => {
      console.error("[electron:dev] Could not start Vite:", err.message);
      process.exit(1);
    });
    try {
      await waitForVite();
    } catch (e) {
      console.error("[electron:dev]", e.message);
      if (viteProc && !viteProc.killed) viteProc.kill();
      process.exit(1);
    }
  } else {
    console.log("[electron:dev] Vite already running on port 5173");
  }

  console.log("[electron:dev] Launching Electron...");
  const electronProc = run("npx", ["electron", "."]);

  const cleanup = () => {
    if (viteProc && !viteProc.killed) {
      viteProc.kill();
    }
  };

  process.on("SIGINT", () => {
    cleanup();
    if (!electronProc.killed) electronProc.kill();
    process.exit(0);
  });

  electronProc.on("close", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((e) => {
  console.error("[electron:dev]", e.message);
  process.exit(1);
});
