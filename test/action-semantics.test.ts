import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Compiler } from "@silvercloudlabs/compiler";
// @ts-ignore
import { buildAxlServer, toolDescription } from "../packages/runtime/axl-server.js";
// @ts-ignore
import { InMemoryStateStore } from "../packages/runtime/state.js";

// IRREVERSIBLE / EFFECTS / SIDE_EFFECTS — optional declarative metadata describing what
// an action does to the world, as opposed to how it is invoked.
//
// The point is the MCP surface: an autonomous caller can read "irreversible" and decide
// to ask a human first. It cannot infer that from an HTTP method.

const APP = { "app.flow": "APP T\nVERSION 1.0.0\nBASE_URL http://localhost:4999" };
const SCHEMA = "ENTITY Order\n\nid : String\nstatus : String";

const compile = (actions: string, auth: string, extra: Record<string, string> = {}) =>
  Compiler.compileFromSources({ ...APP, "schema.flow": SCHEMA, "actions.flow": actions, "auth.flow": auth, ...extra });

const CANCEL = [
  "ACTION cancel_order",
  'DESC "Cancel an existing customer order"',
  "IRREVERSIBLE true",
  'EFFECTS "order.status -> CANCELLED"',
  'SIDE_EFFECTS "a refund may be initiated"',
  "INPUT",
  "id : String REQUIRED",
  "OUTPUT Order",
  "ENDPOINT POST /orders/{id}/cancel",
].join("\n");

const PLAIN = [
  "ACTION list_orders",
  'DESC "List orders"',
  "OUTPUT List<Order>",
  "ENDPOINT GET /orders",
].join("\n");

const AUTH = "PERMISSION cancel_order : PUBLIC\nPERMISSION list_orders : PUBLIC";

describe("action semantics — compiler", () => {
  it("carries all three fields into the manifest", () => {
    const r = compile(`${CANCEL}\n\n${PLAIN}`, AUTH);
    expect(r.success).toBe(true);
    const action = r.manifest!.actions.cancel_order as any;
    expect(action.irreversible).toBe(true);
    expect(action.effects).toBe("order.status -> CANCELLED");
    expect(action.side_effects).toBe("a refund may be initiated");
  });

  // The compatibility guarantee: an action that declares none of this must produce the
  // exact manifest shape it always did, not the same shape with three undefineds in it.
  it("emits no new keys at all for an action that declares none", () => {
    const r = compile(PLAIN, "PERMISSION list_orders : PUBLIC");
    const keys = Object.keys(r.manifest!.actions.list_orders).sort();
    expect(keys).toEqual(["confirm", "description", "endpoint", "input", "output", "permission"]);
  });

  it("accepts IRREVERSIBLE false and records it as false, not absent", () => {
    const r = compile(
      'ACTION a\nDESC "d"\nIRREVERSIBLE false\nOUTPUT Null\nENDPOINT POST /a',
      "PERMISSION a : PUBLIC"
    );
    expect(r.success).toBe(true);
    expect((r.manifest!.actions.a as any).irreversible).toBe(false);
  });

  it("accepts the fields in any order relative to the rest of the action", () => {
    const r = compile(
      'ACTION a\nIRREVERSIBLE true\nDESC "d"\nOUTPUT Null\nEFFECTS "x"\nENDPOINT POST /a',
      "PERMISSION a : PUBLIC"
    );
    expect(r.success).toBe(true);
    expect((r.manifest!.actions.a as any).irreversible).toBe(true);
    expect((r.manifest!.actions.a as any).effects).toBe("x");
  });

  // An INPUT block is terminated by the keyword that follows it; without these three in
  // that terminator set, a declaration after INPUT falls through parseInputFields.
  it("terminates an INPUT block correctly when a consequence field follows it", () => {
    const r = compile(
      'ACTION a\nDESC "d"\nINPUT\nx : String REQUIRED\nIRREVERSIBLE true\nOUTPUT Null\nENDPOINT POST /a',
      "PERMISSION a : PUBLIC"
    );
    expect(r.success).toBe(true);
    expect(Object.keys((r.manifest!.actions.a as any).input)).toEqual(["x"]);
    expect((r.manifest!.actions.a as any).irreversible).toBe(true);
  });

  // Forgiving parsing is exactly wrong for a field whose job is warning a caller off a
  // destructive action -- `IRREVERSIBLE yes` must not quietly mean true.
  it.each(["yes", "1", '"true"'])("rejects IRREVERSIBLE %s", (value) => {
    const r = compile(
      `ACTION a\nDESC "d"\nIRREVERSIBLE ${value}\nOUTPUT Null\nENDPOINT POST /a`,
      "PERMISSION a : PUBLIC"
    );
    expect(r.success).toBe(false);
    expect(r.diagnostics.some(d => d.code === "AXL386")).toBe(true);
  });

  // A resource is read-only, so none of these has anything to describe. Accepting and
  // ignoring them would leave an author believing they had documented a consequence --
  // the same reasoning that makes CONFIRM on a resource an error rather than a no-op.
  it.each([
    ["IRREVERSIBLE true"],
    ['EFFECTS "x"'],
    ['SIDE_EFFECTS "x"'],
  ])("rejects %s on a RESOURCE", (line) => {
    const r = compile(PLAIN, "PERMISSION list_orders : PUBLIC\nPERMISSION cart : PUBLIC", {
      "resources.flow": `RESOURCE cart\nDESC "d"\n${line}\nOUTPUT Order\nENDPOINT GET /cart`,
    });
    expect(r.success).toBe(false);
    const d = r.diagnostics.find(x => x.code === "AXL387")!;
    expect(d).toBeDefined();
    expect(d.message).toMatch(/read-only and have no consequences to declare/);
  });
});

