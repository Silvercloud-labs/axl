import { describe, it, expect } from "vitest";
import { Compiler } from "@silvercloudlabs/compiler";
// @ts-ignore
import { buildUrl, executeHttpCall } from "../packages/runtime/backend-adapter.js";
// @ts-ignore
import { ValidationError } from "../packages/runtime/engine.js";

// A `{placeholder}` in an ACTION's endpoint path that names no input can never be filled.
// AXL328 already caught this on a RESOURCE, where it is unmissable because a resource has
// no inputs at all. On an ACTION the same mistake compiled clean and produced this on
// every single call -- reproduced end to end before AXL389 existed:
//
//   POST /actions/delete_task
//   500 {"type":"INTERNAL_ERROR","detail":"Internal error."}
//
// and nothing in the server log, because buildUrl threw a bare Error that
// safeErrorMessage does not recognise as user-facing.

function compile(actions: string, auth: string) {
  return Compiler.compileFromSources({
    "app.flow": "APP T\nBASE_URL http://localhost:4999",
    "actions.flow": actions,
    "auth.flow": auth,
  });
}

const action = (endpoint: string, inputs = "    task_id : String REQUIRED\n") =>
  `ACTION delete_task\n DESC "d"\n INPUT\n${inputs} OUTPUT Null\n ENDPOINT ${endpoint}`;

describe("AXL389 — action path parameters", () => {
  it("accepts a placeholder that names a declared input", () => {
    const r = compile(action("DELETE /tasks/{task_id}"), "PERMISSION delete_task : PUBLIC");
    expect(r.success, JSON.stringify(r.diagnostics)).toBe(true);
  });

  it("rejects a placeholder that names nothing", () => {
    const r = compile(
      action("DELETE /tasks/{task_id}", "    note : String OPTIONAL\n"),
      "PERMISSION delete_task : PUBLIC"
    );
    expect(r.success).toBe(false);
    const d = r.diagnostics.find((x) => x.code === "AXL389");
    expect(d?.message).toMatch(/can never be filled/);
  });

  it("suggests the right input on a typo", () => {
    const r = compile(action("DELETE /tasks/{task_di}"), "PERMISSION delete_task : PUBLIC");
    expect(r.diagnostics.find((x) => x.code === "AXL389")?.suggestion).toBe('Did you mean "{task_id}"?');
  });

  it("lists the available inputs when there is no near match", () => {
    const r = compile(action("DELETE /tasks/{wholly_unrelated}"), "PERMISSION delete_task : PUBLIC");
    expect(r.diagnostics.find((x) => x.code === "AXL389")?.suggestion).toMatch(/task_id/);
  });

  it("rejects an empty placeholder", () => {
    const r = compile(action("DELETE /tasks/{}"), "PERMISSION delete_task : PUBLIC");
    expect(r.diagnostics.find((x) => x.code === "AXL389")?.message).toMatch(/empty path parameter/);
  });

  it("checks every placeholder in a multi-segment path", () => {
    const r = compile(
      action("PATCH /projects/{project_id}/tasks/{task_id}"),
      "PERMISSION delete_task : PUBLIC"
    );
    expect(r.success).toBe(false);
    expect(r.diagnostics.filter((x) => x.code === "AXL389")).toHaveLength(1);
    expect(r.diagnostics.find((x) => x.code === "AXL389")?.message).toMatch(/project_id/);
  });

  it("reports a repeated bad placeholder once", () => {
    const r = compile(action("POST /a/{nope}/b/{nope}"), "PERMISSION delete_task : PUBLIC");
    expect(r.diagnostics.filter((x) => x.code === "AXL389")).toHaveLength(1);
  });

  it("still allows a static path with no placeholders", () => {
    const r = compile(action("POST /tasks/purge"), "PERMISSION delete_task : PUBLIC");
    expect(r.success).toBe(true);
  });
});

describe("buildUrl", () => {
  it("throws a typed ValidationError for a missing path parameter", () => {
    // A bare Error here was redacted by safeErrorMessage to "Internal error." and
    // surfaced as a 500 for a condition that is a property of the request.
    expect(() => buildUrl("http://b", "/tasks/{task_id}", {})).toThrow(ValidationError);
    expect(() => buildUrl("http://b", "/tasks/{task_id}", {})).toThrow(/Missing required path parameter/);
  });
});

describe("DELETE argument forwarding", () => {
  // Verified against an echo backend before the fix: an action with
  // `reason : String REQUIRED` validated the argument, returned 200, and the backend
  // received `DELETE /items/i_1` with no body and no query string.
  const def = (method: string) => ({ endpoint: { path: "/items/{item_id}", method } });

  async function capture(method: string, args: Record<string, unknown>) {
    let seen: { url?: string; body?: unknown } = {};
    const original = global.fetch;
    global.fetch = (async (url: any, opts: any) => {
      seen = { url: String(url), body: opts?.body };
      return { ok: true, status: 200, text: async () => "{}" } as any;
    }) as any;
    try {
      await executeHttpCall("http://b", def(method), args, null);
    } finally {
      global.fetch = original;
    }
    return seen;
  }

  it("puts a DELETE's non-path arguments in the query string", async () => {
    const seen = await capture("DELETE", { item_id: "i_1", reason: "spam" });
    expect(seen.url).toContain("/items/i_1");
    expect(seen.url).toContain("reason=spam");
  });

  it("does not silently drop them", async () => {
    const seen = await capture("DELETE", { item_id: "i_1", reason: "spam" });
    // The regression: url had no query and body was undefined, and the call returned 200.
    expect(`${seen.url}${seen.body ?? ""}`).toContain("spam");
  });

  it("gives DELETE no request body", async () => {
    // RFC 9110 gives a DELETE body no defined semantics; proxies may drop it.
    const seen = await capture("DELETE", { item_id: "i_1", reason: "spam" });
    expect(seen.body).toBeUndefined();
  });

  it("still puts a GET's arguments in the query string", async () => {
    const seen = await capture("GET", { item_id: "i_1", q: "x" });
    expect(seen.url).toContain("q=x");
    expect(seen.body).toBeUndefined();
  });

  it("still puts a POST's arguments in the body", async () => {
    const seen = await capture("POST", { item_id: "i_1", reason: "spam" });
    expect(seen.body).toBe(JSON.stringify({ reason: "spam" }));
    expect(seen.url).not.toContain("reason");
  });

  it("sends no query string when a DELETE has only path arguments", async () => {
    const seen = await capture("DELETE", { item_id: "i_1" });
    expect(seen.url).toBe("http://b/items/i_1");
  });
});
