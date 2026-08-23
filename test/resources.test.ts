import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
// @ts-ignore
import { AxlEngine, NotFoundError, PermissionError, RateLimitError } from "../packages/runtime/engine.js";
// @ts-ignore
import { InMemoryStateStore } from "../packages/runtime/state.js";
// @ts-ignore
import { buildAxlServer, resourceUri } from "../packages/runtime/axl-server.js";
import { serve } from "../packages/cli/serve.js";

// The integration fixture project. Tests used to compile the repository root,
// which required the root to be an AXL project -- moving that project out is
// what this constant replaces.
const FIXTURE_PROJECT = fileURLToPath(new URL("../fixtures/projects/taskdeck", import.meta.url));

// Coverage for the RESOURCE primitive: read-only, non-mutating state exposure.
// The single architectural gap all three independent audits agreed on.

const STOREFRONT = fileURLToPath(new URL("../fixtures/projects/storefront", import.meta.url));
const STOREFRONT_MANIFEST = path.join(STOREFRONT, "build", "manifest.json");
const PORT = 3982;

const manifest = {
  axl_version: "1.0",
  app: { name: "T", version: "1.0.0", base_url: "http://localhost:4999" },
  actions: {
    add_to_cart: { description: "a", input: {}, output: "Cart", endpoint: { path: "/cart/items", method: "POST" }, permission: "AUTH", confirm: null }
  },
  resources: {
    cart: { description: "The cart", output: "Cart", endpoint: { path: "/cart", method: "GET" }, permission: "AUTH" },
    store_status: { description: "Open?", output: "String", endpoint: { path: "/status", method: "GET" }, permission: "PUBLIC" }
  },
  workflows: [],
  permissions: {},
  rateLimits: { store_status: "3/min" }
};

describe("RESOURCE — compiler", () => {
  let compiled: any;

  beforeAll(() => {
    execSync(`npx tsx "${path.join(process.cwd(), "packages/cli/index.ts")}" compile`, {
      cwd: STOREFRONT, stdio: "ignore"
    });
    compiled = JSON.parse(fs.readFileSync(STOREFRONT_MANIFEST, { encoding: "utf-8" }));
  });

  it("emits resources into their own manifest block", () => {
    expect(Object.keys(compiled.resources).sort()).toEqual(["cart", "store_status"]);
    expect(compiled.resources.cart).toEqual({
      description: "The current user's shopping cart, including item count and total",
      output: "Cart",
      endpoint: { method: "GET", path: "/cart" },
      permission: "AUTH"
    });
  });

  // The separation that makes every downstream isolation guarantee free.
  it("keeps resources out of the actions map and actions out of the resources map", () => {
    const actionNames = Object.keys(compiled.actions);
    const resourceNames = Object.keys(compiled.resources);

    expect(actionNames).toContain("add_to_cart");
    // The property, not a fixed list -- the fixture grows as other primitives get
    // coverage, and asserting an exact roster makes this test everyone else's problem.
    expect(actionNames.filter(n => resourceNames.includes(n))).toEqual([]);
    expect(compiled.actions.cart).toBeUndefined();
    expect(compiled.resources.add_to_cart).toBeUndefined();
  });

  it("carries the declared permission through, per resource", () => {
    expect(compiled.resources.cart.permission).toBe("AUTH");
    expect(compiled.resources.store_status.permission).toBe("PUBLIC");
  });

  it("has no input or confirm field — a resource has neither", () => {
    expect(compiled.resources.cart).not.toHaveProperty("input");
    expect(compiled.resources.cart).not.toHaveProperty("confirm");
  });

  it("applies RATE_LIMIT to a resource", () => {
    expect(compiled.rateLimits.store_status).toBe("5/min");
  });
});

