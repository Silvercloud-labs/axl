import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import path from "node:path";
import { execSync } from "node:child_process";
import { Compiler } from "@silvercloudlabs/compiler";
// @ts-ignore
import { AxlEngine, PermissionError } from "../packages/runtime/engine.js";
// @ts-ignore
import { InMemoryStateStore } from "../packages/runtime/state.js";
import { serve } from "../packages/cli/serve.js";

// ROLE and OWNER permission levels.
//
// The security posture these tests exist to pin down: AXL never validates the bearer
// token, so anything an ordinary client sends is attacker-controlled. Identity claims
// are honoured ONLY under an explicit operator opt-in asserting a trusted gateway
// injects them. With the flag off, ROLE and OWNER deny everything.

const STOREFRONT = fileURLToPath(new URL("../fixtures/projects/storefront", import.meta.url));

function compile(auth: string, actions?: string) {
  return Compiler.compileFromSources({
    "app.flow": "APP T\nBASE_URL http://localhost:4999",
    "actions.flow": actions ?? 'ACTION a\n DESC "d"\n INPUT\n  user_id : String REQUIRED\n OUTPUT String\n ENDPOINT POST /a',
    "auth.flow": auth
  });
}

describe("ROLE/OWNER — compiler", () => {
  it("encodes ROLE and its argument into the permission string", () => {
    const r = compile("PERMISSION a : ROLE admin");
    expect(r.success).toBe(true);
    expect(r.manifest!.actions.a!.permission).toBe("ROLE:admin");
    expect(r.manifest!.permissions.a).toBe("ROLE:admin");
  });

  it("encodes OWNER and its argument", () => {
    const r = compile("PERMISSION a : OWNER user_id");
    expect(r.success).toBe(true);
    expect(r.manifest!.actions.a!.permission).toBe("OWNER:user_id");
  });

  // PUBLIC and AUTH must keep their exact previous values -- `permission` is a
  // published field and only the two new levels introduce the ":" form.
  it.each(["PUBLIC", "AUTH"])("leaves %s unchanged", (level) => {
    const r = compile(`PERMISSION a : ${level}`);
    expect(r.manifest!.actions.a!.permission).toBe(level);
  });

  // A name that is not an input can never match, so the action would be permanently
  // denied -- a bug that otherwise only surfaces in production.
  it("rejects OWNER naming something that is not an input of the action", () => {
    const r = compile("PERMISSION a : OWNER nope");
    expect(r.success).toBe(false);
    expect(r.diagnostics.find(d => d.code === "AXL363")?.message).toMatch(/is not a declared INPUT/);
  });

  it("suggests the right input name on a typo", () => {
    const r = compile("PERMISSION a : OWNER user_di");
    expect(r.diagnostics.find(d => d.code === "AXL363")?.suggestion).toBe('Did you mean "user_id"?');
  });

  it("rejects OWNER on a resource, which has no inputs to compare against", () => {
    const r = Compiler.compileFromSources({
      "app.flow": "APP T\nBASE_URL http://localhost:4999",
      "resources.flow": 'RESOURCE c\n DESC "d"\n OUTPUT String\n ENDPOINT GET /c',
      "auth.flow": "PERMISSION c : OWNER user_id"
    });
    expect(r.success).toBe(false);
    expect(r.diagnostics.find(d => d.code === "AXL362")?.message).toMatch(/not valid on a resource/);
  });

  it("allows ROLE on a resource", () => {
    const r = Compiler.compileFromSources({
      "app.flow": "APP T\nBASE_URL http://localhost:4999",
      "resources.flow": 'RESOURCE c\n DESC "d"\n OUTPUT String\n ENDPOINT GET /c',
      "auth.flow": "PERMISSION c : ROLE staff"
    });
    expect(r.success).toBe(true);
    expect(r.manifest!.resources.c!.permission).toBe("ROLE:staff");
  });

  it("rejects a bare ROLE or OWNER with no argument", () => {
    expect(compile("PERMISSION a : ROLE").success).toBe(false);
    expect(compile("PERMISSION a : OWNER").success).toBe(false);
  });
});

