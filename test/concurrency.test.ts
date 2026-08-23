import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AxlEngine, PermissionError, TooManyAttemptsError } from "../packages/runtime/engine.js";
import { InMemoryStateStore } from "../packages/runtime/state.js";
import crypto from "crypto";

const mockManifest = {
  app: { name: "TestApp", version: "1.0.0", base_url: "http://localhost:4000" },
  actions: {
    sensitive_action: {
      permission: "PUBLIC",
      confirm: "OTP",
      endpoint: { path: "/sensitive", method: "POST" },
      input: {}
    },
    rate_limited_action: {
      permission: "PUBLIC",
      endpoint: { path: "/rate_limited", method: "POST" },
      input: {}
    }
  },
  rateLimits: {
    rate_limited_action: "2/sec"
  }
};

describe("Concurrency and Race Conditions", () => {
  let engine: AxlEngine;
  let state: InMemoryStateStore;

  beforeEach(() => {
    state = new InMemoryStateStore();
    engine = new AxlEngine(mockManifest, state);
    
    // Mock the actual HTTP call to track executions
    engine._executeHttp = async (actionName) => {
      return { success: true, action: actionName };
    };
  });

  afterEach(() => {
    engine.destroy();
  });

  it("OTP Double Execution (Race Condition)", async () => {
    // 1. Initiate OTP
    const reqResult = await engine.execute("sensitive_action", {}, {});
    expect(reqResult.confirmationRequired).toBe(true);
    
    const token = reqResult.token;
    // Read the OTP from the state store, not the API response. The response only
    // carries otp_demo_only under the AXL_DEMO_OTP opt-in, and a test for the
    // confirmation gate should not depend on the gate leaking its own secret.
    const otp = (await state.get("pendingConfirmations", token)).otp;

    // 2. Simulate two concurrent valid confirmations
    // Using Promise.all to fire them at the exact same time
    const [res1, res2] = await Promise.allSettled([
      engine.confirmAction(token, otp, {}),
      engine.confirmAction(token, otp, {})
    ]);

    // In a safe system, the first should succeed and the second should fail (or vice versa).
    // They should NOT both succeed.
    const successes = [res1, res2].filter(r => r.status === "fulfilled");
    
    // This assertion will pass if the bug is fixed.
    expect(successes.length).toBe(1);
  });

  it("Rate Limit Bypass (Race Condition)", async () => {
    // Limit is 2/sec.
    // If we fire 5 concurrently, only 2 should succeed.
    
    const requests = Array.from({ length: 5 }).map(() => {
      return engine.execute("rate_limited_action", {}, {});
    });

    const results = await Promise.allSettled(requests);
    
    const successes = results.filter(r => r.status === "fulfilled");
    
    // This assertion will pass if the bug is fixed.
    expect(successes.length).toBe(2);
  });

  describe("OTP brute force across tokens", () => {
    // The 5-attempt lockout is per token, and a client can mint a fresh token with a
    // fresh OTP just by calling the action again -- so on its own it caps guesses per
    // token but not in aggregate. Measured before the aggregate cap existed: 2000
    // evaluated guesses from one IP in 44ms.
    const attacker = { ip: "203.0.113.9" };

    async function guessWrongOtpRepeatedly(context: any, rounds: number) {
      let evaluated = 0;
      let refused = 0;
      for (let i = 0; i < rounds; i++) {
        const started = await engine.execute("sensitive_action", {}, context);
        for (let k = 0; k < 6; k++) {
          try {
            await engine.confirmAction(started.token, "000000", context);
          } catch (err: any) {
            if (err.message.startsWith("Too many incorrect confirmation attempts")) { refused++; break; }
            evaluated++;                       // the guess was actually checked
            if (err.constructor.name === "TooManyAttemptsError") break;  // per-token lockout
          }
        }
      }
      return { evaluated, refused };
    }

    it("caps evaluated guesses per client regardless of how many tokens they hold", async () => {
      const { evaluated, refused } = await guessWrongOtpRepeatedly(attacker, 100);
      expect(evaluated).toBe(20);
      expect(refused).toBeGreaterThan(0);
    });

    it("refuses a locked-out client even when they submit the correct OTP", async () => {
      await guessWrongOtpRepeatedly(attacker, 100);

      const started = await engine.execute("sensitive_action", {}, attacker);
      const correctOtp = (await state.get("pendingConfirmations", started.token)).otp;
      await expect(engine.confirmAction(started.token, correctOtp, attacker)).rejects.toThrow(TooManyAttemptsError);
    });

    it("does not penalise a different client", async () => {
      await guessWrongOtpRepeatedly(attacker, 100);

      const bystander = { ip: "198.51.100.4" };
      const started = await engine.execute("sensitive_action", {}, bystander);
      const correctOtp = (await state.get("pendingConfirmations", started.token)).otp;
      await expect(engine.confirmAction(started.token, correctOtp, bystander)).resolves.toBeTruthy();
    });

    it("leaves room for honest typos before the correct OTP", async () => {
      const clumsy = { ip: "198.51.100.9" };
      await guessWrongOtpRepeatedly(clumsy, 3);

      const started = await engine.execute("sensitive_action", {}, clumsy);
      const correctOtp = (await state.get("pendingConfirmations", started.token)).otp;
      await expect(engine.confirmAction(started.token, correctOtp, clumsy)).resolves.toBeTruthy();
    });
  });

  // A confirmation token used to be a pure bearer credential: it is handed back in an
  // API response and was, separately, broadcast over an unauthenticated WebSocket. Any
  // holder could confirm it, and the action then executed under the ORIGINAL requester's
  // session. Reproduced end-to-end before the fix: a second registered user confirmed
  // the first user's token and deleted the first user's task.
  describe("confirmation ownership", () => {
    const victim = { ip: "10.0.0.1", sessionCookie: "sid=victim" };
    const attacker = { ip: "10.0.0.2", sessionCookie: "sid=attacker" };

    async function pendingFor(context: any) {
      const started = await engine.execute("sensitive_action", {}, context);
      const otp = (await state.get("pendingConfirmations", started.token)).otp;
      return { token: started.token, otp };
    }

    it("rejects a different user confirming with the correct token and OTP", async () => {
      const { token, otp } = await pendingFor(victim);
      await expect(engine.confirmAction(token, otp, attacker))
        .rejects.toThrow(/Invalid or expired confirmation token/);
    });

    it("rejects an unauthenticated caller confirming an authenticated user's token", async () => {
      const { token, otp } = await pendingFor(victim);
      await expect(engine.confirmAction(token, otp, { ip: "10.0.0.9" }))
        .rejects.toThrow(/Invalid or expired confirmation token/);
      await expect(engine.confirmAction(token, otp, undefined))
        .rejects.toThrow(/Invalid or expired confirmation token/);
    });

    // Same message and type as an unknown token on purpose. A distinct "not your token"
    // would make this endpoint an oracle for which tokens are live.
    it("is indistinguishable from an unknown token", async () => {
      const { token, otp } = await pendingFor(victim);
      const wrongOwner = await engine.confirmAction(token, otp, attacker).catch(e => e);
      const unknown = await engine.confirmAction(crypto.randomUUID(), otp, attacker).catch(e => e);
      expect(wrongOwner.constructor.name).toBe(unknown.constructor.name);
      expect(wrongOwner.message).toBe(unknown.message);
    });

    // The per-token 5-attempt lockout destroys the token. If a stranger's guesses
    // counted, an unauthenticated attacker holding a leaked token could burn the real
    // owner's pending confirmation. They are rejected before the OTP is read at all.
    it("does not let a stranger's guesses burn the owner's attempt budget", async () => {
      const { token, otp } = await pendingFor(victim);
      for (let i = 0; i < 30; i++) {
        await engine.confirmAction(token, "000000", attacker).catch(() => {});
      }
      await expect(engine.confirmAction(token, otp, victim)).resolves.toBeTruthy();
    });

    it("still lets the original requester confirm", async () => {
      const { token, otp } = await pendingFor(victim);
      await expect(engine.confirmAction(token, otp, victim)).resolves.toBeTruthy();
    });
  });
});
