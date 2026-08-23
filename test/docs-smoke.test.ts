import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMOKE_DIR = path.join(__dirname, "../smoke-test-dir");
const PORT = 3939;
const STARTUP_TIMEOUT_MS = 30_000;

/**
 * Polls /health until the server answers, instead of sleeping a fixed 2000ms.
 *
 * Cold start was measured at ~2473ms on this machine, so the old fixed wait was
 * already losing the race roughly as often as it won it -- and on a slower or
 * loaded runner it lost every time.
 */
async function waitForHealthy(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Server did not become healthy within ${timeoutMs}ms. Last error: ${lastError}`);
}

describe("Docs Smoke Test", () => {
  let serverProcess: any;

  beforeAll(async () => {
    // Cleanup if exists
    if (fs.existsSync(SMOKE_DIR)) {
      fs.rmSync(SMOKE_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SMOKE_DIR);

    // 1. axl init
    execSync("npx tsx ../packages/cli/index.ts init -y", { cwd: SMOKE_DIR, stdio: "ignore" });

    // 2. axl compile
    execSync("npx tsx ../packages/cli/index.ts compile", { cwd: SMOKE_DIR, stdio: "ignore" });

    // 3. axl serve
    //
    // `detached: true` puts the server in its own process group so afterAll can signal
    // the whole group. Without it, kill() reached only the `npx` wrapper and the actual
    // `node ... serve` grandchild survived -- observed on Linux still holding port 3939
    // more than 40 minutes after the run that started it, which then made an unrelated
    // check report the wrong project name. This was previously believed to be
    // Windows-specific; it is not.
    const { spawn } = await import("node:child_process");
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    serverProcess = spawn(npx, ["tsx", "../packages/cli/index.ts", "serve", "--port", PORT.toString()], {
      cwd: SMOKE_DIR,
      stdio: "ignore",
      detached: process.platform !== "win32",
      shell: process.platform === "win32"
    });

    await waitForHealthy(`http://localhost:${PORT}/health`, STARTUP_TIMEOUT_MS);
  }, STARTUP_TIMEOUT_MS + 60_000);

  afterAll(async () => {
    if (serverProcess && serverProcess.exitCode === null) {
      const exited = new Promise<void>(resolve => serverProcess.once("exit", () => resolve()));
      try {
        if (process.platform === "win32") {
          serverProcess.kill();
        } else {
          // Negative PID signals the entire process group, so the node grandchild goes
          // with the npx wrapper. SIGKILL rather than SIGTERM: this is teardown, and a
          // server that ignores the polite signal is exactly the leak being fixed.
          process.kill(-serverProcess.pid, "SIGKILL");
        }
      } catch {
        // Already gone.
      }
      // Wait for the reap before removing the directory -- deleting a tree the server
      // still has open is where the EBUSY failures came from.
      await Promise.race([exited, new Promise(r => setTimeout(r, 5000))]);
    }

    if (fs.existsSync(SMOKE_DIR)) {
      try {
        fs.rmSync(SMOKE_DIR, { recursive: true, force: true });
      } catch (e) {
        // Ignore EBUSY on Windows
      }
    }
  });

  it("successfully responds to /health on default port 3939", async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBeDefined();
    expect(body.version).toBeDefined();
    expect(body.axl_version).toBeDefined();
  });
});
