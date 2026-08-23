import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadManifest } from "./manifest.js";
import {
  AxlEngine,
  PermissionError,
  BackendError,
  TimeoutError,
  ValidationError,
  NotFoundError,
  TooManyAttemptsError,
  RateLimitError,
  safeErrorMessage
} from "./engine.js";
import { buildZodShape } from "./schema-utils.js";

/**
 * Classifies an engine error into the same branch set rest-adapter.js's sendError uses,
 * so a caller gets the same diagnosis whichever transport they came in on.
 *
 * MCP only checked four types, so anything else -- including a plain rate-limit
 * rejection on an ordinary action call -- came back as the catch-all WORKFLOW_ERROR,
 * while REST correctly reported RATE_LIMIT_EXCEEDED with a 429. `fallback` is the
 * catch-all for genuinely unclassified faults and differs per call site
 * (WORKFLOW_ERROR, CONFIRMATION_FAILED, RESUME_FAILED) so existing MCP clients keep
 * seeing the code they already handle.
 */
function errorPayload(err, fallback) {
  if (err instanceof ValidationError) {
    return { error: "VALIDATION_ERROR", message: err.message };
  }
  if (err instanceof PermissionError) {
    return { error: "PERMISSION_DENIED", message: err.message };
  }
  if (err instanceof NotFoundError) {
    return { error: "NOT_FOUND", message: err.message };
  }
  if (err instanceof TooManyAttemptsError) {
    return { error: "TOO_MANY_ATTEMPTS", message: err.message };
  }
  if (err instanceof RateLimitError) {
    return { error: "RATE_LIMIT_EXCEEDED", message: err.message };
  }
  // Its own code rather than folding into BACKEND_ERROR: a timeout has no upstream
  // status to report, so BACKEND_ERROR would arrive with `status: undefined` on a field
  // clients read as a real HTTP code. REST maps the same error to 504.
  if (err instanceof TimeoutError) {
    return { error: "TIMEOUT", message: err.message, timeout_ms: err.timeoutMs };
  }
  if (err instanceof BackendError) {
    return { error: "BACKEND_ERROR", status: err.status, body: err.body };
  }
  return { error: fallback, message: safeErrorMessage(err) };
}

/**
 * @param {string} manifestPath
 * @param {{ sessionCookie?: string, contextExtractor?: () => object, engine?: any, stateStore?: any }} [options]
 */
export function buildAxlServer(manifestPath, { sessionCookie, contextExtractor, engine, stateStore } = {}) {
  const manifest = loadManifest(manifestPath);
  const actualEngine = engine || new AxlEngine(manifest, stateStore);
  const server = new McpServer({
    name: `axl-${manifest.app.name.toLowerCase().replace(/\s+/g, "-")}`,
    // The application's version, not AXL's. This used to prefer manifest.axl_version,
    // which no compiler ever emitted, so it silently fell through to app.version. Now
    // that axl_version IS emitted, preferring it would report the AXL protocol version
    // as every application's version -- which is not what an MCP client is asking for.
    version: manifest.app.version || "1.0",
  });
  registerTools(server, manifest, actualEngine, sessionCookie, contextExtractor);
  return { server, engine: actualEngine, manifest };
}



/**
 * The MCP URI for a resource. Exported so the REST/discovery side and any test can
 * derive the same string instead of hardcoding the scheme in several places.
 */
export function resourceUri(resourceName) {
  return `axl://resource/${encodeURIComponent(resourceName)}`;
}

/**
 * Builds the description an MCP client actually shows a model.
 *
 * The declarative consequence metadata is appended in the same style CONFIRM already
 * uses, because that is the only channel through which a calling model learns anything
 * about an action beyond its name and arguments. An autonomous caller can read
 * "IRREVERSIBLE" and choose to ask a human first; it cannot infer that from POST.
 *
 * Order is deliberate: irreversibility first, because it is the one fact that should
 * change whether the call happens at all.
 */
export function toolDescription(def) {
  let text = def.description ?? "";
  if (def.irreversible) text += " [IRREVERSIBLE: this action cannot be undone]";
  if (def.effects) text += ` [Effects: ${def.effects}]`;
  if (def.side_effects) text += ` [Side effects: ${def.side_effects}]`;
  if (def.confirm) text += " (requires human confirmation before executing)";
  return text;
}

function textResult(obj, isError = false) {
  return { content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }], isError };
}

