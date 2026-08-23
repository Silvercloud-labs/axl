import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve } from "../packages/cli/serve.js";

// `next_action` — an optional hint on the RFC 7807 body, present only where a genuinely
// clear next step exists.
//
// The discipline being tested is as much about absence as presence: a hint on an error
// with no universal next step would be a guess, and a guess a client branches on is
// worse than nothing.

const PORT = 3983;
let server: Awaited<ReturnType<typeof serve>>;
let dir: string;

const J = { "Content-Type": "application/json" };
const post = (p: string, body: any = {}) =>
  fetch(`http://127.0.0.1:${PORT}${p}`, { method: "POST", headers: J, body: JSON.stringify(body) });

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "axl-hints-"));
  fs.mkdirSync(path.join(dir, "flow"), { recursive: true });
  fs.writeFileSync(path.join(dir, "flow", "app.flow"),
    "APP Hints\nVERSION 1.0.0\nBASE_URL http://127.0.0.1:1");
  fs.writeFileSync(path.join(dir, "flow", "actions.flow"), [
    'ACTION limited', 'DESC "rate limited"', "OUTPUT Null", "ENDPOINT POST /limited", "",
    "ACTION gated", 'DESC "confirm gated"', "OUTPUT Null", "ENDPOINT POST /gated", "",
    "ACTION locked", 'DESC "auth only"', "OUTPUT Null", "ENDPOINT POST /locked",
  ].join("\n"));
  fs.writeFileSync(path.join(dir, "flow", "auth.flow"), [
    "PERMISSION limited : PUBLIC", "PERMISSION gated : PUBLIC", "PERMISSION locked : AUTH",
    "CONFIRM gated : OTP", "RATE_LIMIT limited : 2/min",
  ].join("\n"));
  fs.writeFileSync(path.join(dir, "axl.config.json"),
    JSON.stringify({ flowDir: "flow", outDir: "build" }));
  execSync(`npx tsx "${fileURLToPath(new URL("../packages/cli/index.ts", import.meta.url))}" compile`,
    { cwd: dir, stdio: "ignore" });
  server = await serve(path.join(dir, "build"), { port: PORT });
}, 120000);

afterAll(async () => {
  await server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("next_action — rate limiting", () => {
  it("points at retry_after with a real derived delay", async () => {
    await post("/actions/limited");
    await post("/actions/limited");
    const res = await post("/actions/limited");
    const body: any = await res.json();

    expect(res.status).toBe(429);
    expect(body.type).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.next_action).toBe("retry_after");
    // Derived from the limiter's own window state, not a guessed constant.
    expect(body.retry_after).toBeGreaterThan(0);
    expect(body.retry_after).toBeLessThanOrEqual(60);
  });

  it("sets the standard Retry-After header to the same value", async () => {
    const res = await post("/actions/limited");
    const body: any = await res.json();
    expect(res.headers.get("retry-after")).toBe(String(body.retry_after));
  });

  // Rounding down would send the caller back a tick early, straight into another
  // rejection — the one outcome the hint exists to prevent.
  it("rounds the delay up, never to zero", async () => {
    const body: any = await (await post("/actions/limited")).json();
    expect(Number.isInteger(body.retry_after)).toBe(true);
    expect(body.retry_after).toBeGreaterThanOrEqual(1);
  });
});

describe("next_action — the confirmation flow", () => {
  // Not an error, but the same "what now" question. Formalised into the same vocabulary
  // so a machine caller reads one field rather than parsing an English sentence.
  it("is present on the confirmationRequired success envelope", async () => {
    const body: any = await (await post("/actions/gated")).json();
    expect(body.confirmationRequired).toBe(true);
    expect(body.next_action).toBe("confirm_action");
    // Additive: the prose message is untouched.
    expect(body.message).toMatch(/requires confirmation/);
  });

  it("says retry_confirmation while attempts remain", async () => {
    const { token }: any = await (await post("/actions/gated")).json();
    const res = await post("/confirm", { token, otp: "000000" });
    const body: any = await res.json();

    expect(res.status).toBe(400);
    expect(body.type).toBe("VALIDATION_ERROR");
    expect(body.next_action).toBe("retry_confirmation");
  });

  it("says request_confirmation for an unknown or expired token", async () => {
    const res = await post("/confirm", { token: "no-such-token", otp: "000000" });
    const body: any = await res.json();

    expect(res.status).toBe(404);
    expect(body.type).toBe("NOT_FOUND");
    expect(body.next_action).toBe("request_confirmation");
  });

  // Once the attempt budget is spent the pending record is destroyed, so retrying the
  // same token can never succeed — the hint has to point at starting over, not retrying.
  it("says request_confirmation once attempts are exhausted", async () => {
    const { token }: any = await (await post("/actions/gated")).json();
    let body: any;
    for (let i = 0; i < 6; i++) {
      body = await (await post("/confirm", { token, otp: "111111" })).json();
    }
    expect(body.next_action).toBe("request_confirmation");
  });

  it("offers the same hints on the workflow resume route", async () => {
    const res = await post("/workflows/resume", { token: "no-such-token", otp: "000000" });
    const body: any = await res.json();
    expect(body.next_action).toBe("request_confirmation");
  });
});

// The other half of the design: a hint is offered only where one genuinely exists.
describe("next_action — absent where there is no clear step", () => {
  it("is absent on PERMISSION_DENIED, which can mean many different things", async () => {
    const res = await post("/actions/locked");
    const body: any = await res.json();

    expect(res.status).toBe(403);
    expect(body.type).toBe("PERMISSION_DENIED");
    // Absent, not null and not an empty string — a client checking `if (body.next_action)`
    // and a client checking `"next_action" in body` must agree.
    expect("next_action" in body).toBe(false);
  });

  it("is absent on a NOT_FOUND outside the confirmation flow", async () => {
    // An unknown action name is a bug in the caller, not something to retry.
    const res = await post("/actions/no_such_thing");
    const body: any = await res.json();

    expect(res.status).toBe(404);
    expect("next_action" in body).toBe(false);
  });

  it("is absent on a plain VALIDATION_ERROR outside the confirmation flow", async () => {
    const res = await post("/confirm", {});
    const body: any = await res.json();

    expect(res.status).toBe(400);
    expect(body.type).toBe("VALIDATION_ERROR");
    // This one never reached the engine — the route rejected the shape of the request,
    // which is not the same as "your OTP was wrong".
    expect("next_action" in body).toBe(false);
  });
});
