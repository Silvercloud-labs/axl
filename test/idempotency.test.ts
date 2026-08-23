import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AxlEngine } from "../packages/runtime/engine.js";
import { InMemoryStateStore } from "../packages/runtime/state.js";

const mockManifest = {
  app: { name: "TestApp", version: "1.0.0", base_url: "http://localhost:4000" },
  actions: {
    public_action: {
      permission: "PUBLIC",
      endpoint: { path: "/data", method: "POST" },
      input: {}
    }
  }
};

describe("Idempotency Cache", () => {
  let engine: AxlEngine;
  let state: InMemoryStateStore;
  let executions = 0;

  beforeEach(() => {
    state = new InMemoryStateStore();
    engine = new AxlEngine(mockManifest, state);
    executions = 0;
    
    // Mock the actual HTTP call to track executions
    engine._executeHttp = async (actionName, actionDef, args, context) => {
      executions++;
      return { success: true, count: executions, ip: context?.ip || "unknown" };
    };
  });

  afterEach(() => {
    engine.destroy();
  });

  it("prevents cache poisoning across different sessions", async () => {
    // User A executes the action
    const resA = await engine.execute("public_action", {}, { idempotencyKey: "123", ip: "10.0.0.1", sessionCookie: "sid=a" });
    expect(resA.count).toBe(1);

    // User B executes the action with the SAME idempotency key
    const resB = await engine.execute("public_action", {}, { idempotencyKey: "123", ip: "10.0.0.2", sessionCookie: "sid=b" });

    // If the cache key were shared, User B would get User A's cached result.
    expect(executions).toBe(2);
    expect(resB.count).toBe(2);
  });

  it("does not share a cache entry between two sessions on one IP", async () => {
    const ip = "10.0.0.7";
    const resA = await engine.execute("public_action", {}, { idempotencyKey: "k", ip, sessionCookie: "sid=a" });
    const resB = await engine.execute("public_action", {}, { idempotencyKey: "k", ip, sessionCookie: "sid=b" });
    expect(resA.count).toBe(1);
    expect(resB.count).toBe(2);
  });

  // The IP fallback is gone. Two anonymous clients behind one NAT share a source IP,
  // so an IP-keyed cache handed one of them the other's cached result -- and for a
  // confirm-gated action that result is a `confirmationRequired` envelope carrying a
  // live confirmation token. An anonymous caller now simply gets no idempotency.
  describe("anonymous callers", () => {
    it("gets no replay, so nothing can be replayed to the wrong client", async () => {
      const ctx = { idempotencyKey: "shared", ip: "10.0.0.3" };
      const first = await engine.execute("public_action", {}, ctx);
      const second = await engine.execute("public_action", {}, ctx);

      expect(first.count).toBe(1);
      expect(second.count).toBe(2);
      expect(executions).toBe(2);
    });

    it("writes no cache entry at all", async () => {
      await engine.execute("public_action", {}, { idempotencyKey: "shared", ip: "10.0.0.4" });
      expect((state as any).namespaces.get("idempotencyCache")).toBeUndefined();
    });

    it("cannot read an authenticated client's cache entry by guessing the key", async () => {
      const authed = { idempotencyKey: "order-1", ip: "10.0.0.5", sessionCookie: "sid=victim" };
      const mine = await engine.execute("public_action", {}, authed);
      expect(mine.count).toBe(1);

      // Same IP, same key, no session.
      const anon = await engine.execute("public_action", {}, { idempotencyKey: "order-1", ip: "10.0.0.5" });
      expect(anon.count).toBe(2);
    });
  });

  it("prevents double execution when the same idempotency key fires concurrently", async () => {
    const mockManifest = {
      app: { name: "T", version: "1.0.0", base_url: "http://localhost:4000" },
      actions: {
        pay: { permission: "PUBLIC", endpoint: { path: "/pay", method: "POST" }, input: {} }
      }
    };
    const state = new InMemoryStateStore();
    const engine = new AxlEngine(mockManifest, state);
    let executions = 0;
    engine._executeHttp = async () => {
      await new Promise(r => setTimeout(r, 20)); // simulate real network latency
      executions++;
      return { success: true, executions };
    };
    const ctx = { idempotencyKey: "same-key", ip: "1.2.3.4", sessionCookie: "sid=payer" };
    await Promise.all([
      engine.execute("pay", {}, ctx),
      engine.execute("pay", {}, ctx)
    ]);
    expect(executions).toBe(1); // currently fails: executions === 2
    engine.destroy();
  });

  // execute() and confirmAction() used to build the cache key separately, and had
  // drifted: confirmAction omitted the `ip` fallback, so it wrote the real result to
  // `anon:<action>:<key>` while the replay read `<ip>:<action>:<key>` and missed it.
  describe("across the OTP confirmation gate", () => {
    const confirmManifest = {
      app: { name: "T", version: "1.0.0", base_url: "http://localhost:4000" },
      actions: {
        pay: { permission: "PUBLIC", confirm: "OTP", endpoint: { path: "/pay", method: "POST" }, input: {} }
      }
    };

    let confirmEngine: AxlEngine;
    let confirmState: InMemoryStateStore;
    let receipts = 0;

    beforeEach(() => {
      confirmState = new InMemoryStateStore();
      confirmEngine = new AxlEngine(confirmManifest, confirmState);
      receipts = 0;
      confirmEngine._executeHttp = async () => ({ receipt: ++receipts });
    });

    afterEach(() => confirmEngine.destroy());

    async function payAndConfirm(context: any) {
      const started = await confirmEngine.execute("pay", {}, context);
      const otp = (await confirmState.get("pendingConfirmations", started.token)).otp;
      return confirmEngine.confirmAction(started.token, otp, context);
    }

    it("replays the confirmed result instead of restarting the OTP flow", async () => {
      const ctx = { ip: "198.51.100.7", idempotencyKey: "order-42", sessionCookie: "sid=payer" };
      expect(await payAndConfirm(ctx)).toEqual({ receipt: 1 });

      const replay = await confirmEngine.execute("pay", {}, ctx);
      expect(replay).toEqual({ receipt: 1 });
      expect(replay.confirmationRequired).toBeUndefined();
      expect(receipts).toBe(1);
    });

    it("scopes the confirmed result to one client", async () => {
      await payAndConfirm({ ip: "198.51.100.7", idempotencyKey: "order-42", sessionCookie: "sid=payer" });

      // Same key, different client: must not receive the first client's receipt.
      const other = await confirmEngine.execute("pay", {}, { ip: "203.0.113.1", idempotencyKey: "order-42", sessionCookie: "sid=other" });
      expect(other.confirmationRequired).toBe(true);
    });

    it("writes exactly one cache entry for one logical operation", async () => {
      await payAndConfirm({ ip: "198.51.100.7", idempotencyKey: "order-42", sessionCookie: "sid=payer" });
      const keys = [...(confirmState as any).namespaces.get("idempotencyCache").keys()];
      expect(keys).toEqual(["198.51.100.7|sid=payer:pay:order-42"]);
    });
  });
});
