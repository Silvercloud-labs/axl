import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { Compiler } from "@axl/compiler";
// @ts-ignore
import { AxlEngine, TimeoutError, BackendError } from "../packages/runtime/engine.js";
// @ts-ignore
import { InMemoryStateStore } from "../packages/runtime/state.js";
// @ts-ignore
import { loadManifest } from "../packages/runtime/manifest.js";

// `STEP <action> TIMEOUT <ms>` — a per-attempt deadline on the backend call.

const APP = { "app.flow": "APP T\nBASE_URL http://localhost:4999" };
const ACTIONS = 'ACTION a\n DESC "d"\n OUTPUT Null\n ENDPOINT POST /a';
const AUTH = "PERMISSION a : PUBLIC";

const compile = (workflows: string) =>
  Compiler.compileFromSources({ ...APP, "actions.flow": ACTIONS, "auth.flow": AUTH, "workflows.flow": workflows });

describe("TIMEOUT — compiler", () => {
  it("parses TIMEOUT onto the step", () => {
    const r = compile("WORKFLOW w\nSTEP a TIMEOUT 1500\nEND");
    expect(r.success).toBe(true);
    expect(r.manifest!.workflows[0]!.steps[0]).toEqual({ action: "a", timeout: 1500 });
  });

  // RETRY and TIMEOUT are independent modifiers, so requiring one fixed order between
  // them would be arbitrary. Only USING has to come first.
  it.each([
    ["RETRY 3 TIMEOUT 900"],
    ["TIMEOUT 900 RETRY 3"],
  ])("parses '%s' on one step", (mods) => {
    const r = compile(`WORKFLOW w\nSTEP a ${mods}\nEND`);
    expect(r.success).toBe(true);
    expect(r.manifest!.workflows[0]!.steps[0]).toEqual({ action: "a", retry: 3, timeout: 900 });
  });

  it("leaves a step with no modifiers as a bare string", () => {
    const r = compile("WORKFLOW w\nSTEP a\nEND");
    expect(r.manifest!.workflows[0]!.steps[0]).toBe("a");
  });

  it.each(["0", "-5"])("rejects TIMEOUT %s", (ms) => {
    const r = compile(`WORKFLOW w\nSTEP a TIMEOUT ${ms}\nEND`);
    expect(r.success).toBe(false);
    expect(r.diagnostics.some(d => d.code === "AXL372")).toBe(true);
  });

  it("rejects a duplicate TIMEOUT on one step", () => {
    const r = compile("WORKFLOW w\nSTEP a TIMEOUT 100 TIMEOUT 200\nEND");
    expect(r.diagnostics.some(d => d.code === "AXL373")).toBe(true);
  });
});

