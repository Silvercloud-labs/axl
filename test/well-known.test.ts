import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from "../packages/cli/serve.js";
import { execSync } from "node:child_process";
import { fileURLToPath } from "url";
import http from "node:http";

// The integration fixture project. Tests used to compile the repository root,
// which required the root to be an AXL project -- moving that project out is
// what this constant replaces.
const FIXTURE_PROJECT = fileURLToPath(new URL("../fixtures/projects/taskdeck", import.meta.url));

const APP_FLOW_DIR = fileURLToPath(new URL("../fixtures/projects/taskdeck/build", import.meta.url));

const PORT_BOTH = 3962;

beforeAll(async () => {
  // Ensure the manifest is compiled
  execSync("npx tsx ../../../packages/cli/index.ts compile", { cwd: FIXTURE_PROJECT, stdio: "ignore" });

  // Start the server (always exposes both REST and MCP)
  await serve(APP_FLOW_DIR, { port: PORT_BOTH });

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 500));
});

describe("Discovery and Manifest Endpoints", () => {
  describe("Both transports active (default behavior)", () => {
    it("GET /.well-known/axl reports both rest and mcp as active", async () => {
      const res = await fetch(`http://localhost:${PORT_BOTH}/.well-known/axl`);
      expect(res.status).toBe(200);
      const body = await res.json();
      
      expect(body.version).toBe("1.0");
      expect(body.rest).toBe(`http://localhost:${PORT_BOTH}`);
      expect(body.mcp).toBe(`http://localhost:${PORT_BOTH}/mcp`);
      expect(body.manifest).toBe(`http://localhost:${PORT_BOTH}/manifest.json`);
    });

    // The two documents describe the same credential -- an Authorization: Bearer header
    // -- and used to disagree about its name ("bearer" vs "api_key"), which is a
    // contradiction inside a published contract.
    it("names the same auth scheme in both discovery documents", async () => {
      const axl = await (await fetch(`http://localhost:${PORT_BOTH}/.well-known/axl`)).json();
      const mcp = await (await fetch(`http://localhost:${PORT_BOTH}/.well-known/mcp`)).json();

      expect(axl.auth.type).toBe("bearer");
      expect(mcp.authentication.methods).toEqual(["bearer"]);
    });
  });

  // Both consumers of manifest.axl_version read it long before any compiler emitted it,
  // so both silently saw undefined.
  describe("axl_version", () => {
    it("is emitted by the compiler into the manifest", async () => {
      const body = await (await fetch(`http://localhost:${PORT_BOTH}/manifest.json`)).json();
      expect(body.axl_version).toBe("1.0");
    });

    it("is reported by /health alongside the app's own version", async () => {
      const body = await (await fetch(`http://localhost:${PORT_BOTH}/health`)).json();
      expect(body.axl_version).toBe("1.0");
      expect(body.version).toBe("1.0.0"); // the app's VERSION, a separate thing
      expect(body.name).toBe("TaskDeck");
    });
  });

  // A discovery document is a published contract: a client reads it and then talks to
  // whatever it points at. Built straight from the Host header, a forged Host produced
  // a document advertising an attacker-controlled origin.
  describe("Host header handling", () => {
    // Raw http.request, not fetch: Host is a forbidden header for fetch, so a forged
    // one is silently dropped and the test would prove nothing.
    function rawGet(path: string, host: string): Promise<any> {
      return new Promise((resolve, reject) => {
        const req = http.request(
          { host: "127.0.0.1", port: PORT_BOTH, path, method: "GET", headers: { Host: host } },
          (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => {
              try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
          }
        );
        req.on("error", reject);
        req.end();
      });
    }

    const wellKnown = (host: string) => rawGet("/.well-known/axl", host);

    // The fallback advertises the address the server actually bound, which is the whole
    // point -- not a friendly alias that may or may not resolve to it.
    it("ignores a forged Host and falls back to the bound address", async () => {
      const body = await wellKnown("evil.example");
      expect(body.rest).toBe(`http://127.0.0.1:${PORT_BOTH}`);
      expect(body.mcp).toBe(`http://127.0.0.1:${PORT_BOTH}/mcp`);
      expect(body.manifest).toBe(`http://127.0.0.1:${PORT_BOTH}/manifest.json`);
      expect(JSON.stringify(body)).not.toContain("evil.example");
    });

    it("ignores a forged Host on /.well-known/mcp too", async () => {
      const body = await rawGet("/.well-known/mcp", "evil.example");
      expect(body.endpoints.streamable_http).toBe(`http://127.0.0.1:${PORT_BOTH}/mcp`);
    });

    it("accepts a Host that matches what the server actually bound", async () => {
      expect((await wellKnown(`127.0.0.1:${PORT_BOTH}`)).rest).toBe(`http://127.0.0.1:${PORT_BOTH}`);
      expect((await wellKnown(`localhost:${PORT_BOTH}`)).rest).toBe(`http://localhost:${PORT_BOTH}`);
    });

    it("rejects the right host on the wrong port", async () => {
      expect((await wellKnown("localhost:9999")).rest).toBe(`http://127.0.0.1:${PORT_BOTH}`);
    });

    // Reverse-proxy deployments legitimately serve under a different name, so silently
    // rewriting their public URL would be its own bug.
    it("honours AXL_ALLOWED_HOSTS", async () => {
      const prev = process.env.AXL_ALLOWED_HOSTS;
      process.env.AXL_ALLOWED_HOSTS = "api.example.com";
      try {
        expect((await wellKnown("api.example.com")).rest).toBe("http://api.example.com");
        expect((await wellKnown("other.example.com")).rest).toBe(`http://127.0.0.1:${PORT_BOTH}`);
      } finally {
        if (prev === undefined) delete process.env.AXL_ALLOWED_HOSTS;
        else process.env.AXL_ALLOWED_HOSTS = prev;
      }
    });

    it("honours AXL_PUBLIC_URL outright", async () => {
      const prev = process.env.AXL_PUBLIC_URL;
      process.env.AXL_PUBLIC_URL = "https://axl.example.com/";
      try {
        const body = await wellKnown("evil.example");
        expect(body.rest).toBe("https://axl.example.com");
        expect(body.mcp).toBe("https://axl.example.com/mcp");
        expect(body.ws).toBe("wss://axl.example.com/ws");
      } finally {
        if (prev === undefined) delete process.env.AXL_PUBLIC_URL;
        else process.env.AXL_PUBLIC_URL = prev;
      }
    });
  });

  describe("Manifest endpoint", () => {
    it("GET /manifest.json returns compiled manifest with Cache-Control", async () => {
      const res = await fetch(`http://localhost:${PORT_BOTH}/manifest.json`);
      expect(res.status).toBe(200);
      
      // Check headers
      expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
      // Express ETag is enabled by default for res.json()
      expect(res.headers.get("etag")).toBeDefined();
      expect(res.headers.get("etag")?.length).toBeGreaterThan(0);
      
      // Check content
      const body = await res.json();
      expect(body.app).toBeDefined();
      expect(body.app.name).toBe("TaskDeck"); // Default from example or compilation
      expect(body.actions).toBeDefined();
    });

    it("GET /manifest.json is accessible without authentication", async () => {
      // Explicitly no auth header
      const res = await fetch(`http://localhost:${PORT_BOTH}/manifest.json`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.app).toBeDefined();
    });
  });
});
