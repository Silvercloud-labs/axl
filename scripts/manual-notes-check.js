// Run this script manually using: node scripts/manual-notes-check.js
// Prerequisites: Ensure `node fixtures/projects/notes/backend/server.js` and `npx axl serve --port 3941` (inside fixtures/projects/notes) are running.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  console.log("=== 1. Registering a new user ===");
  const regRes = await fetch("http://127.0.0.1:4100/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `notes-user-${Date.now()}@axl.dev`, password: "pw" }),
  });
  
  if (!regRes.ok) throw new Error(`Registration failed: ${regRes.status}`);
  const { sid } = await regRes.json();
  console.log("Got session ID:", sid);

  console.log("\n=== 2. Setting up AXL MCP Clients ===");
  
  // Unauthenticated client
  const publicTransport = new StreamableHTTPClientTransport(
    new URL("http://127.0.0.1:3941/mcp")
  );
  const publicClient = new Client({ name: "public-client", version: "1.0" });
  await publicClient.connect(publicTransport);
  console.log("Connected unauthenticated client.");

  // Authenticated client
  const authTransport = new StreamableHTTPClientTransport(
    new URL("http://127.0.0.1:3941/mcp"),
    { requestInit: { headers: { "Authorization": `Bearer sid=${sid}` } } }
  );
  const authClient = new Client({ name: "auth-client", version: "1.0" });
  await authClient.connect(authTransport);
  console.log("Connected authenticated client.");

  console.log("\n=== 3. Calling 'list_notes' (PUBLIC) with Unauthenticated Client ===");
  const list1 = await publicClient.callTool({ name: "list_notes", arguments: {} });
  console.log("Result:");
  console.log(JSON.stringify(list1, null, 2));

  console.log("\n=== 4. Calling 'create_note' (AUTH) with Authenticated Client ===");
  const createRes = await authClient.callTool({
    name: "create_note",
    arguments: { title: "Test Note", content: "hello world" }
  });
  const createdNote = JSON.parse(createRes.content[0].text);
  console.log("Result:");
  console.log(JSON.stringify(createdNote, null, 2));

  console.log("\n=== 5. Calling 'delete_note' (AUTH + OTP) with Authenticated Client ===");
  const deleteRes = await authClient.callTool({
    name: "delete_note",
    arguments: { id: createdNote.id }
  });
  const deletePausedState = JSON.parse(deleteRes.content[0].text);
  console.log("Paused Result:");
  console.log(JSON.stringify(deletePausedState, null, 2));

  console.log("\n=== 6. Calling 'confirm_action' to complete deletion ===");
  const confirmRes = await authClient.callTool({
    name: "confirm_action",
    arguments: {
      token: deletePausedState.token,
      otp: deletePausedState.otp_demo_only
    }
  });
  console.log("Confirmation Result:");
  console.log(JSON.stringify(JSON.parse(confirmRes.content[0].text), null, 2));

  console.log("\n=== 7. Calling 'list_notes' again to verify deletion ===");
  const list2 = await publicClient.callTool({ name: "list_notes", arguments: {} });
  console.log("Result:");
  console.log(JSON.stringify(list2, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
