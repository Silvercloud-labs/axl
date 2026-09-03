import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { Compiler } from "@silvercloudlabs/compiler";
// @ts-ignore
import { AxlEngine, BackendError } from "../packages/runtime/engine.js";
// @ts-ignore
import { InMemoryStateStore } from "../packages/runtime/state.js";
// @ts-ignore
import { loadManifest } from "../packages/runtime/manifest.js";

// PARALLEL — a block of steps that run concurrently.
//
// The block needs no new persisted state, and that is bought entirely by the compiler's
// restrictions: nothing inside can pause or branch, so the block is atomic as far as the
// engine's flat `remainingSteps` cursor is concerned.

const APP = { "app.flow": "APP T\nBASE_URL http://localhost:4999" };
const ACTIONS =
  'ACTION charge\n DESC "d"\n OUTPUT Null\n ENDPOINT POST /charge\n' +
  'ACTION reserve\n DESC "d"\n OUTPUT Null\n ENDPOINT POST /reserve\n' +
  'ACTION notify\n DESC "d"\n OUTPUT Null\n ENDPOINT POST /notify';
const PERMS = ["charge", "reserve", "notify"].map(a => `PERMISSION ${a} : PUBLIC`).join("\n");

const compile = (workflows: string, auth = PERMS) =>
  Compiler.compileFromSources({ ...APP, "actions.flow": ACTIONS, "auth.flow": auth, "workflows.flow": workflows });

const BLOCK = "WORKFLOW w\nPARALLEL\nSTEP charge\nSTEP reserve\nEND\nEND";

