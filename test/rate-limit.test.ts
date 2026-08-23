import { serve } from "../packages/cli/serve.js";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { test, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";

// The integration fixture project. Tests used to compile the repository root,
// which required the root to be an AXL project -- moving that project out is
// what this constant replaces.
const FIXTURE_PROJECT = fileURLToPath(new URL("../fixtures/projects/taskdeck", import.meta.url));

const APP_FLOW_DIR = fileURLToPath(new URL("../fixtures/projects/taskdeck/build", import.meta.url));

beforeAll(() => {
  // Ensure the manifest is compiled before running tests
  execSync("npx tsx ../../../packages/cli/index.ts compile", { cwd: FIXTURE_PROJECT, stdio: "ignore" });
});

test("rate limit isolation", async () => {
  const PORT = 3942;
  // Trust proxy so we can mock x-forwarded-for
  const srv = serve(APP_FLOW_DIR, { port: PORT, trustProxy: true });
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Create 2 independent clients simulating different IPs via X-Forwarded-For
  const t1 = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`), {
    requestInit: { headers: { "X-Forwarded-For": "10.0.0.1" } }
  });
  const t2 = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`), {
    requestInit: { headers: { "X-Forwarded-For": "10.0.0.2" } }
  });
  
  const c1 = new Client({ name: "t1", version: "1" }, { capabilities: {} });
  const c2 = new Client({ name: "t2", version: "1" }, { capabilities: {} });
  
  await c1.connect(t1);
  await c2.connect(t2);

  // Flood c1 to hit rate limit (10 req/min)
  let c1Fails = 0;
  for (let i = 0; i < 20; i++) {
    const res = await c1.callTool({ name: "list_tasks", arguments: { project_id: "p1" } });
    const text = (res.content as any)[0].text;
    if (res.isError && text.includes("Rate limit exceeded")) {
      c1Fails++;
      break;
    }
  }

  // Now verify c2 can still make a request without being rate-limited!
  const res2 = await c2.callTool({ name: "list_tasks", arguments: { project_id: "p1" } });
  const text2 = (res2.content as any)[0].text;
  
  expect(c1Fails).toBeGreaterThan(0);
  expect(res2.isError && text2.includes("Rate limit exceeded")).toBe(false);
});
