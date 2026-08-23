// Run this script manually using: node scripts/manual-workflow-check.js
// Prerequisites: Ensure `npx axl serve --port 3939` (inside the axl root) and `node fixtures/backend/server.js` are already running.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  console.log("=== 1. Registering a new user to get a session ===");
  
  const regRes = await fetch("http://localhost:4000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `manual-wf-${Date.now()}@axl.dev`, password: "pw123" }),
  });
  
  if (!regRes.ok) {
    throw new Error(`Failed to register: ${regRes.status} ${regRes.statusText}`);
  }
  
  const { sid } = await regRes.json();
  console.log("Got session ID:", sid);

  console.log("\n=== 2. Connecting to AXL MCP Server ===");
  
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
  
  const client = new Client({ name: "manual-wf-client", version: "1.0" });
  await client.connect(transport);
  
  console.log("Connected successfully.");
  
  console.log("\n=== 3. Creating Project and Task ===");
  const createProjectRes = await client.callTool({
    name: "create_project",
    arguments: { name: "Workflow Test Project" }
  });
  const project = JSON.parse(createProjectRes.content[0].text);
  console.log("Created Project:", project);

  const createTaskRes = await client.callTool({
    name: "create_task",
    arguments: { project_id: project.id, title: "Task to Delete" }
  });
  const task = JSON.parse(createTaskRes.content[0].text);
  console.log("Created Task:", task);

  console.log("\n=== 4. Running 'ProjectDeletion' Workflow ===");
  const runWfRes = await client.callTool({
    name: "run_workflow",
    arguments: {
      workflowName: "ProjectDeletion",
      initialArgs: { task_id: task.id }
    }
  });
  
  const wfPausedState = JSON.parse(runWfRes.content[0].text);
  console.log("Workflow Paused Result:");
  console.log(JSON.stringify(wfPausedState, null, 2));

  console.log("\n=== 5. Resuming Workflow ===");
  const resumeWfRes = await client.callTool({
    name: "resume_workflow",
    arguments: {
      token: wfPausedState.token,
      otp: wfPausedState.otp_demo_only
    }
  });
  
  const wfCompletedState = JSON.parse(resumeWfRes.content[0].text);
  console.log("Workflow Resume Result:");
  console.log(JSON.stringify(wfCompletedState, null, 2));

  console.log("\n=== 6. Verifying Task is Deleted ===");
  const listTasksRes = await client.callTool({
    name: "list_tasks",
    arguments: { project_id: project.id }
  });
  
  const tasksList = JSON.parse(listTasksRes.content[0].text);
  console.log("Remaining Tasks in Project:");
  console.log(JSON.stringify(tasksList, null, 2));
  
  process.exit(0);
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
