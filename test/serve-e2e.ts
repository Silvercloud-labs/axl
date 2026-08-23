import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "../packages/cli/serve.js";
import path from "path";
import { fileURLToPath } from "url";

const APP_FLOW_DIR = fileURLToPath(new URL("../fixtures/projects/taskdeck/build", import.meta.url));

// Small wrapper to ensure we exit cleanly on tests
async function runTest() {
  const PORT = 3940;
  
  // 1. Start the server
  // Note: we can just call serve() because it sets up the Express server
  // and listens on the port asynchronously (though serve itself doesn't return the server instance,
  // we'll just let it run in the background).
  serve(APP_FLOW_DIR, { port: PORT });
  
  // Give the server a moment to start
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log("=== 1. Check health endpoint ===");
  const healthRes = await fetch(`http://localhost:${PORT}/health`);
  const health = await healthRes.json();
  console.log("Health:", health);
  if (!health.name) throw new Error("Health endpoint failed");

  console.log("\n=== 1.5. Check discovery endpoint ===");
  const discoveryRes = await fetch(`http://localhost:${PORT}/.well-known/mcp`);
  const discovery = await discoveryRes.json();
  console.log("Discovery:", discovery);
  
  if (discovery.mcp_version !== "1.0") throw new Error("Missing or invalid mcp_version");
  if (discovery.server_name !== "TaskDeck") throw new Error("Missing or invalid server_name");
  if (discovery.server_version !== "1.0.0") throw new Error("Missing or invalid server_version");
  if (discovery.endpoints?.streamable_http !== `http://localhost:${PORT}/mcp`) throw new Error("Missing or invalid streamable_http endpoint URL");
  if (discovery.capabilities?.tools !== true) throw new Error("Missing or invalid tools capability");
  if (!discovery.authentication?.required) throw new Error("Discovery endpoint should require authentication");

  console.log("\n=== 2. Register two real users ===");
  const reg1 = await fetch("http://localhost:4000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `user1_${Date.now()}@axl.dev`, password: "pw" }),
  });
  const { sid: sid1 } = await reg1.json();
  
  const reg2 = await fetch("http://localhost:4000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `user2_${Date.now()}@axl.dev`, password: "pw" }),
  });
  const { sid: sid2 } = await reg2.json();
  
  console.log("User 1 Session:", sid1);
  console.log("User 2 Session:", sid2);

  console.log("\n=== 3. Connect two clients with different session headers ===");
  // Create transport 1
  const transport1 = new StreamableHTTPClientTransport(
    new URL(`http://localhost:${PORT}/mcp`),
    { requestInit: { headers: { "X-AXL-Session": `sid=${sid1}` } } }
  );
  const client1 = new Client({ name: "test-client-1", version: "1.0" });
  await client1.connect(transport1);
  
  // Create transport 2
  const transport2 = new StreamableHTTPClientTransport(
    new URL(`http://localhost:${PORT}/mcp`),
    { requestInit: { headers: { "Authorization": `Bearer sid=${sid2}` } } }
  );
  const client2 = new Client({ name: "test-client-2", version: "1.0" });
  await client2.connect(transport2);
  
  console.log("Both clients connected.");

  console.log("\n=== 4. Test session isolation ===");
  // Client 1 creates a project
  const c1Res = await client1.callTool({
    name: "create_project",
    arguments: { name: "User 1 Project" }
  });
  const project1 = JSON.parse((c1Res.content as any)[0].text);
  console.log("Client 1 project:", project1);

  // Client 2 creates a project
  const c2Res = await client2.callTool({
    name: "create_project",
    arguments: { name: "User 2 Project" }
  });
  const project2 = JSON.parse((c2Res.content as any)[0].text);
  console.log("Client 2 project:", project2);

  // Now client 1 lists projects, should only see theirs
  const listRes = await client1.callTool({
    name: "list_projects",
    arguments: {}
  });
  const projects = JSON.parse((listRes.content as any)[0].text);
  console.log("Client 1 sees projects:", projects);
  
  if (projects.some((p: any) => p.name === "User 2 Project")) {
    throw new Error("FAIL: Client 1 can see Client 2's project! Session isolation is broken.");
  }
  
  console.log("\n=== 5. Test Workflow Execution ===");
  // Create a task to delete
  const createTaskRes = await client1.callTool({
    name: "create_task",
    arguments: {
      project_id: project1.id,
      title: "Task to delete"
    }
  });
  const taskToDelete = JSON.parse((createTaskRes.content as any)[0].text);
  
  // Client 1 runs ProjectDeletion workflow which requires OTP
  const wfRes = await client1.callTool({
    name: "run_workflow",
    arguments: {
      workflowName: "ProjectDeletion",
      initialArgs: { task_id: taskToDelete.id }
    }
  });
  const wfState = JSON.parse((wfRes.content as any)[0].text);
  console.log("Workflow Paused State:", wfState);
  
  if (!wfState.confirmationRequired) {
    throw new Error("FAIL: Workflow did not pause for confirmation!");
  }
  
  // Client 1 resumes workflow with OTP
  const resumeRes = await client1.callTool({
    name: "resume_workflow",
    arguments: {
      token: wfState.token,
      otp: wfState.otp_demo_only
    }
  });
  const resumeState = JSON.parse((resumeRes.content as any)[0].text);
  console.log("Workflow Resumed State:", resumeState);
  
  if (resumeState.status !== "COMPLETED") {
    throw new Error("FAIL: Workflow did not complete after resume!");
  }

  console.log("\n✅ ALL ISOLATION & WORKFLOW CHECKS PASSED");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