describe("PARALLEL — compiler", () => {
  it("compiles to its own step shape holding action steps", () => {
    const r = compile(BLOCK);
    expect(r.success).toBe(true);
    expect(r.manifest!.workflows[0]!.steps[0]).toEqual({
      parallel: [{ action: "charge" }, { action: "reserve" }]
    });
  });

  it("carries each member's USING/RETRY/TIMEOUT through", () => {
    const r = Compiler.compileFromSources({
      ...APP,
      "schema.flow": "ENTITY Order\n\nid : String",
      "actions.flow":
        'ACTION create\n DESC "d"\n OUTPUT Order\n ENDPOINT POST /c\n' +
        'ACTION charge\n DESC "d"\n INPUT\n  id : String OPTIONAL\n OUTPUT Null\n ENDPOINT POST /ch\n' +
        'ACTION reserve\n DESC "d"\n OUTPUT Null\n ENDPOINT POST /r',
      "auth.flow": "PERMISSION create : PUBLIC\nPERMISSION charge : PUBLIC\nPERMISSION reserve : PUBLIC",
      "workflows.flow":
        "WORKFLOW w\nSTEP create\nPARALLEL\nSTEP charge USING id = create.id RETRY 2\nSTEP reserve TIMEOUT 900\nEND\nEND",
    });
    expect(r.success).toBe(true);
    const block = r.manifest!.workflows[0]!.steps[1] as any;
    expect(block.parallel[0].retry).toBe(2);
    expect(block.parallel[0].bindings).toHaveLength(1);
    expect(block.parallel[1].timeout).toBe(900);
  });

  // The two restrictions that make the whole thing implementable. Each disallows an
  // ambiguous case rather than inventing a semantics for it.
  describe("restrictions", () => {
    it("rejects a CONFIRM-gated action inside the block (AXL381)", () => {
      const r = compile(
        "WORKFLOW w\nPARALLEL\nSTEP charge\nSTEP reserve\nEND\nEND",
        PERMS + "\nCONFIRM reserve : OTP"
      );
      expect(r.success).toBe(false);
      const d = r.diagnostics.find(x => x.code === "AXL381")!;
      expect(d.message).toMatch(/has CONFIRM and cannot run inside PARALLEL/);
      // The suggestion has to say what to do instead, not just what is wrong.
      expect(d.suggestion).toMatch(/Move "reserve" out of the block/);
    });

    it("rejects the same action twice in one block (AXL382)", () => {
      const r = compile("WORKFLOW w\nPARALLEL\nSTEP charge\nSTEP charge\nEND\nEND");
      expect(r.success).toBe(false);
      const d = r.diagnostics.find(x => x.code === "AXL382")!;
      expect(d.suggestion).toMatch(/race for one key/);
    });

    // The same action in two *different* blocks is fine -- the collision is per block.
    it("allows the same action in two separate blocks", () => {
      const r = compile(
        "WORKFLOW w\nPARALLEL\nSTEP charge\nSTEP reserve\nEND\n" +
        "PARALLEL\nSTEP charge\nSTEP notify\nEND\nEND"
      );
      expect(r.success).toBe(true);
    });

    it.each([
      ["WAIT 50"],
      ["IF charge.ok\nSTEP notify\nEND"],
      ["SWITCH charge.status\nCASE x\nSTEP notify\nEND"],
      ["PARALLEL\nSTEP notify\nSTEP charge\nEND"],
    ])("rejects nested control flow inside the block: %s", (inner) => {
      const r = compile(`WORKFLOW w\nPARALLEL\nSTEP charge\nSTEP reserve\n${inner}\nEND\nEND`);
      expect(r.success).toBe(false);
      expect(r.diagnostics.some(d => d.code === "AXL383")).toBe(true);
    });

    it.each([[0], [1]])("rejects a block with %i STEPs (AXL384)", (n) => {
      const body = n === 0 ? "" : "STEP charge\n";
      const r = compile(`WORKFLOW w\nPARALLEL\n${body}END\nEND`);
      expect(r.success).toBe(false);
      expect(r.diagnostics.some(d => d.code === "AXL384")).toBe(true);
    });

    it("rejects an unclosed block (AXL385)", () => {
      const r = compile("WORKFLOW w\nPARALLEL\nSTEP charge\nSTEP reserve");
      expect(r.success).toBe(false);
      expect(r.diagnostics.some(d => d.code === "AXL385")).toBe(true);
    });
  });

  // Members are dispatched together, so a sibling's output does not exist yet.
  describe("binding scope", () => {
    const withCreate = (wf: string) => Compiler.compileFromSources({
      ...APP,
      "schema.flow": "ENTITY Order\n\nid : String",
      "actions.flow":
        'ACTION create\n DESC "d"\n OUTPUT Order\n ENDPOINT POST /c\n' +
        'ACTION charge\n DESC "d"\n INPUT\n  id : String OPTIONAL\n OUTPUT Order\n ENDPOINT POST /ch\n' +
        'ACTION reserve\n DESC "d"\n INPUT\n  id : String OPTIONAL\n OUTPUT Null\n ENDPOINT POST /r',
      "auth.flow": "PERMISSION create : PUBLIC\nPERMISSION charge : PUBLIC\nPERMISSION reserve : PUBLIC",
      "workflows.flow": wf,
    });

    it("allows binding from a step before the block", () => {
      const r = withCreate(
        "WORKFLOW w\nSTEP create\nPARALLEL\nSTEP charge USING id = create.id\nSTEP reserve USING id = create.id\nEND\nEND"
      );
      expect(r.success).toBe(true);
    });

    it("rejects binding from a sibling in the same block", () => {
      const r = withCreate(
        "WORKFLOW w\nSTEP create\nPARALLEL\nSTEP charge USING id = create.id\nSTEP reserve USING id = charge.id\nEND\nEND"
      );
      expect(r.success).toBe(false);
      expect(r.diagnostics.some(d => d.code === "AXL335")).toBe(true);
    });

    it("allows binding from a block member after the block has closed", () => {
      const r = withCreate(
        "WORKFLOW w\nSTEP create\nPARALLEL\nSTEP charge USING id = create.id\nSTEP reserve USING id = create.id\nEND\n" +
        "STEP reserve USING id = charge.id\nEND"
      );
      expect(r.success).toBe(true);
    });
  });
});

