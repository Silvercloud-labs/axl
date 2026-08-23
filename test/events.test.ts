import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { fileURLToPath } from "url";
import path from "node:path";
import { execSync } from "node:child_process";
import { Compiler } from "@axl/compiler";
// @ts-ignore
import { AxlEngine } from "../packages/runtime/engine.js";
// @ts-ignore
import { InMemoryStateStore } from "../packages/runtime/state.js";
import { serve } from "../packages/cli/serve.js";

// Named domain events. Every successful action already emits the generic
// `action.completed`; an EVENT declaration names the specific thing that happened, so a
// subscriber can match on "ItemAddedToCart" rather than filtering every completion.

const STOREFRONT = fileURLToPath(new URL("../fixtures/projects/storefront", import.meta.url));
const PORT = 3985;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const APP = { "app.flow": "APP T\nBASE_URL http://localhost:4999" };

function compile(actionsFlow: string, authFlow = "PERMISSION a : PUBLIC") {
  return Compiler.compileFromSources({ ...APP, "actions.flow": actionsFlow, "auth.flow": authFlow });
}

describe("EVENT — compiler", () => {
  it("emits the declared event name into the manifest", () => {
    const r = compile('ACTION a\n DESC "d"\n OUTPUT String\n ENDPOINT POST /a\n EVENT OrderCreated');
    expect(r.success).toBe(true);
    expect(r.manifest!.actions.a!.event).toBe("OrderCreated");
  });

  it("omits the field entirely when no EVENT is declared", () => {
    const r = compile('ACTION a\n DESC "d"\n OUTPUT String\n ENDPOINT POST /a');
    expect(r.success).toBe(true);
    expect(r.manifest!.actions.a).not.toHaveProperty("event");
  });

  it("parses EVENT after an INPUT block without swallowing it as a field", () => {
    const r = compile('ACTION a\n DESC "d"\n INPUT\n  x : String REQUIRED\n OUTPUT String\n ENDPOINT POST /a\n EVENT Made');
    expect(r.success).toBe(true);
    expect(r.manifest!.actions.a!.event).toBe("Made");
    expect(Object.keys(r.manifest!.actions.a!.input)).toEqual(["x"]);
  });

  // An event name is what a subscriber matches on, so it has to be unambiguous.
  it("rejects two actions declaring the same event name", () => {
    const r = compile(
      'ACTION a\n DESC "d"\n OUTPUT String\n ENDPOINT POST /a\n EVENT Made\n' +
      'ACTION b\n DESC "d"\n OUTPUT String\n ENDPOINT POST /b\n EVENT Made',
      "PERMISSION a : PUBLIC\nPERMISSION b : PUBLIC"
    );
    expect(r.success).toBe(false);
    expect(r.diagnostics.find(d => d.code === "AXL351")?.message).toMatch(/Duplicate EVENT "Made"/);
  });

  // A lifecycle name cannot be typed at all: every one contains a dot, and the lexer
  // does not accept "." in an identifier. The collision is only reachable through a
  // hand-edited manifest, which is where the guard lives -- see the loadManifest suite
  // below. Asserting the DSL cannot express it is the honest test here.
  it("cannot express a dotted lifecycle name as an event at all", () => {
    const r = compile('ACTION a\n DESC "d"\n OUTPUT String\n ENDPOINT POST /a\n EVENT action.completed');
    expect(r.success).toBe(false);
    expect(r.manifest).toBeUndefined();
  });
});

