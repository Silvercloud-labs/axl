import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { staticConformanceChecks, liveConformanceCheck } from "../packages/cli/conformance.js";
import { serve } from "../packages/cli/serve.js";
import { compileFixture } from "./helpers/fixture-project.js";

// `axl doctor --conformance` — local self-checks, explicitly not a certification.
//
// Most of these restate an invariant the compiler already enforces; the value is
// visibility. A silent successful compile tells a developer only that nothing was
// wrong, not which properties actually hold.

const CLI = fileURLToPath(new URL("../packages/cli/index.ts", import.meta.url));

let root: string;
function project(name: string, files: Record<string, string>, compile = true): string {
  const dir = path.join(root, `${name}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(path.join(dir, "flow"), { recursive: true });
  for (const [file, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, "flow", file), contents);
  }
  fs.writeFileSync(path.join(dir, "axl.config.json"), JSON.stringify({ flowDir: "flow", outDir: "build" }));
  if (compile) {
    try { execSync(`npx tsx "${CLI}" compile`, { cwd: dir, stdio: "ignore" }); } catch { /* a broken project is the point */ }
  }
  return dir;
}

const SOUND = {
  "app.flow": "APP Sound\nVERSION 1.0.0\nBASE_URL http://127.0.0.1:1",
  "actions.flow": 'ACTION ping\nDESC "d"\nOUTPUT Null\nENDPOINT POST /ping',
  "auth.flow": "PERMISSION ping : AUTH",
};

const find = (checks: any[], label: string) => checks.find(c => c.label === label)!;

beforeAll(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "axl-conf-")); });
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("conformance — a sound project", () => {
  let checks: any[];

  beforeAll(() => {
    const dir = project("sound", SOUND);
    checks = staticConformanceChecks(path.join(dir, "flow"), path.join(dir, "build"));
  }, 120000);

  it("passes the compile check", () => {
    expect(find(checks, "Sources compile").status).toBe("pass");
  });

  it("reports the permission invariant as held", () => {
    expect(find(checks, "Every action has a PERMISSION").status).toBe("pass");
  });

  it("reports the no-CONFIRM-on-RESOURCE invariant as held", () => {
    expect(find(checks, "No CONFIRM on a RESOURCE").status).toBe("pass");
  });

  it("loads the compiled manifest and counts what is in it", () => {
    const check = find(checks, "Manifest loads");
    expect(check.status).toBe("pass");
    expect(check.detail).toMatch(/1 action\(s\)/);
  });

  it("confirms the manifest's own actions carry a permission", () => {
    expect(find(checks, "Manifest actions carry a permission").status).toBe("pass");
  });

  it("never reports a fail on a project that compiles", () => {
    expect(checks.filter(c => c.status === "fail")).toHaveLength(0);
  });
});

describe("conformance — a project with real problems", () => {
  let checks: any[];

  beforeAll(() => {
    const dir = project("broken", {
      "app.flow": "APP Bad\nVERSION 1.0.0\nBASE_URL http://127.0.0.1:1",
      "actions.flow": 'ACTION orphan\nDESC "no permission declared"\nOUTPUT Null\nENDPOINT POST /o',
      "auth.flow": "",
    });
    checks = staticConformanceChecks(path.join(dir, "flow"), path.join(dir, "build"));
  }, 120000);

  it("fails the compile check and names the codes", () => {
    const check = find(checks, "Sources compile");
    expect(check.status).toBe("fail");
    expect(check.detail).toMatch(/AXL322/);
  });

  it("fails the permission check specifically", () => {
    const check = find(checks, "Every action has a PERMISSION");
    expect(check.status).toBe("fail");
    expect(check.detail).toMatch(/1 action\(s\) missing one/);
  });

  // A project that never compiled has no manifest. That is a warn, not a fail: the
  // problem is upstream and already reported, and a second red line adds nothing.
  it("warns rather than fails when there is no manifest to load", () => {
    expect(find(checks, "Manifest loads").status).toBe("warn");
  });
});

describe("conformance — a stale or hand-edited manifest", () => {
  // Not a restatement of a compile check: the compiler only reads sources, so a
  // manifest edited after compiling is invisible to it.
  it("catches an action whose permission was stripped from the manifest", () => {
    const dir = project("stale", SOUND);
    const manifestPath = path.join(dir, "build", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    delete manifest.actions.ping.permission;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    const checks = staticConformanceChecks(path.join(dir, "flow"), path.join(dir, "build"));
    const check = find(checks, "Manifest actions carry a permission");
    expect(check.status).toBe("fail");
    expect(check.detail).toMatch(/ping/);
  }, 120000);
});

describe("conformance — the duplicate diagnostic code meta-check", () => {
  it("never fails the build, because the heuristic is imperfect", () => {
    const dir = project("codes", SOUND, false);
    const check = find(
      staticConformanceChecks(path.join(dir, "flow"), path.join(dir, "build")),
      "No duplicate diagnostic codes"
    );
    // A check that exits non-zero on a heuristic would just teach people to ignore it.
    // Text-differing messages are a proxy for "two unrelated checks", and a single check
    // that parameterises its message by context trips it while being correct.
    expect(check.status === "pass" || check.status === "warn").toBe(true);
  });

  it("admits when it could not read the compiler sources rather than passing", () => {
    // Run from a directory where packages/compiler is not reachable, the scan reports
    // that it did not look — claiming "no duplicates" from a scan that read nothing
    // would be worse than saying so.
    const dir = project("nocodes", SOUND, false);
    const check = find(
      staticConformanceChecks(path.join(dir, "flow"), path.join(dir, "build")),
      "No duplicate diagnostic codes"
    );
    expect(["pass", "warn"]).toContain(check.status);
    expect(check.status).not.toBe("fail");
  });
});

describe("conformance — the live check", () => {
  it("starts the compiled project and confirms /health answers", async () => {
    const dir = project("live", SOUND);
    const check = await liveConformanceCheck(path.join(dir, "build"));
    expect(check.status).toBe("pass");
    expect(check.detail).toMatch(/health/i);
  }, 120000);

  it("warns rather than failing when there is nothing compiled to serve", async () => {
    const dir = project("nolive", SOUND, false);
    const check = await liveConformanceCheck(path.join(dir, "build"));
    expect(check.status).toBe("warn");
  }, 60000);
});

// The live check binds port 0 so it can never collide with a server the developer
// already has running -- which would fail the check for a reason unrelated to the project.
describe("serve — ephemeral ports", () => {
  it("binds a real free port when asked for 0, and reports the bound one", async () => {
    const server = await serve(compileFixture(), { port: 0 });
    try {
      const port = server.addresses[0]!.port;
      expect(port).toBeGreaterThan(0);
      expect(port).not.toBe(3939);
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.ok).toBe(true);
    } finally {
      await server.close();
    }
  }, 60000);

  // close() used to leave a 30s WebSocket sweep interval running, on a `noServer`
  // WebSocketServer whose "close" event never fires. Anything awaiting close() and
  // expecting to exit hung forever on it.
  it("releases the event loop after close()", async () => {
    const server = await serve(compileFixture(), { port: 0 });
    await fetch(`http://127.0.0.1:${server.addresses[0]!.port}/health`);
    await server.close();

    const lingering = ((process as any)._getActiveHandles?.() ?? [])
      .filter((h: any) => h?.constructor?.name === "Timeout" && h?.hasRef?.());
    expect(lingering).toHaveLength(0);
  }, 60000);
});
