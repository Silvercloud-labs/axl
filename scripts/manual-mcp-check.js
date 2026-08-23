// Run this script manually using: node scripts/manual-mcp-check.js
// Prerequisites: Ensure `npx axl serve --port 3939` (inside the axl root) and `node fixtures/backend/server.js` are already running.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  console.log("Registering a new user to get a session...");
  
  const regRes = await fetch("http://localhost:4000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `manual-check-${Date.now()}@axl.dev`, password: "pw123" }),
  });
  
  if (!regRes.ok) {
    throw new Error(`Failed to register: ${regRes.status} ${regRes.statusText}`);
  }
  
  const { sid } = await regRes.json();
  console.log("Got session ID:", sid);

  console.log("\nConnecting to AXL MCP Server at http://localhost:3939/mcp ...");
  
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3939/mcp"),
    {
      requestInit: {
        headers: {
          "Authorization": `Bearer sid=${sid}`
        }
      }
    }
  );
  
  const client = new Client({ name: "manual-test-client", version: "1.0" });
  await client.connect(transport);
  
  console.log("Connected successfully.\n");
  
  console.log("Fetching available tools...");
  const toolsResponse = await client.listTools();
  console.log("Tools available:", toolsResponse.tools.map(t => t.name));
  
  console.log("\nCalling now-AUTH-gated tool 'list_projects'...");
  const actionResponse = await client.callTool({
    name: "list_projects",
    arguments: {}
  });
  
  console.log("Raw tool result:");
  console.log(JSON.stringify(actionResponse, null, 2));
  
  process.exit(0);
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