describe("RESOURCE — engine", () => {
  let engine: AxlEngine;
  let state: InMemoryStateStore;
  let calls: { name: string; args: any }[];

  beforeEach(() => {
    state = new InMemoryStateStore();
    engine = new AxlEngine(manifest, state);
    calls = [];
    engine._executeHttp = async (name: string, def: any, args: any) => {
      calls.push({ name, args });
      return { name, read: calls.length };
    };
  });

  afterEach(() => engine.destroy());

  it("reads a PUBLIC resource with no session", async () => {
    await expect(engine.readResource("store_status", { ip: "1.1.1.1" })).resolves.toMatchObject({ name: "store_status" });
  });

  it("denies an AUTH resource without a session", async () => {
    await expect(engine.readResource("cart", { ip: "1.1.1.1" })).rejects.toThrow(PermissionError);
  });

  it("reads an AUTH resource with a session", async () => {
    await expect(engine.readResource("cart", { ip: "1.1.1.1", sessionCookie: "sid=a" }))
      .resolves.toMatchObject({ name: "cart" });
  });

  it("passes no args to the backend — a resource takes none", async () => {
    await engine.readResource("store_status", { ip: "1.1.1.1" });
    expect(calls[0]!.args).toEqual({});
  });

  describe("primitive isolation", () => {
    it("cannot read an action as a resource", async () => {
      await expect(engine.readResource("add_to_cart", { ip: "1.1.1.1", sessionCookie: "sid=a" }))
        .rejects.toThrow(NotFoundError);
    });

    it("cannot execute a resource as an action", async () => {
      await expect(engine.execute("cart", {}, { ip: "1.1.1.1", sessionCookie: "sid=a" }))
        .rejects.toThrow(NotFoundError);
    });

    // Same Object.prototype hazard getActionDef had: a bare lookup resolves inherited
    // members as truthy definitions and surfaces as a 500 instead of a 404.
    it.each(["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"])(
      "returns NotFound for the inherited property %j", async (name) => {
        await expect(engine.readResource(name, { ip: "1.1.1.1" })).rejects.toThrow(NotFoundError);
      });

    it("returns NotFound when the manifest predates resources entirely", async () => {
      const legacy = new AxlEngine({ ...manifest, resources: undefined }, new InMemoryStateStore());
      await expect(legacy.readResource("cart", { ip: "1.1.1.1" })).rejects.toThrow(NotFoundError);
      legacy.destroy();
    });
  });

  describe("idempotency is deliberately not applied", () => {
    // The cache exists to stop a retry causing a second side effect. A read has none,
    // and its 24-hour TTL would serve a stale value for something defined as live.
    it("hits the backend on every read, even with one Idempotency-Key", async () => {
      const ctx = { ip: "1.1.1.1", sessionCookie: "sid=a", idempotencyKey: "same" };
      const first = await engine.readResource("cart", ctx);
      const second = await engine.readResource("cart", ctx);

      expect(calls).toHaveLength(2);
      expect(first.read).toBe(1);
      expect(second.read).toBe(2);
    });

    it("writes no idempotency cache entry", async () => {
      await engine.readResource("cart", { ip: "1.1.1.1", sessionCookie: "sid=a", idempotencyKey: "same" });
      expect((state as any).namespaces.get("idempotencyCache")).toBeUndefined();
    });
  });

  describe("rate limiting is deliberately applied", () => {
    // Idempotent says nothing about cheap: a PUBLIC resource is an unauthenticated
    // proxy to the backend.
    it("enforces RATE_LIMIT on reads", async () => {
      const ctx = { ip: "9.9.9.9" };
      await engine.readResource("store_status", ctx);
      await engine.readResource("store_status", ctx);
      await engine.readResource("store_status", ctx);
      await expect(engine.readResource("store_status", ctx)).rejects.toThrow(RateLimitError);
    });

    it("does not let one exhausted resource block another", async () => {
      const ctx = { ip: "9.9.9.8", sessionCookie: "sid=a" };
      for (let i = 0; i < 3; i++) await engine.readResource("store_status", ctx);
      await expect(engine.readResource("store_status", ctx)).rejects.toThrow(RateLimitError);
      await expect(engine.readResource("cart", ctx)).resolves.toBeTruthy();
    });

    it("isolates the quota per source IP", async () => {
      for (let i = 0; i < 3; i++) await engine.readResource("store_status", { ip: "9.9.9.7" });
      await expect(engine.readResource("store_status", { ip: "9.9.9.7" })).rejects.toThrow(RateLimitError);
      await expect(engine.readResource("store_status", { ip: "9.9.9.6" })).resolves.toBeTruthy();
    });
  });
});

describe("RESOURCE — MCP", () => {
  let client: Client;
  let engine: AxlEngine;

  beforeAll(async () => {
    const built = buildAxlServer(STOREFRONT_MANIFEST, { stateStore: new InMemoryStateStore() });
    engine = built.engine;
    engine._executeHttp = async (name: string) => ({ resource: name, live: true });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "resource-test", version: "1.0" });
    await Promise.all([client.connect(clientTransport), built.server.connect(serverTransport)]);
  });

  afterAll(async () => {
    engine?.destroy?.();
    await client?.close?.();
  });

  it("advertises the resources capability", () => {
    expect(client.getServerCapabilities()?.resources).toBeDefined();
  });

  it("resources/list returns the right shape", async () => {
    const { resources } = await client.listResources();
    expect(resources.map(r => r.name).sort()).toEqual(["cart", "store_status"]);

    const cart = resources.find(r => r.name === "cart")!;
    expect(cart.uri).toBe("axl://resource/cart");
    expect(cart.mimeType).toBe("application/json");
    expect(cart.description).toMatch(/shopping cart/);
  });

  // The core of the primitive: a read is a resource, not a zero-argument tool.
  it("exposes resources as resources and actions as tools, never crossed", async () => {
    const toolNames = (await client.listTools()).tools.map(t => t.name);
    const resourceNames = (await client.listResources()).resources.map(r => r.name);

    expect(toolNames).toContain("add_to_cart");
    expect(toolNames).not.toContain("cart");
    expect(toolNames).not.toContain("store_status");
    expect(resourceNames).not.toContain("add_to_cart");
  });

  it("resources/read returns the live value as JSON", async () => {
    const res = await client.readResource({ uri: resourceUri("store_status") });
    expect(res.contents).toHaveLength(1);
    expect(res.contents[0]!.uri).toBe("axl://resource/store_status");
    expect(res.contents[0]!.mimeType).toBe("application/json");
    expect(JSON.parse(res.contents[0]!.text as string)).toEqual({ resource: "store_status", live: true });
  });

  it("rejects an unknown resource uri", async () => {
    await expect(client.readResource({ uri: "axl://resource/nope" })).rejects.toThrow();
  });

  it("cannot read an action through resources/read", async () => {
    await expect(client.readResource({ uri: resourceUri("add_to_cart") })).rejects.toThrow();
  });
});

