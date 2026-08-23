import express from "express";
import path from "path";
import fs from "fs";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { AsyncLocalStorage } from "node:async_hooks";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
// @ts-ignore
import { buildAxlServer } from "../runtime/axl-server.js";
// @ts-ignore
import { buildRestAdapter, problem } from "../runtime/rest-adapter.js";
// @ts-ignore
import { FileStateStore } from "../runtime/state.js";
// @ts-ignore
import { TransportManager } from "../runtime/transport-manager.js";
import { c, icons, errorBlock, section, blank } from "./ui.js";

// Storage for per-request context (like session cookie)
export const requestContext = new AsyncLocalStorage<{
  sessionCookie?: string,
  idempotencyKey?: string,
  ip?: string,
  identity?: { subject?: string, roles?: string[] },
  /**
   * Whether the trusted-identity-header channel is switched on at all.
   *
   * `identity` being undefined has two causes an operator has to fix differently: the
   * flag is off, or the flag is on and the gateway sent no claim. Without this the
   * engine could not tell them apart, and told an operator who had already set
   * --trust-identity-headers to go and set it.
   */
  identityTrusted?: boolean,
  /** Correlates one inbound request across its response, its events and its errors. */
  requestId?: string
}>();

/**
 * Headers a client may use to supply its own correlation id, in precedence order.
 *
 * Accepting a client-supplied id is the point: it lets a caller stitch an AXL request
 * to the trace it already has. It is not trusted for anything -- it is an opaque label
 * echoed back and attached to events, never an authorisation or routing input -- so
 * there is no need to gate it behind an operator flag the way identity headers are.
 * Length-capped and stripped of control characters so a hostile value cannot poison a
 * log line or a response header.
 */
const REQUEST_ID_HEADERS = ["x-request-id", "x-correlation-id", "x-amzn-trace-id"];
const MAX_REQUEST_ID_LENGTH = 200;

export function resolveRequestId(headers: import("http").IncomingHttpHeaders): string {
  for (const name of REQUEST_ID_HEADERS) {
    const raw = headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string") {
      // Control characters in a header value are how a response-splitting or
      // log-injection attempt arrives; drop them rather than reflecting them.
      const cleaned = value.replace(/[^\x20-\x7E]/g, "").trim().slice(0, MAX_REQUEST_ID_LENGTH);
      if (cleaned) return cleaned;
    }
  }
  return randomUUID();
}

/**
 * The per-request context handed to the engine.
 *
 * Spread rather than hand-copied. Both transports used to enumerate the fields they
 * forwarded, so a new context field had to be added in three places and silently
 * defaulted to undefined if it was not -- which is how `identityTrusted` reached the
 * engine as undefined and made a correctly-configured server report itself as
 * misconfigured. The store is assembled by AXL, never by a client, so there is nothing
 * to filter out.
 */
function currentContext() {
  return { ...requestContext.getStore() };
}

function isEnvFlagEnabled(value: string | undefined): boolean {
  return typeof value === "string" && ["1", "true", "yes"].includes(value.toLowerCase());
}

// Both loopback address families. "localhost" resolves to ::1 first on many systems
// (most Linux distros, Docker, GitHub Actions runners), so binding only 127.0.0.1
// leaves those clients with ECONNREFUSED against a server that is otherwise healthy.
const DEFAULT_LOOPBACK_HOSTS = ["127.0.0.1", "::1"];

// A host that simply does not exist in this environment -- e.g. ::1 in an
// IPv6-disabled container, which fails with EAFNOSUPPORT/EADDRNOTAVAIL. When we
// picked the host ourselves (the dual-stack default) that is not an error worth
// crashing over, as long as at least one address family came up.
const OPTIONAL_BIND_ERRORS = new Set(["EAFNOSUPPORT", "EADDRNOTAVAIL", "EPROTONOSUPPORT", "EINVAL"]);

// Matches express.json()'s own default, which is what the REST router already enforces.
// Kept as a named constant so the two transports cannot drift apart again.
const MCP_BODY_LIMIT = "100kb";

/**
 * Logs a server-side error without spilling the request payload into the log.
 *
 * body-parser attaches the raw, unparsed request body to its SyntaxError as `err.body`,
 * so `console.error("Express error:", err)` printed the whole payload -- verified with a
 * malformed request whose body carried a password and an API key, both of which landed
 * in the log verbatim. Logs get shipped, retained and read far more widely than
 * responses, so this is redacted even though it never crossed the wire.
 *
 * AXL_DEBUG_ERRORS=1 restores the full object for local debugging.
 */