describe("action semantics — MCP tool descriptions", () => {
  let client: Client;
  let engine: any;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "axl-semantics-"));
    const r = compile(`${CANCEL}\n\n${PLAIN}`, AUTH);
    const manifestPath = path.join(dir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(r.manifest));

    const built = buildAxlServer(manifestPath, { stateStore: new InMemoryStateStore() });
    engine = built.engine;
    const [ct, st] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "semantics-test", version: "1.0" });
    await Promise.all([client.connect(ct), built.server.connect(st)]);
  });

  afterAll(async () => {
    engine?.destroy?.();
    await client?.close?.();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("tells a calling model the action is irreversible", async () => {
    const { tools } = await client.listTools();
    const cancel = tools.find(t => t.name === "cancel_order")!;
    expect(cancel.description).toMatch(/IRREVERSIBLE: this action cannot be undone/);
  });

  it("passes the declared effects and side effects through", async () => {
    const { tools } = await client.listTools();
    const cancel = tools.find(t => t.name === "cancel_order")!;
    expect(cancel.description).toContain("order.status -> CANCELLED");
    expect(cancel.description).toContain("a refund may be initiated");
  });

  it("leaves an action that declares none exactly as it was", async () => {
    const { tools } = await client.listTools();
    const list = tools.find(t => t.name === "list_orders")!;
    expect(list.description).toBe("List orders");
  });
});

describe("action semantics — description assembly", () => {
  it("leads with irreversibility, since that is what should change the decision", () => {
    const text = toolDescription({
      description: "Do it", irreversible: true, effects: "a", side_effects: "b", confirm: "OTP",
    });
    expect(text.indexOf("IRREVERSIBLE")).toBeLessThan(text.indexOf("Effects"));
    expect(text.indexOf("Effects")).toBeLessThan(text.indexOf("Side effects"));
  });

  it("keeps the existing CONFIRM suffix unchanged", () => {
    expect(toolDescription({ description: "Do it", confirm: "OTP" }))
      .toBe("Do it (requires human confirmation before executing)");
  });

  it("says nothing when irreversible is explicitly false", () => {
    expect(toolDescription({ description: "Do it", irreversible: false })).toBe("Do it");
  });
});