// A real server, not a stubbed _executeHttp: the whole point of TIMEOUT is that the
// request is genuinely aborted, and only a real socket can show that.
describe("TIMEOUT — engine, against a real slow backend", () => {
  let server: http.Server;
  let baseUrl: string;
  /** How long the handler sits on each request before answering. */
  let holdMs: number;
  let hits: number;
  /** Requests where the client went away before we answered. */
  let abortedByClient: number;
  /** Requests the server has not finished with yet. See settle(). */
  let inFlight: number;
  let engine: AxlEngine;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits++;
      inFlight++;
      let done = false;
      const timer = setTimeout(() => {
        done = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      }, holdMs);
      res.on("close", () => {
        if (!done) { abortedByClient++; clearTimeout(timer); }
        inFlight--;
      });
      req.resume();
    });
    // Port 0: several suites in this repo bind hardcoded ports and collide. Nothing
    // outside this file needs to reach this server, so let the OS pick.
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

  const action = () => ({
    description: "d", input: {}, output: "Null",
    endpoint: { path: "/a", method: "POST" }, permission: "PUBLIC", confirm: null
  });

  const CTX = { ip: "1.1.1.1", sessionCookie: "sid=a" };

  /**
   * Waits for the server to be done with every request before the next test resets the
   * counters. An abort is observed server-side a tick or two after the client gives up,
   * so without this a timed-out request from one test lands in the next one's tally.
   */
  async function settle() {
    for (let i = 0; i < 200 && inFlight > 0; i++) await new Promise(r => setTimeout(r, 10));
    await new Promise(r => setTimeout(r, 20));
  }

  beforeEach(() => {
    hits = 0;
    abortedByClient = 0;
    inFlight = 0;
    holdMs = 0;
    engine = new AxlEngine({
      axl_version: "1.0",
      app: { name: "T", version: "1.0.0", base_url: baseUrl },
      actions: { a: action() },
      resources: {},
      workflows: [
        { name: "fast_deadline", steps: [{ action: "a", timeout: 120 }] },
        { name: "roomy_deadline", steps: [{ action: "a", timeout: 3000 }] },
        { name: "no_deadline", steps: [{ action: "a" }] },
        { name: "retry_and_timeout", steps: [{ action: "a", retry: 3, timeout: 120 }] },
      ],
      permissions: {}, rateLimits: {}
    }, new InMemoryStateStore());
  });

  afterEach(async () => {
    engine.destroy();
    await settle();
  });

  it("passes a response that beats the deadline straight through", async () => {
    holdMs = 10;
    const res = await engine.runWorkflow("roomy_deadline", {}, CTX);
    expect(res.status).toBe("COMPLETED");
    expect(abortedByClient).toBe(0);
  });

  it("throws TimeoutError when the backend is slower than the deadline", async () => {
    holdMs = 3000;
    await expect(engine.runWorkflow("fast_deadline", {}, CTX)).rejects.toThrow(TimeoutError);
  });

  it("reports the declared deadline on the error, not a bare message", async () => {
    holdMs = 3000;
    const err = await engine.runWorkflow("fast_deadline", {}, CTX).catch((e: any) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err.timeoutMs).toBe(120);
  });

  // The behaviour that separates a real deadline from a Promise.race one: the request
  // must actually be cancelled, or every timed-out call leaks a connection.
  it("actually aborts the in-flight request", async () => {
    holdMs = 3000;
    await engine.runWorkflow("fast_deadline", {}, CTX).catch(() => {});
    // The abort is observed by the server asynchronously; wait for it to land.
    await settle();
    expect(hits).toBe(1);
    expect(abortedByClient).toBe(1);
  });

  // A TimeoutError is NOT a BackendError -- see the class comment. A caller reading
  // err.status off it would get undefined on a field that means "what the backend said".
  it("does not classify a timeout as a BackendError", async () => {
    holdMs = 3000;
    const err = await engine.runWorkflow("fast_deadline", {}, CTX).catch((e: any) => e);
    expect(err).not.toBeInstanceOf(BackendError);
  });

  it("leaves a step with no TIMEOUT waiting on the backend", async () => {
    holdMs = 400;
    const res = await engine.runWorkflow("no_deadline", {}, CTX);
    expect(res.status).toBe("COMPLETED");
    expect(abortedByClient).toBe(0);
  });

  describe("composed with RETRY", () => {
    it("gives each attempt its own deadline", async () => {
      holdMs = 3000;
      const started = Date.now();
      await expect(engine.runWorkflow("retry_and_timeout", {}, CTX)).rejects.toThrow(TimeoutError);
      // Three attempts, each of which must have waited out its own 120ms rather than
      // sharing one budget. 360ms of deadline + 2 x 250ms of retry delay.
      expect(hits).toBe(3);
      expect(Date.now() - started).toBeGreaterThanOrEqual(360 + 500);
    });

    it("aborts every attempt, not just the last", async () => {
      holdMs = 3000;
      await engine.runWorkflow("retry_and_timeout", {}, CTX).catch(() => {});
      await settle();
      expect(abortedByClient).toBe(3);
    });

    it("recovers when an attempt finally beats the deadline", async () => {
      holdMs = 3000;
      // Let the third attempt through by shortening the hold once two have failed.
      const relax = setInterval(() => { if (hits >= 2) { holdMs = 5; clearInterval(relax); } }, 20);
      const res = await engine.runWorkflow("retry_and_timeout", {}, CTX);
      clearInterval(relax);
      expect(res.status).toBe("COMPLETED");
      expect(hits).toBe(3);
    });
  });
});

