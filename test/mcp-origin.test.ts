import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve } from "../packages/cli/serve.js";
import { fileURLToPath } from "url";
import { compileFixture } from "./helpers/fixture-project.js";

const APP_FLOW_DIR = compileFixture();
const PORT = 3961;

let server: Awaited<ReturnType<typeof serve>>;

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } }
});

async function mcpPost(origin?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream"
  };
  if (origin !== undefined) headers["Origin"] = origin;
  return fetch(`http://127.0.0.1:${PORT}/mcp`, { method: "POST", headers, body: INITIALIZE });
}

describe("MCP Origin validation", () => {
  beforeAll(async () => {
    server = await serve(APP_FLOW_DIR, { port: PORT });
  });

  afterAll(async () => {
    await server.close();
  });

  // The DNS rebinding case the MCP spec requires blocking: attacker.example re-resolves
  // to 127.0.0.1, so the browser treats it as same-origin and CORS never engages. The
  // Origin header is the only thing that gives it away.
  it("rejects a cross-origin request with 403", async () => {
    const res = await mcpPost("http://evil.example.com");
    expect(res.status).toBe(403);
    expect((await res.json()).type).toBe("FORBIDDEN_ORIGIN");
  });

  it.each([
    ["null", "a sandboxed iframe or file:// page"],
    ["not-a-url", "a malformed origin"]
  ])("rejects %j (%s)", async (origin) => {
    expect((await mcpPost(origin)).status).toBe(403);
  });

  it.each([
    "http://localhost:5173",
    "http://127.0.0.1:3939",
    "http://[::1]:3939"
  ])("allows the loopback origin %s", async (origin) => {
    expect((await mcpPost(origin)).status).toBe(200);
  });

  // Browsers always attach Origin, so an attacker cannot suppress it. Clients that omit
  // it are non-browsers (Claude Desktop, curl, the MCP SDK) and must keep working.
  it("allows a request with no Origin header by default", async () => {
    expect((await mcpPost()).status).toBe(200);
  });

  it("honours AXL_ALLOWED_ORIGINS for non-loopback origins", async () => {
    const prev = process.env.AXL_ALLOWED_ORIGINS;
    process.env.AXL_ALLOWED_ORIGINS = "https://app.example.com";
    try {
      expect((await mcpPost("https://app.example.com")).status).toBe(200);
      expect((await mcpPost("https://other.example.com")).status).toBe(403);
    } finally {
      if (prev === undefined) delete process.env.AXL_ALLOWED_ORIGINS;
      else process.env.AXL_ALLOWED_ORIGINS = prev;
    }
  });

  it("requires the Origin header under AXL_MCP_STRICT_ORIGIN", async () => {
    const prev = process.env.AXL_MCP_STRICT_ORIGIN;
    process.env.AXL_MCP_STRICT_ORIGIN = "1";
    try {
      expect((await mcpPost()).status).toBe(403);
      expect((await mcpPost("http://localhost:5173")).status).toBe(200);
    } finally {
      if (prev === undefined) delete process.env.AXL_MCP_STRICT_ORIGIN;
      else process.env.AXL_MCP_STRICT_ORIGIN = prev;
    }
  });
});
