import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { execSync } from "node:child_process";
import { serve } from "../packages/cli/serve.js";

// The integration fixture project. Tests used to compile the repository root,
// which required the root to be an AXL project -- moving that project out is
// what this constant replaces.
const FIXTURE_PROJECT = fileURLToPath(new URL("../fixtures/projects/taskdeck", import.meta.url));

// RFC 7807 "Problem Details for HTTP APIs" for every REST error path.
//
// BREAKING: the response shape changed from {error, message} to
// {type, title, status, detail, instance}. The old `error` code string survives as
// `type`, so client branching is a rename rather than a rewrite.
//
// MCP is deliberately excluded -- it has its own error convention (JSON-RPC / tool
// result envelopes) and forcing 7807 into it would fight the protocol. Only errors that
// are HTTP-transport-level use this shape.

const BUILD = fileURLToPath(new URL("../fixtures/projects/taskdeck/build", import.meta.url));
const PORT = 3995;
let server: Awaited<ReturnType<typeof serve>>;

beforeAll(async () => {
  execSync("npx tsx ../../../packages/cli/index.ts compile", { cwd: FIXTURE_PROJECT, stdio: "ignore" });
  server = await serve(BUILD, { port: PORT });
});
afterAll(async () => { await server.close(); });

const J = { "Content-Type": "application/json" };
const post = (p: string, body: string, headers: Record<string, string> = {}) =>
  fetch(`http://127.0.0.1:${PORT}${p}`, { method: "POST", headers: { ...J, ...headers }, body });

/** Every problem response must carry the full member set, not a partial one. */
async function expectProblem(res: Response, status: number, type: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("content-type")).toMatch(/application\/problem\+json/);

  const body = await res.json();
  expect(body.type).toBe(type);
  expect(body.status).toBe(status);
  expect(typeof body.title).toBe("string");
  expect(body.title.length).toBeGreaterThan(0);
  expect(typeof body.detail).toBe("string");
  expect(body.detail.length).toBeGreaterThan(0);
  expect(typeof body.instance).toBe("string");
  return body;
}

describe("RFC 7807 — engine error paths", () => {
  it("403 PERMISSION_DENIED", async () => {
    const body = await expectProblem(await post("/actions/list_projects", "{}"), 403, "PERMISSION_DENIED");
    expect(body.title).toBe("Permission denied");
    // `instance` names the endpoint AND the specific occurrence: RFC 7807 asks it to
    // identify the occurrence, and a bare path is identical across every 403 on that
    // route. The request id is appended as a fragment, which keeps it a valid relative
    // URI reference and keeps the path readable at the front.
    expect(body.instance).toMatch(/^\/actions\/list_projects#.+/);
  });

  it("404 NOT_FOUND for an unknown action", async () => {
    const body = await expectProblem(await post("/actions/nope", "{}"), 404, "NOT_FOUND");
    expect(body.detail).toMatch(/Unknown action/);
  });

  it("404 NOT_FOUND for an unknown workflow", async () => {
    await expectProblem(await post("/workflows/nope", "{}"), 404, "NOT_FOUND");
  });

  it("400 VALIDATION_ERROR from the engine's schema check", async () => {
    const body = await expectProblem(await post("/actions/list_tasks", "{}"), 400, "VALIDATION_ERROR");
    expect(body.title).toBe("Validation failed");
  });

  it("400 VALIDATION_ERROR from an inline route check", async () => {
    const body = await expectProblem(await post("/confirm", "{}"), 400, "VALIDATION_ERROR");
    expect(body.detail).toMatch(/'token' and 'otp' are required/);
  });

  it("404 NOT_FOUND for a confirmation token that does not exist", async () => {
    await expectProblem(await post("/confirm", JSON.stringify({ token: "x", otp: "000000" })), 404, "NOT_FOUND");
  });
});

// These never reach the engine, and a caller should not have to recognise two error
// formats from one server depending on how far the request got.
describe("RFC 7807 — global handler paths", () => {
  it("400 MALFORMED_JSON", async () => {
    const body = await expectProblem(await post("/actions/list_tasks", "{bad"), 400, "MALFORMED_JSON");
    expect(body.detail).toBe("Malformed JSON in request body.");
    // The old bug this replaced: a 400 that claimed the server had faulted.
    expect(body.detail).not.toMatch(/Internal Server Error/);
  });

  it("413 PAYLOAD_TOO_LARGE", async () => {
    const body = await expectProblem(
      await post("/actions/list_tasks", JSON.stringify({ project_id: "p", pad: "x".repeat(200 * 1024) })),
      413, "PAYLOAD_TOO_LARGE");
    expect(body.detail).toBe("Request body too large.");
  });

  // Rejected before the MCP transport sees it, so it is an HTTP error, not a JSON-RPC one.
  it("403 FORBIDDEN_ORIGIN on /mcp", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: "POST",
      headers: { ...J, Accept: "application/json, text/event-stream", Origin: "http://evil.example" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })
    });
    await expectProblem(res, 403, "FORBIDDEN_ORIGIN");
  });
});

describe("RFC 7807 — the migration contract", () => {
  // The reason `type` carries the old code verbatim: existing client logic branching on
  // the error string keeps working after a field rename, instead of needing a rewrite.
  it("reuses the previous error codes verbatim as `type`", async () => {
    const cases: [string, string, string][] = [
      ["/actions/list_projects", "{}", "PERMISSION_DENIED"],
      ["/actions/nope", "{}", "NOT_FOUND"],
      ["/actions/list_tasks", "{}", "VALIDATION_ERROR"],
    ];
    for (const [path, body, type] of cases) {
      expect((await (await post(path, body)).json()).type).toBe(type);
    }
  });

  it("no longer emits the old ad-hoc members", async () => {
    const body = await (await post("/actions/nope", "{}")).json();
    expect(body).not.toHaveProperty("error");
    expect(body).not.toHaveProperty("message");
  });

  it("reports the path and the occurrence as `instance`, so a log line identifies the call", async () => {
    const action = (await (await post("/actions/nope", "{}")).json()).instance;
    const workflow = (await (await post("/workflows/nope", "{}")).json()).instance;
    expect(action).toMatch(/^\/actions\/nope#.+/);
    expect(workflow).toMatch(/^\/workflows\/nope#.+/);
    // Two separate calls must not share an instance -- that is the whole point of the
    // change, and a path-only value failed it.
    expect(action).not.toBe(workflow);
  });

  it("keeps a successful response as a plain JSON body, untouched", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("content-type")).not.toMatch(/problem/);
  });
});