function logServerError(label: string, err: any) {
  if (isEnvFlagEnabled(process.env.AXL_DEBUG_ERRORS)) {
    console.error(label, err);
    return;
  }
  console.error(label, {
    name: err?.name,
    message: err?.message,
    status: err?.status ?? err?.statusCode,
    ...(err?.body !== undefined ? { body: "[redacted]" } : {}),
    stack: err?.stack
  });
}

/**
 * The message to return for an error that never reached the engine -- body-parser
 * rejections, mostly.
 *
 * "Internal Server Error" is the right answer for a 5xx and the wrong one for a 4xx: a
 * malformed JSON body correctly returned 400, then told the caller the server had
 * faulted, which sends them looking in the wrong place. 4xx means the request was the
 * problem, so say which part of it was. These strings describe the *shape* of the
 * request, never its content or any internal state, so they are safe without the
 * AXL_DEBUG_ERRORS opt-in.
 */
function clientErrorMessage(err: any, status: number): string {
  if (status >= 500) return "Internal Server Error";

  switch (err?.type) {
    case "entity.parse.failed":
      return "Malformed JSON in request body.";
    case "entity.too.large":
      return "Request body too large.";
    case "encoding.unsupported":
      return "Unsupported content encoding.";
    case "charset.unsupported":
      return "Unsupported charset.";
    case "request.aborted":
      return "Request aborted.";
    case "request.size.invalid":
      return "Request size did not match Content-Length.";
  }

  if (status === 404) return "Not Found";
  if (status === 413) return "Request body too large.";
  if (status === 415) return "Unsupported media type.";
  return "Bad Request";
}

/**
 * The machine-readable code for an error that never reached the engine. Reuses the same
 * vocabulary the engine's own errors use, so a client branches on one set of `type`
 * values regardless of how far into the stack the request got.
 */
function problemType(err: any, status: number): string {
  if (status >= 500) return "INTERNAL_ERROR";
  switch (err?.type) {
    case "entity.parse.failed":   return "MALFORMED_JSON";
    case "entity.too.large":      return "PAYLOAD_TOO_LARGE";
    case "encoding.unsupported":
    case "charset.unsupported":   return "UNSUPPORTED_MEDIA_TYPE";
    case "request.aborted":       return "REQUEST_ABORTED";
    case "request.size.invalid":  return "INVALID_REQUEST_SIZE";
  }
  if (status === 404) return "NOT_FOUND";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 415) return "UNSUPPORTED_MEDIA_TYPE";
  return "BAD_REQUEST";
}

function problemTitle(status: number): string {
  if (status >= 500) return "Internal error";
  if (status === 404) return "Not found";
  if (status === 413) return "Payload too large";
  if (status === 415) return "Unsupported media type";
  return "Bad request";
}

// IPv6 literals need brackets to be usable in a URL.
function formatHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "::1" || h === "0:0:0:0:0:0:0:1" || /^127\./.test(h);
}

/**
 * MCP spec: servers MUST validate the Origin header to prevent DNS rebinding, where a
 * page on attacker.example re-resolves its own hostname to 127.0.0.1. The browser then
 * treats the request as same-origin (so CORS never engages) but still sends
 * `Origin: http://attacker.example` -- which is the only thing that distinguishes the
 * attack from a legitimate local client.
 *
 * A *missing* Origin is allowed by default. Browsers always attach one, so an attacker
 * cannot suppress it; every client that omits it is a non-browser (Claude Desktop, curl,
 * the MCP SDK). Rejecting those buys no security and breaks the normal case. Set
 * AXL_MCP_STRICT_ORIGIN=1 to require the header anyway.
 */