// A real temp file rather than vi.mock("fs"): mocking fs module-wide from a file that
// also stands up an HTTP server has bitten this suite before.
describe("TIMEOUT — manifest load guard", () => {
  let dir: string;

  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "axl-timeout-")); });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const write = (steps: any[]) => {
    const file = path.join(dir, `m-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(file, JSON.stringify({
      app: { name: "T", base_url: "http://x" },
      actions: { a: {} },
      workflows: [{ name: "w", steps }]
    }));
    return file;
  };

  // A hand-edited or generated manifest is the only way an invalid timeout gets this
  // far -- the compiler rejects it. Failing at load beats failing mid-run.
  it.each([[0], [-1], [1.5], ["500"]])("rejects timeout %s at load", (bad) => {
    expect(() => loadManifest(write([{ action: "a", timeout: bad }])))
      .toThrow(/invalid "timeout"/);
  });

  it("accepts a whole number of milliseconds", () => {
    expect(() => loadManifest(write([{ action: "a", timeout: 500 }]))).not.toThrow();
  });
});

// Transport mapping. A deadline that expires must look like a gateway timeout on REST
// and carry its own code on MCP -- not get folded into BACKEND_ERROR, which would give
// clients a `status` field with nothing in it.
describe("TIMEOUT — transport mapping", () => {
  let backend: http.Server;
  let dir: string;
  let server: any;
  const PORT = 3996;

  beforeAll(async () => {
    // A backend that never answers within the deadline the manifest declares.
    backend = http.createServer((req, res) => {
      req.resume();
      setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); }, 5000);
    });
    await new Promise<void>(resolve => backend.listen(0, "127.0.0.1", resolve));
    const backendPort = (backend.address() as AddressInfo).port;

    dir = fs.mkdtempSync(path.join(os.tmpdir(), "axl-timeout-serve-"));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
      axl_version: "1.0",
      app: { name: "TimeoutApp", version: "1.0.0", base_url: `http://127.0.0.1:${backendPort}` },
      entities: [],
      actions: {
        slow: {
          description: "never answers in time", input: {}, output: "Null",
          endpoint: { method: "POST", path: "/slow" }, permission: "PUBLIC", confirm: null
        }
      },
      resources: {},
      workflows: [{ name: "slow_wf", steps: [{ action: "slow", timeout: 100 }] }],
      permissions: { slow: "PUBLIC" },
      rateLimits: {}
    }));

    const { serve } = await import("../packages/cli/serve.js");
    server = await serve(dir, { port: PORT });
  }, 30000);

  afterAll(async () => {
    await server.close();
    await new Promise<void>(resolve => backend.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("MCP reports its own TIMEOUT code, not BACKEND_ERROR", async () => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    // @ts-ignore
    const { buildAxlServer } = await import("../packages/runtime/axl-server.js");

    const built = buildAxlServer(path.join(dir, "manifest.json"), { stateStore: new InMemoryStateStore() });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "timeout-test", version: "1.0" });
    await Promise.all([client.connect(clientTransport), built.server.connect(serverTransport)]);

    try {
      const res: any = await client.callTool({ name: "run_workflow", arguments: { workflowName: "slow_wf" } });
      expect(res.isError).toBe(true);
      const body = JSON.parse(res.content[0].text);
      expect(body.error).toBe("TIMEOUT");
      expect(body.timeout_ms).toBe(100);
      // Not the WORKFLOW_ERROR catch-all, and not BACKEND_ERROR with an absent status.
      expect(body.status).toBeUndefined();
    } finally {
      built.engine?.destroy?.();
      await client.close();
    }
  }, 20000);

  it("REST answers 504 TIMEOUT as application/problem+json", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/workflows/slow_wf`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    expect(res.status).toBe(504);
    expect(res.headers.get("content-type")).toMatch(/application\/problem\+json/);

    const body = await res.json();
    expect(body.type).toBe("TIMEOUT");
    expect(body.status).toBe(504);
    expect(body.timeout_ms).toBe(100);
    // Never the redacted 500 text: a timeout is a classified, expected failure.
    expect(body.detail).toMatch(/within 100ms/);
  }, 20000);
});

// A step that pauses for OTP confirmation executes inside confirmAction, not back in
// the step loop, so its RETRY/TIMEOUT have to be handed down explicitly. Without that
// they were silently dropped for exactly the steps most likely to declare them.
describe("modifiers survive a CONFIRM pause", () => {
  let engine: AxlEngine;
  let calls: any[];

  const CTX = { ip: "1.1.1.1", sessionCookie: "sid=a" };

  beforeEach(() => {
    calls = [];
    engine = new AxlEngine({
      axl_version: "1.0",
      app: { name: "T", version: "1.0.0", base_url: "http://127.0.0.1:1" },
      actions: {
        gated: {
          description: "d", input: {}, output: "Null",
          endpoint: { path: "/g", method: "POST" }, permission: "PUBLIC", confirm: "OTP"
        }
      },
      resources: {},
      workflows: [{ name: "gated_wf", steps: [{ action: "gated", retry: 3, timeout: 750 }] }],
      permissions: {}, rateLimits: {}
    }, new InMemoryStateStore());
  });

  afterEach(() => engine.destroy());

  async function pauseAndGetToken() {
    const paused = await engine.runWorkflow("gated_wf", {}, CTX);
    expect(paused.confirmationRequired).toBe(true);
    const pending = await engine.state.get("pendingConfirmations", paused.token);
    return { token: paused.token, otp: pending.otp };
  }

  it("hands the step's TIMEOUT down to the confirmed execution", async () => {
    engine._executeHttp = async (_n: string, _d: any, _a: any, _c: any, options: any) => {
      calls.push(options);
      return { ok: true };
    };
    const { token, otp } = await pauseAndGetToken();
    const res = await engine.resumeWorkflow(token, otp, CTX);

    expect(res.status).toBe("COMPLETED");
    expect(calls).toHaveLength(1);
    expect(calls[0].timeoutMs).toBe(750);
  });

  it("hands the step's RETRY down too", async () => {
    engine._executeHttp = async (_n: string, _d: any, _a: any, _c: any, options: any) => {
      calls.push(options);
      if (calls.length < 3) throw new TimeoutError("too slow", 750);
      return { ok: true };
    };
    const { token, otp } = await pauseAndGetToken();
    const res = await engine.resumeWorkflow(token, otp, CTX);

    expect(res.status).toBe("COMPLETED");
    expect(calls).toHaveLength(3);
  });

  // A direct confirm_action call has no step behind it, so nothing to hand down --
  // it must stay a single attempt with no deadline.
  it("leaves a direct confirm_action at one attempt with no deadline", async () => {
    engine._executeHttp = async (_n: string, _d: any, _a: any, _c: any, options: any) => {
      calls.push(options);
      throw new TimeoutError("too slow", 750);
    };
    const paused = await engine.execute("gated", {}, CTX);
    const pending = await engine.state.get("pendingConfirmations", paused.token);

    await expect(engine.confirmAction(paused.token, pending.otp, CTX)).rejects.toThrow(TimeoutError);
    expect(calls).toHaveLength(1);
    expect(calls[0].timeoutMs).toBeUndefined();
  });
});