// A real server, because the entire claim is about concurrency and only real sockets
// with real elapsed time can show it.
describe("PARALLEL — engine, against a real backend", () => {
  let server: http.Server;
  let baseUrl: string;
  /** Per-path handling: how long to hold, and whether to fail. */
  let holdMs: number;
  let failPaths: Set<string>;
  let arrivals: { path: string; at: number }[];
  let engine: AxlEngine;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      arrivals.push({ path: req.url!, at: Date.now() });
      req.resume();
      const fail = failPaths.has(req.url!);
      setTimeout(() => {
        if (fail) { res.writeHead(500, { "Content-Type": "application/json" }); res.end('{"err":1}'); return; }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ path: req.url, ok: true }));
      }, fail ? Math.min(holdMs, 60) : holdMs);
    });
    await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>(r => server.close(() => r())));

  const act = (p: string) => ({
    description: "d", input: {}, output: "Null",
    endpoint: { path: p, method: "POST" }, permission: "PUBLIC", confirm: null
  });

  const CTX = { ip: "1.1.1.1", sessionCookie: "s" };

  beforeEach(() => {
    holdMs = 300;
    failPaths = new Set();
    arrivals = [];
    engine = new AxlEngine({
      axl_version: "1.0",
      app: { name: "T", version: "1.0.0", base_url: baseUrl },
      actions: { charge: act("/charge"), reserve: act("/reserve"), notify: act("/notify") },
      resources: {},
      workflows: [
        { name: "par2", steps: [{ parallel: [{ action: "charge" }, { action: "reserve" }] }] },
        { name: "par3", steps: [{ parallel: [{ action: "charge" }, { action: "reserve" }, { action: "notify" }] }] },
        { name: "seq2", steps: ["charge", "reserve"] },
        { name: "mixed", steps: ["notify", { parallel: [{ action: "charge" }, { action: "reserve" }] }] },
      ],
      permissions: {}, rateLimits: {}
    }, new InMemoryStateStore());
  });

  afterEach(() => engine.destroy());

  it("runs the members concurrently, not one after another", async () => {
    const started = Date.now();
    const res = await engine.runWorkflow("par2", {}, CTX);
    const elapsed = Date.now() - started;

    expect(res.status).toBe("COMPLETED");
    // Two 300ms calls. Sequential would be ~600ms; concurrent is ~300ms. The bound is
    // generous enough not to be flaky but far below the sequential figure.
    expect(elapsed).toBeLessThan(500);
    expect(arrivals).toHaveLength(2);
    // Both requests must have left at essentially the same moment.
    expect(Math.abs(arrivals[1]!.at - arrivals[0]!.at)).toBeLessThan(80);
  });

  it("is measurably faster than the same two steps run sequentially", async () => {
    const t1 = Date.now();
    await engine.runWorkflow("par2", {}, CTX);
    const parallelMs = Date.now() - t1;

    const t2 = Date.now();
    await engine.runWorkflow("seq2", {}, CTX);
    const sequentialMs = Date.now() - t2;

    expect(sequentialMs - parallelMs).toBeGreaterThan(150);
  });

  it("does not get slower as members are added", async () => {
    const started = Date.now();
    await engine.runWorkflow("par3", {}, CTX);
    expect(Date.now() - started).toBeLessThan(500);
    expect(arrivals).toHaveLength(3);
  });

  it("records every member's output, keyed by action name", async () => {
    const res = await engine.runWorkflow("par3", {}, CTX);
    expect(Object.keys(res.finalResult).sort()).toEqual(["charge", "notify", "reserve"]);
  });

  it("runs a block that follows a sequential step", async () => {
    const res = await engine.runWorkflow("mixed", {}, CTX);
    expect(res.status).toBe("COMPLETED");
    expect(Object.keys(res.finalResult).sort()).toEqual(["charge", "notify", "reserve"]);
  });

  it("announces the block, with context", async () => {
    const seen: any[] = [];
    engine.on("event", (e: any) => { if (e.type.startsWith("parallel.")) seen.push(e); });
    await engine.runWorkflow("par2", {}, CTX);

    expect(seen.map(e => e.type)).toEqual(["parallel.started", "parallel.completed"]);
    expect(seen[0]!.data.actionNames).toEqual(["charge", "reserve"]);
    // The WS filter fails closed, so an event without context reaches nobody.
    expect(seen[0]!.data.context).toEqual(CTX);
  });

  describe("failure", () => {
    it("propagates the first failure and stops the workflow", async () => {
      failPaths.add("/reserve");
      await expect(engine.runWorkflow("par2", {}, CTX)).rejects.toThrow(BackendError);
    });

    // A caller reading only "Backend returned 500" would reasonably assume the block was
    // all-or-nothing. It is not, and there is no compensation mechanism, so the message
    // has to say which siblings committed.
    it("names the siblings that committed and were not rolled back", async () => {
      failPaths.add("/reserve");
      const err = await engine.runWorkflow("par2", {}, CTX).catch((e: any) => e);
      expect(err.message).toMatch(/charge already completed and was not rolled back/);
    });

    it("keeps the original diagnosis rather than replacing it", async () => {
      failPaths.add("/reserve");
      const err = await engine.runWorkflow("par2", {}, CTX).catch((e: any) => e);
      expect(err.message).toMatch(/Backend returned 500/);
    });

    it("does not annotate when no sibling had completed", async () => {
      // Everything fails, so nothing committed and there is nothing to warn about.
      failPaths.add("/charge");
      failPaths.add("/reserve");
      const err = await engine.runWorkflow("par2", {}, CTX).catch((e: any) => e);
      expect(err.message).not.toMatch(/not rolled back/);
    });

    // allSettled rather than Promise.all: `all` rejects immediately and leaves the
    // siblings running unobserved. This asserts the block waits for them to stop.
    it("waits for in-flight siblings before propagating", async () => {
      failPaths.add("/charge");
      const started = Date.now();
      await engine.runWorkflow("par2", {}, CTX).catch(() => {});
      // /charge fails fast (~60ms) but /reserve holds the full 300ms.
      expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    });
  });

  describe("idempotency", () => {
    it("lets both members execute under one workflow idempotency key", async () => {
      const hits: string[] = [];
      engine._executeHttp = async (name: string) => { hits.push(name); return { from: name }; };

      const res = await engine.runWorkflow("par2", {},
        { ip: "2.2.2.2", sessionCookie: "sess", idempotencyKey: "one-key" });

      expect(hits.sort()).toEqual(["charge", "reserve"]);
      expect(res.finalResult.charge.from).toBe("charge");
      expect(res.finalResult.reserve.from).toBe("reserve");
    });

    it("gives each member its own replay slot", () => {
      const ctx = { ip: "2.2.2.2", sessionCookie: "sess", idempotencyKey: "k" };
      const a = engine._idempotencyCacheKey("charge", ctx, "par0");
      const b = engine._idempotencyCacheKey("charge", ctx, "par1");
      const plain = engine._idempotencyCacheKey("charge", ctx);
      expect(a).not.toBe(b);
      // And a member is distinct from the same action used outside the block.
      expect(a).not.toBe(plain);
    });

    it("leaves an unscoped key exactly as it was", () => {
      const ctx = { ip: "2.2.2.2", sessionCookie: "sess", idempotencyKey: "k" };
      expect(engine._idempotencyCacheKey("charge", ctx)).toBe("2.2.2.2|sess:charge:k");
    });
  });

  it("fails the block without dispatching anything when a member's inputs are invalid", async () => {
    engine.manifest.actions.reserve.input = { needed: { type: "string", required: true } };
    engine.manifest.workflows.push({
      name: "bad_input", steps: [{ parallel: [{ action: "charge" }, { action: "reserve" }] }]
    });

    await expect(engine.runWorkflow("bad_input", {}, CTX)).rejects.toThrow(/invalid inputs/);
    // The point: `charge` must not have been fired at the backend first.
    expect(arrivals).toHaveLength(0);
  });
});

