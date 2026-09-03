import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Compiler } from "@silvercloudlabs/compiler";
// @ts-ignore
import { AxlEngine, BackendError, ValidationError, RateLimitError } from "../packages/runtime/engine.js";
// @ts-ignore
import { InMemoryStateStore } from "../packages/runtime/state.js";

// `STEP <action> RETRY <n>` — optional per-step retry on backend failure.

const APP = { "app.flow": "APP T\nBASE_URL http://localhost:4999" };
const ACTIONS = 'ACTION a\n DESC "d"\n INPUT\n  x : String OPTIONAL\n OUTPUT Null\n ENDPOINT POST /a';
const AUTH = "PERMISSION a : PUBLIC";

const compile = (workflows: string) =>
  Compiler.compileFromSources({ ...APP, "actions.flow": ACTIONS, "auth.flow": AUTH, "workflows.flow": workflows });

describe("RETRY — compiler", () => {
  it("parses RETRY onto the step", () => {
    const r = compile("WORKFLOW w\nSTEP a RETRY 3\nEND");
    expect(r.success).toBe(true);
    expect(r.manifest!.workflows[0]!.steps[0]).toEqual({ action: "a", retry: 3 });
  });

  // Grammar order is fixed: STEP <action> [USING …] [RETRY n].
  it("parses RETRY after USING bindings", () => {
    const r = Compiler.compileFromSources({
      ...APP,
      // `a` must output an entity, not Null -- you cannot bind a field off a primitive.
      "schema.flow": "ENTITY Thing\n\nid : String",
      "actions.flow":
        'ACTION a\n DESC "d"\n OUTPUT Thing\n ENDPOINT POST /a\n' +
        'ACTION b\n DESC "d"\n INPUT\n  x : String OPTIONAL\n OUTPUT Null\n ENDPOINT POST /b',
      "auth.flow": "PERMISSION a : PUBLIC\nPERMISSION b : PUBLIC",
      "workflows.flow": "WORKFLOW w\nSTEP a\nSTEP b USING x = a.id RETRY 2\nEND"
    });
    expect(r.success).toBe(true);
    const step = r.manifest!.workflows[0]!.steps[1] as any;
    expect(step.action).toBe("b");
    expect(step.retry).toBe(2);
    expect(step.bindings).toHaveLength(1);
  });

  // A workflow using neither bindings nor modifiers must still compile to a bare
  // string, so existing manifests are byte-identical.
  it("leaves a plain step as a bare string", () => {
    const r = compile("WORKFLOW w\nSTEP a\nEND");
    expect(r.manifest!.workflows[0]!.steps[0]).toBe("a");
  });

  it.each(["0", "-1"])("rejects RETRY %s", (n) => {
    const r = compile(`WORKFLOW w\nSTEP a RETRY ${n}\nEND`);
    expect(r.success).toBe(false);
  });

  it("rejects a duplicate RETRY on one step", () => {
    const r = compile("WORKFLOW w\nSTEP a RETRY 2 RETRY 3\nEND");
    expect(r.diagnostics.some(d => d.code === "AXL371")).toBe(true);
  });
});

