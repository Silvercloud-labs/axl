import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Compiler } from "@axl/compiler";
// @ts-ignore
import { AxlEngine } from "../packages/runtime/engine.js";
// @ts-ignore
import { InMemoryStateStore } from "../packages/runtime/state.js";
// @ts-ignore
import { loadManifest } from "../packages/runtime/manifest.js";

// `WAIT <ms>` — a fixed pause between two steps.

const APP = { "app.flow": "APP T\nBASE_URL http://localhost:4999" };
const ACTIONS = 'ACTION a\n DESC "d"\n OUTPUT Null\n ENDPOINT POST /a';
const AUTH = "PERMISSION a : PUBLIC";

const compile = (workflows: string) =>
  Compiler.compileFromSources({ ...APP, "actions.flow": ACTIONS, "auth.flow": AUTH, "workflows.flow": workflows });

describe("WAIT — compiler", () => {
  it("compiles to its own step shape, not an action step", () => {
    const r = compile("WORKFLOW w\nSTEP a\nWAIT 250\nSTEP a\nEND");
    expect(r.success).toBe(true);
    expect(r.manifest!.workflows[0]!.steps).toEqual(["a", { wait: 250 }, "a"]);
  });

  it("is allowed as the only step", () => {
    const r = compile("WORKFLOW w\nWAIT 10\nEND");
    expect(r.success).toBe(true);
    expect(r.manifest!.workflows[0]!.steps).toEqual([{ wait: 10 }]);
  });

  it("is allowed inside an IF branch", () => {
    const r = compile("WORKFLOW w\nSTEP a\nIF a.ok\nWAIT 50\nEND\nEND");
    expect(r.success).toBe(true);
    const branch = r.manifest!.workflows[0]!.steps[1] as any;
    expect(branch.then).toEqual([{ wait: 50 }]);
  });

  // The scope boundary, enforced rather than documented. An event-based WAIT needs a
  // durable scheduler and a resume trigger; parsing it into something that quietly
  // means "pause 0ms" would be worse than rejecting it.
  it.each([
    ["WAIT FOR payment_confirmed"],
    ["WAIT payment_confirmed"],
    ["WAIT UNTIL ready"],
  ])("rejects the event-based form: %s", (line) => {
    const r = compile(`WORKFLOW w\n${line}\nEND`);
    expect(r.success).toBe(false);
    const d = r.diagnostics.find(x => x.code === "AXL374")!;
    expect(d).toBeDefined();
    expect(d.message).toMatch(/fixed duration in milliseconds/);
    expect(d.message).toMatch(/not supported/);
  });

  it.each(["0", "-5"])("rejects WAIT %s", (ms) => {
    const r = compile(`WORKFLOW w\nWAIT ${ms}\nEND`);
    expect(r.success).toBe(false);
    // -5 lexes as a dash before a number, so it never reaches the range check; either
    // diagnostic is a correct rejection.
    expect(r.diagnostics.some(d => d.code === "AXL374" || d.code === "AXL375")).toBe(true);
  });

  // A rejected WAIT must not leave the parser sitting on the offending token. Before
  // the explicit consume, a malformed WAIT spun parseSteps.
  it("keeps parsing after a bad WAIT instead of hanging", () => {
    const r = compile("WORKFLOW w\nWAIT nope\nSTEP a\nEND");
    expect(r.success).toBe(false);
    expect(r.diagnostics.some(d => d.code === "AXL374")).toBe(true);
  });
});

describe("WAIT — engine", () => {
  let engine: AxlEngine;
  let order: string[];
  let waitEvents: any[];

  const action = () => ({
    description: "d", input: {}, output: "Null",
    endpoint: { path: "/a", method: "POST" }, permission: "PUBLIC", confirm: null
  });

  const CTX = { ip: "1.1.1.1", sessionCookie: "sid=a" };

  beforeEach(() => {
    order = [];
    waitEvents = [];
    engine = new AxlEngine({
      axl_version: "1.0",
      app: { name: "T", version: "1.0.0", base_url: "http://127.0.0.1:1" },
      actions: { a: action(), b: action() },
      resources: {},
      workflows: [
        { name: "paused", steps: ["a", { wait: 300 }, "b"] },
        { name: "wait_only", steps: [{ wait: 200 }] },
        { name: "no_wait", steps: ["a", "b"] },
      ],
      permissions: {}, rateLimits: {}
    }, new InMemoryStateStore());

    engine._executeHttp = async (name: string) => { order.push(name); return { ok: true }; };
    engine.on("event", (e: any) => { if (e.type === "workflow.waiting") waitEvents.push(e.data); });
  });

  afterEach(() => engine.destroy());

  it("pauses between steps and then carries on", async () => {
    const started = Date.now();
    const res = await engine.runWorkflow("paused", {}, CTX);
    const elapsed = Date.now() - started;

    expect(res.status).toBe("COMPLETED");
    expect(order).toEqual(["a", "b"]);
    expect(elapsed).toBeGreaterThanOrEqual(280);
  });

  it("does not slow a workflow that declares no WAIT", async () => {
    const started = Date.now();
    await engine.runWorkflow("no_wait", {}, CTX);
    expect(Date.now() - started).toBeLessThan(100);
  });

  it("completes a workflow whose only step is a wait", async () => {
    const res = await engine.runWorkflow("wait_only", {}, CTX);
    expect(res.status).toBe("COMPLETED");
    expect(order).toEqual([]);
  });

  // A multi-second silence is otherwise indistinguishable from a hang, and the
  // WebSocket filter fails closed, so the event has to carry context or reach nobody.
  it("announces the wait, with context", async () => {
    await engine.runWorkflow("paused", {}, CTX);
    expect(waitEvents).toHaveLength(1);
    expect(waitEvents[0].durationMs).toBe(300);
    expect(waitEvents[0].workflowName).toBe("paused");
    expect(waitEvents[0].context).toEqual(CTX);
  });

  it("does not record a step output for a wait", async () => {
    const res = await engine.runWorkflow("paused", {}, CTX);
    expect(Object.keys(res.finalResult).sort()).toEqual(["a", "b"]);
  });
});

describe("WAIT — manifest load guard", () => {
  let dir: string;

  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "axl-wait-")); });
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

  it.each([[0], [-1], [2.5], ["300"], [null]])("rejects wait %s at load", (bad) => {
    expect(() => loadManifest(write([{ wait: bad }]))).toThrow(/invalid "wait"/);
  });

  it("accepts a whole number of milliseconds", () => {
    expect(() => loadManifest(write([{ wait: 300 }]))).not.toThrow();
  });

  // The "malformed step" message is what someone hand-editing a manifest reads, so it
  // has to name every shape that is actually accepted.
  it("names wait among the valid step shapes when a step matches none", () => {
    expect(() => loadManifest(write([{ nonsense: true }]))).toThrow(/a wait \(needs "wait"\)/);
  });
});