describe("PARALLEL — manifest load guard", () => {
  let dir: string;

  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "axl-par-")); });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const write = (steps: any[]) => {
    const file = path.join(dir, `m-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(file, JSON.stringify({
      app: { name: "T", base_url: "http://x" },
      actions: { a: {}, b: {} },
      workflows: [{ name: "w", steps }]
    }));
    return file;
  };

  it("rejects a block with fewer than two steps", () => {
    expect(() => loadManifest(write([{ parallel: [{ action: "a" }] }])))
      .toThrow(/fewer than two steps/);
  });

  it("rejects control flow inside a block", () => {
    expect(() => loadManifest(write([{ parallel: [{ action: "a" }, { wait: 50 }] }])))
      .toThrow(/is control flow, not an action step/);
  });

  it("rejects a duplicate action inside a block", () => {
    expect(() => loadManifest(write([{ parallel: [{ action: "a" }, { action: "a" }] }])))
      .toThrow(/repeats action "a"/);
  });

  it("accepts a well-formed block", () => {
    expect(() => loadManifest(write([{ parallel: [{ action: "a" }, { action: "b" }] }]))).not.toThrow();
  });

  it("names parallel among the valid step shapes when a step matches none", () => {
    expect(() => loadManifest(write([{ nonsense: true }])))
      .toThrow(/a parallel block \(needs "parallel"\)/);
  });
});