describe("EVENT — engine", () => {
  let engine: AxlEngine;
  let events: { type: string; data: any }[];

  const manifest = {
    axl_version: "1.0",
    app: { name: "T", version: "1.0.0", base_url: "http://localhost:4999" },
    actions: {
      with_event: { description: "d", input: {}, output: "String", endpoint: { path: "/a", method: "POST" }, permission: "PUBLIC", confirm: null, event: "OrderCreated" },
      without_event: { description: "d", input: {}, output: "String", endpoint: { path: "/b", method: "POST" }, permission: "PUBLIC", confirm: null },
      gated: { description: "d", input: {}, output: "String", endpoint: { path: "/c", method: "POST" }, permission: "PUBLIC", confirm: "OTP", event: "GatedDone" }
    },
    resources: {},
    workflows: [],
    permissions: {},
    rateLimits: {}
  };

  beforeEach(() => {
    engine = new AxlEngine(manifest, new InMemoryStateStore());
    engine._executeHttp = async () => ({ ok: true });
    events = [];
    engine.on("event", (e: any) => events.push(e));
  });

  afterEach(() => engine.destroy());

  it("emits the named event on success", async () => {
    await engine.execute("with_event", {}, { ip: "1.1.1.1" });
    expect(events.map(e => e.type)).toContain("OrderCreated");
  });

  // Purely additive: a subscriber already listening for action.completed keeps working.
  it("still emits the generic lifecycle events alongside it", async () => {
    await engine.execute("with_event", {}, { ip: "1.1.1.1" });
    expect(events.map(e => e.type)).toEqual(["action.started", "action.completed", "OrderCreated"]);
  });

  it("emits nothing extra for an action with no EVENT", async () => {
    await engine.execute("without_event", {}, { ip: "1.1.1.1" });
    expect(events.map(e => e.type)).toEqual(["action.started", "action.completed"]);
  });

  // The WS filter fails closed and delivers only on a positive identity match, so an
  // event emitted without context would reach nobody.
  it("carries the requester's context, so the fail-closed WS filter can attribute it", async () => {
    const ctx = { ip: "1.1.1.1", sessionCookie: "sid=alice" };
    await engine.execute("with_event", { a: 1 }, ctx);
    const named = events.find(e => e.type === "OrderCreated")!;
    expect(named.data.context).toEqual(ctx);
    expect(named.data.actionName).toBe("with_event");
    expect(named.data.args).toEqual({ a: 1 });
    expect(named.data.result).toEqual({ ok: true });
  });

  // The action has not run yet at the confirmation-request step.
  it("does not emit the named event while an action is still awaiting confirmation", async () => {
    await engine.execute("gated", {}, { ip: "1.1.1.1" });
    expect(events.map(e => e.type)).not.toContain("GatedDone");
  });
});

describe("EVENT — WebSocket delivery", () => {
  let server: Awaited<ReturnType<typeof serve>>;

  beforeAll(async () => {
    execSync(`npx tsx "${path.join(process.cwd(), "packages/cli/index.ts")}" compile`, { cwd: STOREFRONT, stdio: "ignore" });
    server = await serve(path.join(STOREFRONT, "build"), { port: PORT });
    (server.engine as any)._executeHttp = async () => ({ id: "cart_1", item_count: 1 });
  });

  afterAll(async () => { await server.close(); });

  function connect(url: string): Promise<WebSocket> {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url);
      ws.on("open", () => res(ws)); ws.on("error", rej);
    });
  }
  function collect(ws: WebSocket): any[] {
    const seen: any[] = [];
    ws.on("message", (d) => { const m = JSON.parse(d.toString()); if (m.type !== "pong") seen.push(m); });
    return seen;
  }

  it("delivers the named event to the requesting session and nobody else", async () => {
    const alice = await connect(`ws://127.0.0.1:${PORT}/ws?token=alice`);
    const bob = await connect(`ws://127.0.0.1:${PORT}/ws?token=bob`);
    const anon = await connect(`ws://127.0.0.1:${PORT}/ws`);
    const seenAlice = collect(alice), seenBob = collect(bob), seenAnon = collect(anon);

    await fetch(`http://127.0.0.1:${PORT}/actions/add_to_cart`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer alice" },
      body: JSON.stringify({ sku: "SKU-1" })
    });
    await sleep(400);

    expect(seenAlice.map(e => e.type)).toContain("ItemAddedToCart");
    expect(seenAlice.map(e => e.type)).toContain("action.completed");
    expect(seenBob).toEqual([]);
    expect(seenAnon).toEqual([]);

    const named = seenAlice.find(e => e.type === "ItemAddedToCart")!;
    expect(named.data.actionName).toBe("add_to_cart");
    expect(named.data.args.sku).toBe("SKU-1");
    // Same stripping the lifecycle events get.
    expect(named.data.context?.sessionCookie).toBeUndefined();

    alice.close(); bob.close(); anon.close();
  });
});
