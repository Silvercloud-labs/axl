import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "../packages/cli/serve.js";
import path from "path";
import { fileURLToPath } from "url";

const APP_FLOW_DIR = fileURLToPath(new URL("../fixtures/projects/taskdeck/build", import.meta.url));

async function runTest() {
  const PORT = 3941;
  serve(APP_FLOW_DIR, { port: PORT });
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log("=== 1. Register 10 users ===");
  const users: any[] = [];
  
  for (let i = 0; i < 10; i++) {
    const reg = await fetch("http://localhost:4000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `stress_user_${i}_${Date.now()}@axl.dev`, password: "pw" }),
    });
    const { sid } = await reg.json();
    users.push({ sid, id: i });
  }
  
  console.log(`Registered ${users.length} users successfully.`);

  console.log("\n=== 2. Create 10 concurrent MCP clients ===");
  const clients = await Promise.all(users.map(async (u) => {
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${PORT}/mcp`),
      { requestInit: { headers: { "X-AXL-Session": `sid=${u.sid}` } } }
    );
    const client = new Client({ name: `test-client-${u.id}`, version: "1.0" });
    await client.connect(transport);
    return { client, id: u.id };
  }));

  console.log("\n=== 3. Concurrently create projects and tasks ===");
  
  const results = await Promise.all(clients.map(async ({ client, id }) => {
    // Each client creates a project
    const pRes = await client.callTool({
      name: "create_project",
      arguments: { name: `Project ${id}` }
    });
    const project = JSON.parse((pRes.content as any)[0].text);
    
    // Each client creates a task
    const tRes = await client.callTool({
      name: "create_task",
      arguments: { project_id: project.id, title: `Task ${id}` }
    });
    const task = JSON.parse((tRes.content as any)[0].text);
    
    return { id, project, task };
  }));
  
  console.log("Concurrent creation successful.");

  console.log("\n=== 4. Assert session isolation ===");
  
  await Promise.all(clients.map(async ({ client, id }) => {
    const listRes = await client.callTool({
      name: "list_projects",
      arguments: {}
    });
    const projects = JSON.parse((listRes.content as any)[0].text);
    
    if (projects.length !== 1) {
      throw new Error(`FAIL: Client ${id} sees ${projects.length} projects, expected 1!`);
    }
    
    if (projects[0].name !== `Project ${id}`) {
      throw new Error(`FAIL: Client ${id} sees wrong project: ${projects[0].name}!`);
    }
  }));

  console.log("\n✅ ALL ISOLATION & CONCURRENCY CHECKS PASSED");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
