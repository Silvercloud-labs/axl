import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { serve } from "../packages/cli/serve.js";
import { fileURLToPath } from "url";
import { compileFixture } from "./helpers/fixture-project.js";

// Regression cover for the WebSocket half of the confirmation/broadcast chain that was
// reproduced end-to-end: an unauthenticated client connected from an arbitrary Origin
// and received `workflow.paused` -- carrying a live confirmation token -- for a
// different, authenticated user's workflow.

const APP_FLOW_DIR = compileFixture();
const PORT = 3963;

let server: Awaited<ReturnType<typeof serve>>;

function connect(url: string, options?: any): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function collect(ws: WebSocket): any[] {
  const seen: any[] = [];
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type !== "pong") seen.push(msg);
  });
  return seen;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("WebSocket security", () => {
  beforeAll(async () => {
    server = await serve(APP_FLOW_DIR, { port: PORT });
  });

  afterAll(async () => {
    await server.close();
  });

  describe("Origin validation on the upgrade", () => {
    it("rejects a cross-origin upgrade with 403", async () => {
      await expect(
        connect(`ws://127.0.0.1:${PORT}/ws`, { origin: "http://evil.example" })
      ).rejects.toThrow(/403/);
    });

    it.each(["null", "not-a-url"])("rejects the origin %j", async (origin) => {
      await expect(
        connect(`ws://127.0.0.1:${PORT}/ws`, { origin })
      ).rejects.toThrow(/403/);
    });

    it("allows a loopback origin", async () => {
      const ws = await connect(`ws://127.0.0.1:${PORT}/ws`, { origin: "http://localhost:5173" });
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    // Deliberately mirrors /mcp: browsers always attach Origin, so rejecting a missing
    // one buys no rebinding protection and breaks every non-browser client.
    it("allows a missing Origin by default", async () => {
      const ws = await connect(`ws://127.0.0.1:${PORT}/ws`);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it("requires the Origin header under AXL_MCP_STRICT_ORIGIN", async () => {
      const prev = process.env.AXL_MCP_STRICT_ORIGIN;
      process.env.AXL_MCP_STRICT_ORIGIN = "1";
      try {
        await expect(connect(`ws://127.0.0.1:${PORT}/ws`)).rejects.toThrow(/403/);
      } finally {
        if (prev === undefined) delete process.env.AXL_MCP_STRICT_ORIGIN;
        else process.env.AXL_MCP_STRICT_ORIGIN = prev;
      }
    });
  });

  describe("event broadcast is scoped to the session that caused it", () => {
    async function trigger(action: string, body: any, token?: string) {
      return fetch(`http://127.0.0.1:${PORT}/actions/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      });
    }

    it("does not deliver one session's events to another session", async () => {
      const wsA = await connect(`ws://127.0.0.1:${PORT}/ws?token=session_a`);
      const wsB = await connect(`ws://127.0.0.1:${PORT}/ws?token=session_b`);
      const seenA = collect(wsA);
      const seenB = collect(wsB);

      await trigger("list_projects", {}, "session_a");
      await sleep(400);

      expect(seenA.length).toBeGreaterThan(0);
      expect(seenB).toEqual([]);

      wsA.close();
      wsB.close();
    });

    it("does not deliver an authenticated session's events to an unauthenticated client", async () => {
      const wsAuth = await connect(`ws://127.0.0.1:${PORT}/ws?token=session_c`);
      const wsAnon = await connect(`ws://127.0.0.1:${PORT}/ws`);
      const seenAuth = collect(wsAuth);
      const seenAnon = collect(wsAnon);

      // A confirm-gated action, so `workflow.paused`/`action.started` carry a token.
      await trigger("delete_task", { task_id: "t1" }, "session_c");
      await sleep(400);

      expect(seenAuth.length).toBeGreaterThan(0);
      expect(seenAnon).toEqual([]);

      wsAuth.close();
      wsAnon.close();
    });

    it("never puts a session cookie on the wire", async () => {
      const ws = await connect(`ws://127.0.0.1:${PORT}/ws?token=session_d`);
      const seen = collect(ws);

      await trigger("list_projects", {}, "session_d");
      await sleep(400);

      expect(seen.length).toBeGreaterThan(0);
      for (const msg of seen) {
        expect(msg.data?.context?.sessionCookie).toBeUndefined();
      }
      ws.close();
    });

    // The broadcast context is an ALLOWLIST. It used to be `delete context.sessionCookie`,
    // which meant every field added to the request context shipped to every subscribed
    // socket until someone remembered to exclude it -- verified: a caller's
    // Idempotency-Key was broadcast verbatim, and so was the server's own
    // identityTrusted setting the moment it existed.
    it("broadcasts only ip and requestId from the request context", async () => {
      const ws = await connect(`ws://127.0.0.1:${PORT}/ws?token=session_e`);
      const seen = collect(ws);

      await fetch(`http://127.0.0.1:${PORT}/actions/list_projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer session_e",
          "Idempotency-Key": "idem-must-not-be-broadcast",
          "X-Request-Id": "req-allowlist-probe"
        },
        body: "{}"
      });
      await sleep(400);

      expect(seen.length).toBeGreaterThan(0);
      for (const msg of seen) {
        const context = msg.data?.context ?? {};
        expect(Object.keys(context).sort()).toEqual(["ip", "requestId"]);
        expect(context.requestId).toBe("req-allowlist-probe");
      }
      // The correlation id is documented as reaching subscribers; the idempotency key is
      // the caller's own and has no reason to.
      expect(JSON.stringify(seen)).not.toContain("idem-must-not-be-broadcast");
      ws.close();
    });

    // The structural half of the fix: the filter sends only on a positive identity
    // match, so an event nobody can be matched to reaches nobody -- rather than the
    // previous behaviour, where an unattributable event fell through to everyone.
    it("drops an event that carries no identity at all", async () => {
      const wsAuth = await connect(`ws://127.0.0.1:${PORT}/ws?token=session_e`);
      const wsAnon = await connect(`ws://127.0.0.1:${PORT}/ws`);
      const seenAuth = collect(wsAuth);
      const seenAnon = collect(wsAnon);

      server.engine.emitEvent("synthetic.contextless", { actionName: "x", secret: "leak-me" });
      server.engine.emitEvent("synthetic.emptycontext", { actionName: "x", context: {} });
      await sleep(300);

      expect(seenAuth).toEqual([]);
      expect(seenAnon).toEqual([]);

      wsAuth.close();
      wsAnon.close();
    });
  });
});
