import { serve } from "../packages/cli/serve.js";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const APP_FLOW_DIR = fileURLToPath(new URL("../fixtures/projects/taskdeck/build", import.meta.url));

import { test, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";

// The integration fixture project. Tests used to compile the repository root,
// which required the root to be an AXL project -- moving that project out is
// what this constant replaces.
const FIXTURE_PROJECT = fileURLToPath(new URL("../fixtures/projects/taskdeck", import.meta.url));

beforeAll(() => {
  // Ensure the manifest is compiled before running tests
  execSync("npx tsx ../../../packages/cli/index.ts compile", { cwd: FIXTURE_PROJECT, stdio: "ignore" });
});

test("session expiry", async () => {
  const PORT = 3943;
  // Make session timeout super short (2 seconds) for testing
  serve(APP_FLOW_DIR, { port: PORT, sessionTimeoutMs: 2000 });
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`));
  const client = new Client({ name: "t1", version: "1" }, { capabilities: {} });
  
  await client.connect(transport);

  // Make a request immediately
  await client.callTool({ name: "list_projects", arguments: {} });

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Should fail because the server closed it!
  let failed = false;
  try {
    await client.callTool({ name: "list_projects", arguments: {} });
  } catch (err: any) {
    failed = true;
  }
  
  expect(failed).toBe(true);
});