describe("ROLE/OWNER — engine", () => {
  let engine: AxlEngine;

  const def = (permission: string) => ({
    description: "d", input: { user_id: { type: "string", required: true } },
    output: "String", endpoint: { path: "/a", method: "POST" }, permission, confirm: null
  });

  const manifest = {
    axl_version: "1.0",
    app: { name: "T", version: "1.0.0", base_url: "http://localhost:4999" },
    actions: {
      role_gated: def("ROLE:staff"),
      owner_gated: def("OWNER:user_id"),
      // A numerically-typed owner field: the backend's ids are numbers but an identity
      // claim arrives as a header, i.e. a string. The comparison has to bridge that.
      owner_numeric: {
        description: "d", input: { user_id: { type: "number", required: true } },
        output: "String", endpoint: { path: "/n", method: "POST" }, permission: "OWNER:user_id", confirm: null
      }
    },
    resources: {}, workflows: [], permissions: {}, rateLimits: {}
  };

  const SESSION = { ip: "1.1.1.1", sessionCookie: "sid=a" };

  beforeEach(() => {
    engine = new AxlEngine(manifest, new InMemoryStateStore());
    engine._executeHttp = async () => ({ ok: true });
  });
  afterEach(() => engine.destroy());

  // The heart of it: no trusted channel means no claim, and no claim means denied.
  describe("with no trusted identity channel", () => {
    it("denies ROLE even though the caller has a session", async () => {
      await expect(engine.execute("role_gated", { user_id: "u1" }, SESSION))
        .rejects.toThrow(/not configured to accept one/);
    });

    it("denies OWNER even though the caller has a session", async () => {
      await expect(engine.execute("owner_gated", { user_id: "u1" }, SESSION))
        .rejects.toThrow(/not configured to accept one/);
    });

    it("throws PermissionError, so it maps to 403 like any other denial", async () => {
      await expect(engine.execute("role_gated", { user_id: "u1" }, SESSION)).rejects.toThrow(PermissionError);
    });
  });

  // `identity` absent has two causes, and they are fixed in different places. Reporting
  // the wrong one told an operator who had already set --trust-identity-headers to go and
  // set it, which is the least useful thing an error can do.
  describe("distinguishing a disabled channel from a missing claim", () => {
    const TRUSTED = { ...SESSION, identityTrusted: true };

    it("blames the gateway when the channel is on but no claim arrived", async () => {
      await expect(engine.execute("role_gated", { user_id: "u1" }, TRUSTED))
        .rejects.toThrow(/request carried none/);
      await expect(engine.execute("role_gated", { user_id: "u1" }, TRUSTED))
        .rejects.toThrow(/X-AXL-Subject/);
    });

    it("blames the configuration when the channel is off", async () => {
      await expect(engine.execute("role_gated", { user_id: "u1" }, SESSION))
        .rejects.toThrow(/not configured to accept one/);
    });

    it("does not tell an operator to set a flag they already set", async () => {
      await expect(engine.execute("role_gated", { user_id: "u1" }, TRUSTED))
        .rejects.not.toThrow(/Start the server with/);
    });

    it("uses the stricter message when the context does not say either way", async () => {
      // A context assembled by hand rather than by `axl serve` carries no
      // identityTrusted. Assuming the channel is off is the safer default.
      await expect(engine.execute("owner_gated", { user_id: "u1" }, { ...SESSION, identityTrusted: undefined }))
        .rejects.toThrow(/not configured to accept one/);
    });

    it("still denies, on both messages", async () => {
      // Only the wording changed. A missing claim is a denial either way.
      await expect(engine.execute("role_gated", { user_id: "u1" }, TRUSTED)).rejects.toThrow(PermissionError);
      await expect(engine.execute("role_gated", { user_id: "u1" }, SESSION)).rejects.toThrow(PermissionError);
    });
  });

  describe("ROLE", () => {
    const withRoles = (...roles: string[]) => ({ ...SESSION, identity: { subject: "u1", roles } });

    it("allows a caller carrying the role", async () => {
      await expect(engine.execute("role_gated", { user_id: "u1" }, withRoles("staff"))).resolves.toBeTruthy();
    });

    it("allows when the role is one of several", async () => {
      await expect(engine.execute("role_gated", { user_id: "u1" }, withRoles("billing", "staff"))).resolves.toBeTruthy();
    });

    it("denies a caller carrying a different role", async () => {
      await expect(engine.execute("role_gated", { user_id: "u1" }, withRoles("customer")))
        .rejects.toThrow(/requires the "staff" role/);
    });

    it("denies a caller carrying no roles", async () => {
      await expect(engine.execute("role_gated", { user_id: "u1" }, withRoles())).rejects.toThrow(PermissionError);
    });

    it("still requires a session — a role claim alone is not authentication", async () => {
      await expect(engine.execute("role_gated", { user_id: "u1" }, { ip: "1.1.1.1", identity: { roles: ["staff"] } }))
        .rejects.toThrow(/requires authentication/);
    });
  });

  describe("OWNER", () => {
    const asSubject = (subject: string) => ({ ...SESSION, identity: { subject, roles: [] } });

    it("allows when the subject matches the named argument", async () => {
      await expect(engine.execute("owner_gated", { user_id: "u1" }, asSubject("u1"))).resolves.toBeTruthy();
    });

    it("denies when the subject does not match", async () => {
      await expect(engine.execute("owner_gated", { user_id: "u2" }, asSubject("u1")))
        .rejects.toThrow(/restricted to the owning user/);
    });

    // Echoing either id would turn the denial into a probe for which ids exist.
    it("does not echo either identifier in the denial", async () => {
      const err = await engine.execute("owner_gated", { user_id: "u2" }, asSubject("u1")).catch((e: any) => e);
      expect(err.message).not.toContain("u1");
      expect(err.message).not.toContain("u2");
    });

    it("denies when there is no subject claim", async () => {
      await expect(engine.execute("owner_gated", { user_id: "u1" }, { ...SESSION, identity: { roles: ["staff"] } }))
        .rejects.toThrow(/carries no identity subject/);
    });

    // A header-borne subject is always a string; a Number-typed input is not. Comparing
    // them raw would deny every legitimate owner of a numeric id.
    it("bridges a numeric input against a string subject claim", async () => {
      await expect(engine.execute("owner_numeric", { user_id: 7 }, asSubject("7"))).resolves.toBeTruthy();
      await expect(engine.execute("owner_numeric", { user_id: 8 }, asSubject("7")))
        .rejects.toThrow(/restricted to the owning user/);
    });
  });
});