function isOriginAllowed(origin: string | undefined): boolean {
  if (origin === undefined) return !isEnvFlagEnabled(process.env.AXL_MCP_STRICT_ORIGIN);

  const allowList = (process.env.AXL_ALLOWED_ORIGINS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (allowList.includes(origin)) return true;

  // "null" is what a sandboxed iframe or a file:// page sends -- never trusted.
  if (origin === "null") return false;

  try {
    return isLoopbackHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * Turns the Host header into the origin a discovery document should advertise.
 *
 * `/.well-known/axl` and `/.well-known/mcp` are published contracts -- a client reads
 * them and then talks to whatever they point at. Built straight from `req.get("host")`,
 * a forged Host produced a discovery document advertising an attacker-controlled
 * origin, signed by nothing but the fact that it came from this server.
 *
 * So Host is now validated against what the server actually bound, and anything it does
 * not recognise falls back to the canonical bound address. Deployments that legitimately
 * sit behind a reverse proxy under a different name have two escape hatches, because
 * silently rewriting their public URL would be its own bug:
 *   AXL_PUBLIC_URL     -- the exact origin to advertise, wins outright
 *   AXL_ALLOWED_HOSTS  -- comma-separated extra Host values to accept as-is
 */
function makeBaseUrlResolver(getBound: () => { host: string, port: number } | undefined) {
  return function resolveBaseUrl(req: express.Request): string {
    const publicUrl = (process.env.AXL_PUBLIC_URL || "").trim().replace(/\/+$/, "");
    if (publicUrl) return publicUrl;

    const protocol = req.protocol || "http";
    const host = req.get("host");
    const bound = getBound();

    const allowed = (process.env.AXL_ALLOWED_HOSTS || "")
      .split(",").map(s => s.trim()).filter(Boolean);

    if (host && (allowed.includes(host) || isBoundHost(host, bound))) {
      return `${protocol}://${host}`;
    }

    // Unrecognised (or absent) Host: advertise the address we are actually reachable on.
    const canonical = bound
      ? `${bound.host === "0.0.0.0" || bound.host === "::" ? "localhost" : formatHost(bound.host)}:${bound.port}`
      : "localhost";
    return `${protocol}://${canonical}`;
  };
}

function isBoundHost(host: string, bound: { host: string, port: number } | undefined): boolean {
  if (!bound) return false;
  // Host is "name" or "name:port"; an IPv6 literal is bracketed, so split on the last colon.
  const match = host.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  if (!match) return false;
  const hostname = match[1]!.replace(/^\[|\]$/g, "").toLowerCase();
  const port = match[2] ? Number(match[2]) : (bound.port === 80 ? 80 : undefined);

  if (port !== bound.port) return false;
  if (hostname === bound.host.toLowerCase()) return true;
  // A wildcard bind is reachable under any local name, so only loopback names are
  // asserted rather than trying to enumerate every interface.
  if (bound.host === "0.0.0.0" || bound.host === "::") return isLoopbackHostname(hostname);
  return isLoopbackHostname(hostname) && isLoopbackHostname(bound.host);
}

function listenOn(server: import("http").Server, port: number, host: string): Promise<NodeJS.ErrnoException | null> {
  return new Promise((resolve) => {
    const onError = (err: NodeJS.ErrnoException) => { server.removeListener("listening", onListening); resolve(err); };
    const onListening = () => { server.removeListener("error", onError); resolve(null); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

export async function serve(outDir: string, options: { port?: number, host?: string, sessionTimeoutMs?: number, trustProxy?: boolean, trustIdentityHeaders?: boolean, stateFile?: string, cookieKey?: string }) {
  const manifestPath = path.join(outDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    blank();
    errorBlock({
      title: "Manifest not found",
      message: `Could not find manifest.json at ${manifestPath}`,
      help: "Run axl compile first to generate the manifest."
    });
    // Marked as already-reported: the errorBlock above is the useful message, and the
    // CLI's top-level catch would otherwise print a second, generic "Unexpected error"
    // block right underneath it, making a well-handled case look like a crash.
    throw Object.assign(new Error("Manifest not found"), { reported: true });
  }

  let stateStore = undefined;
  if (options.stateFile) {
    const statePath = path.resolve(options.stateFile);
    stateStore = new FileStateStore(statePath);
  }

  const { engine, manifest } = buildAxlServer(manifestPath, { stateStore });

  const app = express();

  // Filled in once listen() succeeds. The discovery routes are registered before the
  // bind, so the resolver reads it lazily rather than capturing it.
  let boundAddress: { host: string, port: number } | undefined;
  const resolveBaseUrl = makeBaseUrlResolver(() => boundAddress);

  app.get("/health", (req, res) => {
    res.json({
      name: manifest.app.name,
      version: manifest.app.version,
      axl_version: manifest.axl_version
    });
  });

  app.get("/manifest.json", (req, res) => {
    res.set("Cache-Control", "public, max-age=3600");
    // Express automatically generates ETags for res.json() by default.
    res.json(manifest);
  });

  app.get("/.well-known/axl", (req, res) => {
    const baseUrl = resolveBaseUrl(req);

    res.set("Content-Type", "application/json");
    res.set("X-Content-Type-Options", "nosniff");
    res.json({
      version: "1.0",
      server_name: manifest.app?.name || "axl-server",
      server_version: manifest.app?.version || "1.0.0",
      manifest: `${baseUrl}/manifest.json`,
      rest: baseUrl,
      mcp: `${baseUrl}/mcp`,
      ws: baseUrl.replace(/^http/, "ws") + "/ws",
      auth: {
        type: "bearer",
        note: "Obtain a session via the project's own login/register action, then send it as: Authorization: Bearer <token>"
      }
    });
  });

  // Shared context extraction: parses session cookie, idempotency key, and IP
  // from request headers. Genuinely shared -- MCP, REST and WebSocket all call this
  // one function, so they cannot drift. (The comment previously said "both MCP and
  // REST"; WebSocket started using it too when that transport landed.)
  function extractContext(req: express.Request | import("http").IncomingMessage) {
    const authHeader = req.headers.authorization;
    let sessionCookie: string | undefined;
    const cookieKey = options.cookieKey || "sid";
    
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.substring(7).trim();
      // The backend expects a Cookie header in the format "key=value". 
      // If the client sends a raw bearer token, we wrap it using the configured cookieKey (default: "sid").
      sessionCookie = token.includes("=") ? token : `${cookieKey}=${token}`;
    } else if (req.headers["x-axl-session"]) {
      sessionCookie = req.headers["x-axl-session"] as string;
    } else if (req.url && req.url.includes("token=")) {
      const match = req.url.match(/[?&]token=([^&]+)/);
      if (match) {
        const token = decodeURIComponent(match[1]);
        sessionCookie = token.includes("=") ? token : `${cookieKey}=${token}`;
      }
    }

    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

    // Identity claims for the ROLE and OWNER permission levels.
    //
    // Read ONLY under an explicit operator opt-in, for the same reason --trust-proxy
    // gates X-Forwarded-For: AXL never validates the bearer token, so anything an
    // ordinary client sends is attacker-controlled. Honouring these headers by default
    // would let any caller send `X-AXL-Roles: admin` and walk through a ROLE gate.
    //
    // The flag is the operator asserting that an authenticating gateway sits in front
    // and OVERWRITES both headers on every request -- stripping any client-supplied
    // copy. Without it, `identity` stays undefined and ROLE/OWNER deny everything.
    let identity: { subject?: string, roles?: string[] } | undefined;
    if (options.trustIdentityHeaders) {
      const rawSubject = req.headers["x-axl-subject"];
      const rawRoles = req.headers["x-axl-roles"];
      const subject = Array.isArray(rawSubject) ? rawSubject[0] : rawSubject;
      const rolesHeader = Array.isArray(rawRoles) ? rawRoles[0] : rawRoles;
      const roles = (rolesHeader || "").split(",").map(r => r.trim()).filter(Boolean);
      if (subject || roles.length > 0) {
        identity = { ...(subject ? { subject } : {}), roles };
      }
    }

    let ip = req.socket.remoteAddress;
    if (options.trustProxy && req.headers["x-forwarded-for"]) {
      const forwardedFor = Array.isArray(req.headers["x-forwarded-for"])
        ? req.headers["x-forwarded-for"][0]
        : req.headers["x-forwarded-for"];
      if (forwardedFor) {
        ip = forwardedFor.split(',')[0]?.trim() || ip;
      }
    }

    const requestId = resolveRequestId(req.headers);

    return {
      sessionCookie,
      idempotencyKey,
      ip,
      requestId,
      identityTrusted: options.trustIdentityHeaders === true,
      ...(identity ? { identity } : {})
    };
  }

  // NOTE: This Map tracks active MCP HTTP transport sessions.
  // It is intentionally NOT backed by the StateStore. An SSE connection (which is what 
  // StreamableHTTPServerTransport manages) is inherently tied to the active process memory.
  // If the server restarts, those TCP/HTTP connections are physically dropped. 
  // Therefore, this session state remains process-local and will not survive a restart.
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport, lastActivity: number }>();

  /** Torn down by close(), for resources a transport registers after mounting. */
  const cleanupHooks: Array<() => void> = [];

  const registry = new TransportManager();

  // Register MCP Transport
  registry.register("MCP", (app: express.Express, { engine, manifest }: any) => {
    app.get("/.well-known/mcp", (req: express.Request, res: express.Response) => {
      const authRequired = Object.values(manifest.actions || {}).some(
        (a: any) => a.permission === "AUTH"
      );

      const absoluteUrl = `${resolveBaseUrl(req)}/mcp`;

      res.set("Content-Type", "application/json");
      res.set("X-Content-Type-Options", "nosniff");
      res.json({
        mcp_version: "1.0",
        server_name: manifest.app.name,
        server_version: manifest.app.version,
        endpoints: {
          streamable_http: absoluteUrl
        },
        capabilities: {
          tools: true,
          // Derived from the manifest, not hardcoded either way. A server with no
          // RESOURCE declarations has an empty resources/list, and advertising a
          // capability whose listing is empty is a lie a client will act on. This was
          // hardcoded `false` while no resource support existed, which was accurate;
          // hardcoding it `true` now would be accurate only until someone compiles a
          // project without resources.
          resources: Object.keys(manifest.resources || {}).length > 0,
          prompts: false
        },
        authentication: {
          required: authRequired,
          // "bearer", matching /.well-known/axl. The two documents describe the same
          // credential -- an Authorization: Bearer header -- and used to disagree
          // about what to call it, which is a contradiction in a published contract.
          methods: ["bearer"]
        }
      });
    });

    // Handle all MCP traffic through the Streamable HTTP transport.
    //
    // express.json() here is not incidental: /mcp is mounted ahead of the REST router's
    // own body parser, so without this the transport read the request stream itself with
    // no size cap at all -- a 30MB body was accepted with a 200 while REST rejected 1MB.
    // The parsed body is then handed to handleRequest(), which the SDK supports precisely
    // so a body-parser can sit in front of it.
    app.all("/mcp", express.json({ limit: MCP_BODY_LIMIT }), async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const origin = req.headers.origin as string | undefined;
      if (!isOriginAllowed(origin)) {
        // RFC 7807 like every other HTTP-level error this server returns. This rejection
        // happens before the MCP transport sees the request, so it is a transport-level
        // HTTP error, not a JSON-RPC one -- MCP's own error convention is untouched.
        return problem(res, 403, "FORBIDDEN_ORIGIN", "Origin not allowed",
          "Origin not allowed. Set AXL_ALLOWED_ORIGINS to permit additional origins.");
      }

      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId) {
        const sessionData = sessions.get(sessionId);
        if (!sessionData) {
          return problem(res, 404, "NOT_FOUND", "Not found", "MCP session not found or expired.");
        }
        sessionData.lastActivity = Date.now();
        transport = sessionData.transport;
      } else {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, { transport, lastActivity: Date.now() });
          },
          onsessionclosed: (sid) => {
            sessions.delete(sid);
          }
        });
        const { server } = buildAxlServer(manifestPath, {
          engine,
          contextExtractor: currentContext
        });
        await server.connect(transport);
      }

      const ctx = extractContext(req);
      if (ctx.requestId) res.setHeader("X-Request-Id", ctx.requestId);

      // Run the request in the context of the extracted session
      requestContext.run(ctx, () => {
        transport.handleRequest(req, res, req.body).catch((err) => {
          logServerError("handleRequest error:", err);
          next(err);
        });
      });
    });
  });

  // Register REST Transport
  registry.register("REST", (app: express.Express, { engine }: any) => {
    const { router: restRouter } = buildRestAdapter(manifestPath, {
      engine,
      contextExtractor: currentContext
    });

    // Wrap REST routes with context extraction middleware and JSON body parser
    app.use("/", express.json(), (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ctx = extractContext(req);
      // Echoed on every response, success or failure. A caller that supplied its own id
      // sees it come back; one that did not learns the id AXL generated, which is what
      // makes a support conversation about "this call failed" tractable.
      if (ctx.requestId) res.setHeader("X-Request-Id", ctx.requestId);
      requestContext.run(ctx, () => next());
    }, restRouter);
  });

  // Loopback-only by default, but bound on BOTH address families. Binding only
  // 127.0.0.1 breaks every client that resolves "localhost" to ::1 first (common on
  // Linux/Docker/CI), which sees ECONNREFUSED even though the server is up. An explicit
  // --host still binds exactly that one interface and nothing else.
  const hosts = options.host ? [options.host] : DEFAULT_LOOPBACK_HOSTS;
  const httpServers = hosts.map(() => createServer(app));
  const httpServer = httpServers[0];

  const wsLocks = new Map<string, Promise<void>>();
  async function withWsLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    while (wsLocks.has(key)) { await wsLocks.get(key); }
    let resolve!: () => void;
    wsLocks.set(key, new Promise(r => resolve = r));
    try { return await fn(); } finally { wsLocks.delete(key); resolve(); }
  }

  registry.register("WebSocket", (app: express.Express, { engine, manifest, httpServers }: any) => {
    // noServer + a manual upgrade hook per listener, because the same WebSocketServer
    // has to serve every address family we bound (see DEFAULT_LOOPBACK_HOSTS). The
    // `server:` option can only ever attach to a single http.Server.
    const wss = new WebSocketServer({ noServer: true });
    for (const srv of httpServers as import("http").Server[]) {
      srv.on("upgrade", (req, socket, head) => {
        let pathname: string;
        try {
          pathname = new URL(req.url || "/", "http://localhost").pathname;
        } catch {
          socket.destroy();
          return;
        }
        if (pathname !== "/ws") {
          socket.destroy();
          return;
        }
        // Same DNS-rebinding defence /mcp already has, and the same function so the two
        // cannot drift. A WebSocket upgrade is exactly the shape of request rebinding
        // targets: the browser sends it cross-origin without a CORS preflight, so the
        // Origin header is the only thing separating a local client from a page on
        // attacker.example. Verified before this check existed: a client presenting
        // `Origin: http://evil.example` connected and started receiving events.
        if (!isOriginAllowed(req.headers.origin)) {
          socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket as any, head, (ws) => wss.emit("connection", ws, req));
      });
    }
    const connectedWsClients = new Map<string, { ws: any, lastHeartbeat: number, context: any }>();

    wss.on("connection", async (ws, req) => {
      const clientId = randomUUID();
      const context = extractContext(req);

      await withWsLock(`wsClient:${clientId}`, async () => {
        connectedWsClients.set(clientId, { ws, lastHeartbeat: Date.now(), context });
      });

      ws.on("message", async (msg) => {
        try {
          const parsed = JSON.parse(msg.toString());
          if (parsed.type === "ping") {
            await withWsLock(`wsClient:${clientId}`, async () => {
              const client = connectedWsClients.get(clientId);
              if (client) client.lastHeartbeat = Date.now();
            });
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch (err) {}
      });

      ws.on("close", async () => {
        await withWsLock(`wsClient:${clientId}`, async () => {
          connectedWsClients.delete(clientId);
        });
      });
    });

    // Fans engine events out to the WebSocket clients they belong to.
    //
    // FAILS CLOSED. The previous filter only skipped a client when the event carried an
    // identity that disagreed with the client's -- so an event with no `context` at all
    // matched nothing, fell through every guard, and went to every connected socket.
    // `workflow.paused` was emitted exactly that way, which put a live confirmation
    // token on an unauthenticated client's socket (reproduced, then fixed in engine.js).
    //
    // Structuring it as "send only on a positive identity match" is the part that
    // matters: the next event type someone adds without a context reaches nobody
    // instead of reaching everyone.
    engine.on("event", async (eventPayload: any) => {
      const eventContext = eventPayload.data?.context;
      const eventSession = eventContext?.sessionCookie;
      const eventIp = eventContext?.ip;
      if (!eventSession && !eventIp) return;

      const payloadToBroadcast = JSON.parse(JSON.stringify(eventPayload));
      if (payloadToBroadcast.data?.context) {
        // ALLOWLIST, not `delete context.sessionCookie`.
        //
        // A denylist means every field added to the request context ships to every
        // subscribed socket until someone remembers to exclude it. `sessionCookie` was
        // the only field anyone had thought about; `idempotencyKey` is the caller's own
        // and `identityTrusted` is server configuration, and both were broadcast the
        // moment they existed. Naming what a subscriber may see makes the next field
        // opt-in instead of opt-out.
        const { ip, requestId } = payloadToBroadcast.data.context;
        payloadToBroadcast.data.context = {
          ...(ip !== undefined ? { ip } : {}),
          ...(requestId !== undefined ? { requestId } : {})
        };
      }
      const payloadStr = JSON.stringify(payloadToBroadcast);

      for (const client of Array.from(connectedWsClients.values())) {
        if (client.ws.readyState !== 1) continue; // not OPEN

        const matches = eventSession
          // A session is the strongest identity available, so it decides on its own.
          ? client.context.sessionCookie === eventSession
          // No session on the event means an anonymous caller, and the source IP is the
          // only identity they have. Only other anonymous clients on that IP qualify --
          // a client that authenticated is a different principal even from the same IP.
          : client.context.ip === eventIp && !client.context.sessionCookie;

        if (matches) client.ws.send(payloadStr);
      }
    });

    const wsSweepInterval = setInterval(async () => {
      const now = Date.now();
      const keys = Array.from(connectedWsClients.keys());
      for (const clientId of keys) {
        await withWsLock(`wsClient:${clientId}`, async () => {
          const client = connectedWsClients.get(clientId);
          if (client && now - client.lastHeartbeat > 60000) {
            client.ws.terminate();
            connectedWsClients.delete(clientId);
          }
        });
      }
    }, 30000);

    wss.on("close", () => clearInterval(wsSweepInterval));
    // The WebSocketServer is `noServer`, so nothing ever calls wss.close() -- the
    // listener above never fires and this interval outlives close(), holding the event
    // loop open forever. Every embedder that awaits close() and expects to exit (a
    // script, a test, `axl doctor --conformance`) hangs on it. unref'ing means the timer
    // still runs while there is other work, but stops being a reason to stay alive.
    wsSweepInterval.unref?.();
    // And shut the socket server down with the rest of the server, so connected clients
    // are dropped rather than left attached to a server that is gone.
    cleanupHooks.push(() => { try { wss.close(); } catch { /* already down */ } });
  });

  // Mount all transports
  registry.mountAll(app, { engine, manifest, httpServer, httpServers });

  // Global error handler.
  //
  // Same RFC 7807 shape the REST adapter uses. These are the errors that never reached
  // the engine -- body-parser rejections, mostly -- and a caller should not have to
  // recognise two different error formats from one server depending on how far the
  // request got.
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logServerError("Express error:", err);
    const status = err.status || err.statusCode || 500;
    // Only include the raw error message when explicitly opted in via AXL_DEBUG_ERRORS=1.
    // This is meant for local development only -- internal error details must not be
    // exposed by default.
    const detail = isEnvFlagEnabled(process.env.AXL_DEBUG_ERRORS)
      ? err.message
      : clientErrorMessage(err, status);
    problem(res, status, problemType(err, status), problemTitle(status), detail);
  });

  // `??`, not `||`: port 0 is the POSIX "give me any free port", and `||` folded it
  // into the 3939 default -- which is the one value guaranteed to collide with a server
  // the developer already has running. Anything that asks for 0 wants an ephemeral port.
  const requestedPort = options.port ?? 3939;
  const explicitHost = Boolean(options.host);

  const bound: string[] = [];
  const bindFailures: { host: string, err: NodeJS.ErrnoException }[] = [];
  for (let i = 0; i < hosts.length; i++) {
    // After the first bind, reuse the port the OS actually assigned, so an ephemeral
    // request still lands both address families on the SAME port.
    const target = bound.length > 0 ? (httpServers[bound.length - 1].address() as any)?.port ?? requestedPort : requestedPort;
    const err = await listenOn(httpServers[i], target, hosts[i]);
    if (err) bindFailures.push({ host: hosts[i], err });
    else bound.push(hosts[i]);
  }

  if (bound.length === 0) {
    blank();
    errorBlock({
      title: "Could not bind server",
      message: bindFailures.map(f => `${f.host}:${requestedPort} — ${f.err.code || f.err.message}`).join("\n"),
      help: bindFailures.some(f => f.err.code === "EADDRINUSE")
        ? `Port ${requestedPort} is already in use. Stop the other process or pass --port <num>.`
        : "Check that the requested host is a valid local interface."
    });
    throw Object.assign(bindFailures[0].err, { reported: true });
  }

  // An explicit --host means the user asked for that exact interface; anything less is a
  // failure. For the dual-stack default we chose the hosts ourselves, so an address family
  // the machine does not have (IPv6-disabled containers) is expected, not an error.
  for (const { host, err } of bindFailures) {
    const code = err.code ?? "";
    if (explicitHost || !OPTIONAL_BIND_ERRORS.has(code)) {
      throw err;
    }
    if (isEnvFlagEnabled(process.env.AXL_DEBUG_ERRORS)) {
      console.error(`  ${icons.warning} skipped ${host}:${requestedPort} (${code}) — address family unavailable`);
    }
  }

  // Read back rather than echoing the request: with port 0 the requested value is not
  // the bound one, and every URL printed and reported below depends on this.
  const port = (httpServers[0]?.address() as any)?.port ?? requestedPort;
  boundAddress = { host: bound[0]!, port };

  const displayHost = bound[0] === "0.0.0.0" || bound.includes("127.0.0.1") ? "localhost" : formatHost(bound[0]);

  section("AXL Server");
  console.log(`  ${c.success(icons.success)} ${c.primary("Running")} (MCP + REST + WS)`);
  blank();
  console.log(`  ${c.secondary("Health")}        ${c.accent(`http://${displayHost}:${port}/health`)}`);
  // Discovery is the URL a client is supposed to start from -- everything else here is
  // reachable from it. It was the one URL the banner did not print, so the documented
  // way to connect a client was the way nobody could see.
  console.log(`  ${c.secondary("Discovery")}     ${c.accent(`http://${displayHost}:${port}/.well-known/axl`)}`);
  console.log(`  ${c.secondary("MCP Endpoint")}  ${c.accent(`http://${displayHost}:${port}/mcp`)}`);
  console.log(`  ${c.secondary("REST API")}      ${c.accent(`http://${displayHost}:${port}/actions/:name`)}`);
  console.log(`  ${c.secondary("WS API")}        ${c.accent(`ws://${displayHost}:${port}/ws`)}`);
  console.log(`  ${c.secondary("Listening on")}  ${c.plain(bound.map(h => `${formatHost(h)}:${port}`).join(", "))}`);
  blank();

  const sessionTimeout = options.sessionTimeoutMs || 30 * 60 * 1000;
  const sweepIntervalMs = Math.min(60000, Math.max(1000, sessionTimeout / 2));
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [sid, sessionData] of sessions.entries()) {
      if (now - sessionData.lastActivity > sessionTimeout) {
        sessionData.transport.close();
        sessions.delete(sid);
      }
    }
  }, sweepIntervalMs);

  const shutdown = () => {
    clearInterval(sweepInterval);
    console.log(`\n  ${c.warning(icons.warning)} ${c.plain("Shutting down AXL server...")}`);
    // Every bound address family has its own listener; all of them must close before
    // the process can exit cleanly.
    Promise.all(
      httpServers.map(srv => new Promise<void>(resolve => srv.listening ? srv.close(() => resolve()) : resolve()))
    ).then(() => {
      if (engine && typeof engine.destroy === 'function') {
        engine.destroy();
      }
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Returned so callers (notably tests) can reach the running engine and its state
  // store instead of having to infer server state from API responses. Purely
  // additive -- every existing caller ignores the return value.
  return {
    engine,
    manifest,
    httpServers,
    addresses: bound.map(h => ({ host: h, port })),
    close: async () => {
      clearInterval(sweepInterval);
      for (const hook of cleanupHooks) hook();
      await Promise.all(
        httpServers.map(srv => new Promise<void>(resolve => {
          if (!srv.listening) return resolve();
          srv.close(() => resolve());
          // close() stops accepting NEW connections but leaves established keep-alive
          // sockets open, and its callback does not fire until the last one goes. Any
          // client using a connection pool -- Node's own fetch does -- therefore keeps
          // the process alive indefinitely after a "successful" shutdown. Destroying
          // them is correct here: close() is only ever a deliberate shutdown.
          srv.closeIdleConnections?.();
          srv.closeAllConnections?.();
        }))
      );
      if (engine && typeof engine.destroy === "function") engine.destroy();
    }
  };
}