describe("RESOURCE — REST", () => {
  let server: Awaited<ReturnType<typeof serve>>;

  beforeAll(async () => {
    server = await serve(path.join(STOREFRONT, "build"), { port: PORT });
    (server.engine as any)._executeHttp = async (name: string) => ({ resource: name, live: true });
  });

  afterAll(async () => { await server.close(); });

  const get = (p: string, token?: string) =>
    fetch(`http://127.0.0.1:${PORT}${p}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it("GET /resources/:name reads a PUBLIC resource without a session", async () => {
    const res = await get("/resources/store_status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resource: "store_status", live: true });
  });

  it("denies an AUTH resource without a session", async () => {
    const res = await get("/resources/cart");
    expect(res.status).toBe(403);
    expect((await res.json()).type).toBe("PERMISSION_DENIED");
  });

  it("reads an AUTH resource with a session", async () => {
    const res = await get("/resources/cart", "sess");
    expect(res.status).toBe(200);
  });

  it("returns 404 for an unknown resource", async () => {
    const res = await get("/resources/nope");
    expect(res.status).toBe(404);
    expect((await res.json()).type).toBe("NOT_FOUND");
  });

  it("returns 404, not 500, for an inherited Object.prototype name", async () => {
    expect((await get("/resources/constructor")).status).toBe(404);
  });

  it("does not expose a resource through /actions/", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/actions/cart`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer sess" },
      body: "{}"
    });
    expect(res.status).toBe(404);
    expect((await res.json()).type).toBe("NOT_FOUND");
  });

  it("does not expose an action through /resources/", async () => {
    expect((await get("/resources/add_to_cart", "sess")).status).toBe(404);
  });

  // GET-only is structural: no other verb is registered on the path.
  it.each(["POST", "PUT", "PATCH", "DELETE"])("refuses %s on a resource path", async (method) => {
    const res = await fetch(`http://127.0.0.1:${PORT}/resources/store_status`, {
      method, headers: { "Content-Type": "application/json" },
      ...(method === "POST" || method === "PUT" || method === "PATCH" ? { body: "{}" } : {})
    });
    expect(res.status).toBe(404);
  });

  it("advertises capabilities.resources true when the manifest has resources", async () => {
    const body = await (await fetch(`http://127.0.0.1:${PORT}/.well-known/mcp`)).json();
    expect(body.capabilities.resources).toBe(true);
  });
});

// The capability is derived, not flipped. Advertising `true` on a server whose
// resources/list is empty is a claim a client will act on and find false.
describe("RESOURCE — capability advertisement is derived, not hardcoded", () => {
  const NO_RESOURCE_PORT = 3983;
  let server: Awaited<ReturnType<typeof serve>>;

  beforeAll(async () => {
    // The root project declares no resources at all.
    execSync("npx tsx ../../../packages/cli/index.ts compile", { cwd: FIXTURE_PROJECT, stdio: "ignore" });
    server = await serve(fileURLToPath(new URL("../fixtures/projects/taskdeck/build", import.meta.url)), { port: NO_RESOURCE_PORT });
  });

  afterAll(async () => { await server.close(); });

  it("reports resources false for a project with none", async () => {
    const body = await (await fetch(`http://127.0.0.1:${NO_RESOURCE_PORT}/.well-known/mcp`)).json();
    expect(body.capabilities.resources).toBe(false);
    expect(body.capabilities.tools).toBe(true);
  });

  it("serves an empty resources map rather than omitting the key", async () => {
    const body = await (await fetch(`http://127.0.0.1:${NO_RESOURCE_PORT}/manifest.json`)).json();
    expect(body.resources).toEqual({});
  });

  it("still 404s a resource read on a project with none", async () => {
    const res = await fetch(`http://127.0.0.1:${NO_RESOURCE_PORT}/resources/anything`);
    expect(res.status).toBe(404);
  });
});