describe("RETRY — engine", () => {
  let engine: AxlEngine;
  let attempts: number;
  let retryEvents: any[];

  const action = (confirm: string | null = null, input: any = {}) => ({
    description: "d", input, output: "Null",
    endpoint: { path: "/a", method: "POST" }, permission: "PUBLIC", confirm
  });

  const manifest = {
    axl_version: "1.0",
    app: { name: "T", version: "1.0.0", base_url: "http://localhost:4999" },
    actions: {
      a: action(),
      gated: action("OTP"),
      needs_input: action(null, { need: { type: "string", required: true } })
    },
    resources: {},
    workflows: [
      { name: "retry3", steps: [{ action: "a", retry: 3 }] },
      { name: "no_retry", steps: [{ action: "a" }] },
      { name: "retry1", steps: [{ action: "a", retry: 1 }] },
      { name: "gated_retry", steps: [{ action: "gated", retry: 3 }] },
      { name: "bad_input", steps: [{ action: "needs_input", retry: 3 }] }
    ],
    permissions: {}, rateLimits: {}
  };

  const CTX = { ip: "1.1.1.1", sessionCookie: "sid=a" };

  /** Fails the first `failures` attempts with `err`, then succeeds. */
  function backendFailing(failures: number, err: () => Error) {
    attempts = 0;
    engine._executeHttp = async () => {
      attempts++;
      if (attempts <= failures) throw err();
      return { ok: true, attempts };
    };
  }

  beforeEach(() => {
    engine = new AxlEngine(manifest, new InMemoryStateStore());
    attempts = 0;
    retryEvents = [];
    engine.on("event", (e: any) => { if (e.type === "step.retrying") retryEvents.push(e.data); });
  });
  afterEach(() => engine.destroy());

  it("succeeds when the backend recovers within the retry budget", async () => {
    backendFailing(2, () => new BackendError("503", 503, {}));
    const res = await engine.runWorkflow("retry3", {}, CTX);
    expect(res.status).toBe("COMPLETED");
    expect(attempts).toBe(3);
  });

  it("propagates a real failure once the budget is exhausted", async () => {
    backendFailing(99, () => new BackendError("503", 503, {}));
    await expect(engine.runWorkflow("retry3", {}, CTX)).rejects.toThrow(BackendError);
    expect(attempts).toBe(3);
  });

  it("emits a retry event per re-attempt, with attempt numbers", async () => {
    backendFailing(2, () => new BackendError("503", 503, {}));
    await engine.runWorkflow("retry3", {}, CTX);
    expect(retryEvents.map(e => `${e.attempt}/${e.of}`)).toEqual(["1/3", "2/3"]);
    expect(retryEvents[0]!.actionName).toBe("a");
    // Carries context like every other event, so the fail-closed WS filter can place it.
    expect(retryEvents[0]!.context).toEqual(CTX);
  });

  it.each([["no_retry"], ["retry1"]])("%s attempts exactly once", async (wf) => {
    backendFailing(99, () => new BackendError("503", 503, {}));
    await expect(engine.runWorkflow(wf, {}, CTX)).rejects.toThrow(BackendError);
    expect(attempts).toBe(1);
  });

  // Retrying a request the backend will reject identically just fails N times slower.
  describe("only retries what a retry could plausibly fix", () => {
    it("does not retry a ValidationError", async () => {
      backendFailing(99, () => new ValidationError("bad"));
      await expect(engine.runWorkflow("retry3", {}, CTX)).rejects.toThrow(ValidationError);
      expect(attempts).toBe(1);
    });

    // Retrying into a limit you have already exceeded is the one thing guaranteed to
    // keep you over it.
    it("does not retry a RateLimitError", async () => {
      backendFailing(99, () => new RateLimitError("slow down"));
      await expect(engine.runWorkflow("retry3", {}, CTX)).rejects.toThrow(RateLimitError);
      expect(attempts).toBe(1);
    });

    it("never reaches the backend at all for an invalid step input", async () => {
      engine._executeHttp = async () => { attempts++; return { ok: true }; };
      await expect(engine.runWorkflow("bad_input", {}, CTX)).rejects.toThrow();
      expect(attempts).toBe(0);
    });
  });

  // execute() *returns* a confirmationRequired envelope rather than throwing, so a pause
  // exits the retry loop as a first-attempt success. This test exists so a future
  // refactor that starts throwing on pause cannot silently turn a human approval gate
  // into N automatic retries.
  it("does not retry past a CONFIRM/OTP pause", async () => {
    engine._executeHttp = async () => { attempts++; return { ok: true }; };
    const res = await engine.runWorkflow("gated_retry", {}, CTX);
    expect(res.confirmationRequired).toBe(true);
    expect(attempts).toBe(0);
    expect(retryEvents).toEqual([]);
  });

  it("waits between attempts rather than hammering", async () => {
    backendFailing(2, () => new BackendError("503", 503, {}));
    const started = Date.now();
    await engine.runWorkflow("retry3", {}, CTX);
    // Two delays between three attempts. Generous lower bound so this is not flaky.
    expect(Date.now() - started).toBeGreaterThanOrEqual(400);
  });
});
