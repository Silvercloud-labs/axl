import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { serve } from "../packages/cli/serve.js";
import path from "path";
import { fileURLToPath } from "url";
import { compileFixture } from "./helpers/fixture-project.js";

const APP_FLOW_DIR = compileFixture();

describe("WebSocket Transport", () => {
  const PORT = 3999;
  let serverProcess: any;

  beforeAll(async () => {
    // Start the AXL Server
    serve(APP_FLOW_DIR, { port: PORT });
    
    // Give it a moment to start
    await new Promise(r => setTimeout(r, 1000));
  });

  it("should connect, authenticate via query token, and isolate events", async () => {
    return new Promise<void>((resolve, reject) => {
      // Connect two clients with different tokens via query params
      const wsA = new WebSocket(`ws://localhost:${PORT}/ws?token=token_a`);
      const wsB = new WebSocket(`ws://localhost:${PORT}/ws?token=token_b`);
      
      let eventsA: any[] = [];
      let eventsB: any[] = [];

      let openCount = 0;
      const checkOpen = () => {
        openCount++;
        if (openCount === 2) {
          // Both connected. Let's trigger an action for client A via REST.
          // This will emit `action.started` and `action.completed` scoped to Client A.
          fetch(`http://localhost:${PORT}/actions/list_projects`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer token_a"
            },
            body: JSON.stringify({})
          }).catch(reject);
        }
      };

      wsA.on("open", checkOpen);
      wsB.on("open", checkOpen);

      wsA.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        // ignore pong
        if (msg.type !== "pong") {
          eventsA.push(msg);
          // Assert that the sessionCookie was stripped from the wire
          if (msg.data && msg.data.context) {
            expect(msg.data.context.sessionCookie).toBeUndefined();
          }
        }
      });

      wsB.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type !== "pong") {
          eventsB.push(msg);
        }
      });

      wsA.on("error", reject);
      wsB.on("error", reject);
      
      // Wait a bit to ensure all events settle
      setTimeout(() => {
        try {
          // Client A should have received the action events
          expect(eventsA.length).toBeGreaterThan(0);
          const startedEvent = eventsA.find(e => e.type === "action.started");
          expect(startedEvent).toBeDefined();

          // Client B should not receive Client A's events
          if (eventsB.length !== 0) {
            console.error("Events B received:", JSON.stringify(eventsB, null, 2));
          }
          expect(eventsB.length).toBe(0);

          wsA.close();
          wsB.close();
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 1500);
    });
  });
});