describe("ROLE/OWNER — over HTTP", () => {
  const UNTRUSTED = 3992;
  const TRUSTED = 3993;
  let untrusted: Awaited<ReturnType<typeof serve>>;
  let trusted: Awaited<ReturnType<typeof serve>>;

  beforeAll(async () => {
    execSync(`npx tsx "${path.join(process.cwd(), "packages/cli/index.ts")}" compile`, { cwd: STOREFRONT, stdio: "ignore" });
    const out = path.join(STOREFRONT, "build");
    untrusted = await serve(out, { port: UNTRUSTED });
    trusted = await serve(out, { port: TRUSTED, trustIdentityHeaders: true });
    for (const s of [untrusted, trusted]) (s.engine as any)._executeHttp = async () => ({ ok: true });
  });

  afterAll(async () => { await untrusted.close(); await trusted.close(); });

  const call = (port: number, action: string, body: any, headers: Record<string, string>) =>
    fetch(`http://127.0.0.1:${port}/actions/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body)
    });

  const AUTH = { Authorization: "Bearer alice" };

  // The whole reason for the opt-in.
  it("ignores forged identity headers when the flag is off", async () => {
    const role = await call(UNTRUSTED, "refund_order", { order_id: "o1" }, { ...AUTH, "X-AXL-Roles": "staff" });
    expect(role.status).toBe(403);

    const owner = await call(UNTRUSTED, "update_profile", { user_id: "u1", display_name: "x" },
      { ...AUTH, "X-AXL-Subject": "u1" });
    expect(owner.status).toBe(403);
  });

  it("says why, rather than reading as an ordinary permission failure", async () => {
    const res = await call(UNTRUSTED, "refund_order", { order_id: "o1" }, { ...AUTH, "X-AXL-Roles": "staff" });
    expect((await res.json()).detail).toMatch(/not configured to accept one/);
  });

  it("leaves ordinary AUTH actions working with the flag off", async () => {
    expect((await call(UNTRUSTED, "add_to_cart", { sku: "S1" }, AUTH)).status).toBe(200);
  });

  it("honours the headers when the flag is on: ROLE allow and deny", async () => {
    expect((await call(TRUSTED, "refund_order", { order_id: "o1" }, { ...AUTH, "X-AXL-Roles": "staff,billing" })).status).toBe(200);
    expect((await call(TRUSTED, "refund_order", { order_id: "o1" }, { ...AUTH, "X-AXL-Roles": "customer" })).status).toBe(403);
    expect((await call(TRUSTED, "refund_order", { order_id: "o1" }, AUTH)).status).toBe(403);
  });

  it("honours the headers when the flag is on: OWNER allow and deny", async () => {
    expect((await call(TRUSTED, "update_profile", { user_id: "u1", display_name: "A" },
      { ...AUTH, "X-AXL-Subject": "u1" })).status).toBe(200);
    expect((await call(TRUSTED, "update_profile", { user_id: "u2", display_name: "M" },
      { ...AUTH, "X-AXL-Subject": "u1" })).status).toBe(403);
  });
});
