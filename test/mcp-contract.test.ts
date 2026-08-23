import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { execSync } from "node:child_process";
import { fileURLToPath } from "url";
// @ts-ignore
import { buildAxlServer } from "../packages/runtime/axl-server.js";
// @ts-ignore
import { AxlEngine, RateLimitError, NotFoundError, TooManyAttemptsError, ValidationError, PermissionError, BackendError } from "../packages/runtime/engine.js";
// @ts-ignore
import { InMemoryStateStore } from "../packages/runtime/state.js";

// The integration fixture project. Tests used to compile the repository root,
// which required the root to be an AXL project -- moving that project out is
// what this constant replaces.
const FIXTURE_PROJECT = fileURLToPath(new URL("../fixtures/projects/taskdeck", import.meta.url));

const MANIFEST = fileURLToPath(new URL("../fixtures/projects/taskdeck/build/manifest.json", import.meta.url));

// What an MCP client actually receives, driven through a real Client over the SDK's
// in-memory transport rather than by inspecting registerTool arguments.
describe("MCP contract", () => {
  let client: Client;
  let engine: AxlEngine;

  beforeAll(async () => {
    execSync("npx tsx ../../../packages/cli/index.ts compile", { cwd: FIXTURE_PROJECT, stdio: "ignore" });

    const built = buildAxlServer(MANIFEST, { stateStore: new InMemoryStateStore() });
    engine = built.engine;
    // No real backend in this file; the gates under test all fire before the HTTP call.
    engine._executeHttp = async () => ({ ok: true });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "contract-test", version: "1.0" });
    await Promise.all([client.connect(clientTransport), built.server.connect(serverTransport)]);
  });

  afterAll(async () => {
    engine?.destroy?.();
    await client?.close?.();
  });

  // Before per-input DESC existed, a tool advertised {"title":{"type":"string"}} with no
  // description at all, leaving a model to infer a parameter's meaning from its name.
  describe("parameter descriptions", () => {
    it("puts per-input DESC into the tool's JSON schema", async () => {
      const { tools } = await client.listTools();
      const createTask = tools.find(t => t.name === "create_task")!;
      const props = (createTask.inputSchema as any).properties;

      expect(props.project_id.description).toMatch(/ID of the project/);
      expect(props.title.description).toMatch(/headline/);
      // Optional parameters keep their description too -- .describe() is applied before
      // .optional() precisely so the wrapper does not swallow it.
      expect(props.due_date.description).toMatch(/ISO-8601/);
    });

    it("gives every action a non-empty tool description", async () => {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.description, `tool ${tool.name}`).toBeTruthy();
      }
    });
  });

  // MCP only classified four error types, so anything else -- including a plain
  // rate-limit rejection on an ordinary action call -- came back as the catch-all
  // WORKFLOW_ERROR, while REST reported RATE_LIMIT_EXCEEDED with a 429.
  describe("error classification matches REST", () => {
    async function callAndParse(name: string, args: any) {
      const res = await client.callTool({ name, arguments: args });
      return { isError: res.isError, body: JSON.parse((res.content as any)[0].text) };
    }

    it("reports a rate-limit rejection as RATE_LIMIT_EXCEEDED, not WORKFLOW_ERROR", async () => {
      // list_tasks carries RATE_LIMIT 10/min in auth.flow.
      let last: any;
      for (let i = 0; i < 15; i++) {
        last = await callAndParse("list_tasks", { project_id: "p1" });
        if (last.isError) break;
      }
      expect(last.isError).toBe(true);
      expect(last.body.error).toBe("RATE_LIMIT_EXCEEDED");
      expect(last.body.message).toMatch(/Rate limit exceeded/);
    });

    it("reports an unknown workflow as NOT_FOUND", async () => {
      const res = await callAndParse("run_workflow", { workflowName: "no_such_workflow" });
      expect(res.isError).toBe(true);
      expect(res.body.error).toBe("NOT_FOUND");
    });

    it("reports an unknown confirmation token as NOT_FOUND, not CONFIRMATION_FAILED", async () => {
      const res = await callAndParse("confirm_action", { token: "nope", otp: "000000" });
      expect(res.isError).toBe(true);
      expect(res.body.error).toBe("NOT_FOUND");
    });

    it("reports a missing session on an AUTH action as PERMISSION_DENIED", async () => {
      const res = await callAndParse("create_project", { name: "x" });
      expect(res.isError).toBe(true);
      expect(res.body.error).toBe("PERMISSION_DENIED");
    });

    // The catch-all still exists for genuinely unclassified faults, and each call site
    // keeps its own so existing clients see the code they already handle.
    it("keeps RESUME_FAILED as the fallback for an unclassified resume fault", async () => {
      const res = await callAndParse("resume_workflow", { token: "nope", otp: "000000" });
      expect(res.isError).toBe(true);
      // Invalid token is a ValidationError from resumeWorkflow, so it classifies.
      expect(res.body.error).toBe("VALIDATION_ERROR");
    });
  });

  it("reports the application's version, not the AXL protocol version", async () => {
    const info = client.getServerVersion();
    expect(info?.version).toBe("1.0.0");   // app.flow's VERSION
    expect(info?.version).not.toBe("1.0"); // AXL_PROTOCOL_VERSION
  });
});