function registerTools(server, manifest, engine, sessionCookie, contextExtractor) {
  // Register every action from actions.flow as an MCP tool.
  for (const [actionName, actionDef] of Object.entries(manifest.actions)) {
    server.registerTool(
      actionName,
      {
        title: actionName,
        description: toolDescription(actionDef),
        inputSchema: buildZodShape(actionDef.input, manifest.entities),
      },
      async (args) => {
        try {
          let context = { sessionCookie };
          if (contextExtractor) {
            context = { ...context, ...contextExtractor() };
          }
          const result = await engine.execute(actionName, args, context);
          return textResult(result);
        } catch (err) {
          return textResult(errorPayload(err, "WORKFLOW_ERROR"), true);
        }
      }
    );
  }

  // Register every resource from resources.flow as a real MCP resource.
  //
  // These are registered through registerResource, NOT registerTool. The distinction is
  // the entire point of the primitive: a client asking "what can I read?" calls
  // resources/list, and a model choosing an action reads the tool list. Exposing a
  // resource as a zero-argument tool would put a read into the mutation menu and leave
  // resources/list empty, which is how a server ends up advertising a capability it does
  // not have.
  //
  // URI scheme `axl://resource/<name>`: stable, derived from the manifest, and namespaced
  // so it cannot collide with a real http(s) URL the backend might also serve.
  for (const [resourceName, resourceDef] of Object.entries(manifest.resources || {})) {
    server.registerResource(
      resourceName,
      resourceUri(resourceName),
      {
        title: resourceName,
        description: resourceDef.description,
        mimeType: "application/json",
      },
      async (uri) => {
        // Permission is enforced by the engine, on this caller's context -- the same
        // check REST goes through. A resources/read is not a privileged path.
        let context = { sessionCookie };
        if (contextExtractor) {
          context = { ...context, ...contextExtractor() };
        }

        let result;
        try {
          result = await engine.readResource(resourceName, context);
        } catch (err) {
          // resources/read has no isError envelope the way a tool call does -- a failure
          // is a JSON-RPC protocol error, and the SDK puts the thrown message straight on
          // the wire. Rethrowing raw would bypass the redaction every other transport
          // applies, so an unexpected internal fault could leak a connection string here
          // while REST returned "Internal error." for the same thing. Classify with the
          // same branch set, and carry the code so the message stays diagnosable.
          const payload = errorPayload(err, "RESOURCE_READ_FAILED");
          throw new Error(`${payload.error}: ${payload.message ?? safeErrorMessage(err)}`);
        }

        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          }],
        };
      }
    );
  }

  // One extra, always-present tool: the second phase of any OTP-gated action.
  server.registerTool(
    "confirm_action",
    {
      title: "confirm_action",
      description:
        "Confirms a pending action that required human approval. Requires the token " +
        "returned by the original action call, plus the OTP code.",
      inputSchema: {
        token: z.string(),
        otp: z.string(),
      },
    },
    async ({ token, otp }) => {
      try {
        // The confirming caller's own context, not the one captured when the
        // confirmation was requested -- the engine binds the token to its requester.
        let context = { sessionCookie };
        if (contextExtractor) {
          context = { ...context, ...contextExtractor() };
        }
        const result = await engine.confirmAction(token, otp, context);
        return textResult(result);
      } catch (err) {
        return textResult(errorPayload(err, "CONFIRMATION_FAILED"), true);
      }
    }
  );

  if (manifest.workflows) {
    server.registerTool(
      "run_workflow",
      {
        title: "run_workflow",
        description: "Runs a workflow defined in the manifest.",
        inputSchema: {
          workflowName: z.string(),
          // z.record takes (keyType, valueType) in Zod 4. The single-argument call this
          // replaces happens to behave identically at runtime and emits the same JSON
          // Schema, so nothing was broken -- but it only type-checked because nothing was
          // type-checking this file.
          initialArgs: z.record(z.string(), z.any()).optional().describe("Initial arguments for the workflow.")
        }
      },
      async ({ workflowName, initialArgs }) => {
        try {
          let context = { sessionCookie };
          if (contextExtractor) {
            context = { ...context, ...contextExtractor() };
          }
          const result = await engine.runWorkflow(workflowName, initialArgs || {}, context);
          return textResult(result);
        } catch (err) {
          return textResult(errorPayload(err, "WORKFLOW_ERROR"), true);
        }
      }
    );

    server.registerTool(
      "resume_workflow",
      {
        title: "resume_workflow",
        description: "Resumes a paused workflow.",
        inputSchema: {
          token: z.string(),
          otp: z.string()
        }
      },
      async ({ token, otp }) => {
        try {
          let context = { sessionCookie };
          if (contextExtractor) {
            context = { ...context, ...contextExtractor() };
          }
          const result = await engine.resumeWorkflow(token, otp, context);
          return textResult(result);
        } catch (err) {
          return textResult(errorPayload(err, "RESUME_FAILED"), true);
        }
      }
    );
  }
}

export async function startAxlServer(manifestPath, opts = {}) {
  const { server, engine, manifest } = buildAxlServer(manifestPath, opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { server, engine, manifest };
}
