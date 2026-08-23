import { Router } from "express";
import { loadManifest } from "./manifest.js";
import { AxlEngine, PermissionError, BackendError, TimeoutError, ValidationError, NotFoundError, TooManyAttemptsError, RateLimitError, safeErrorMessage } from "./engine.js";

/**
 * Builds an Express Router exposing plain HTTP/JSON endpoints for AXL actions,
 * workflows, and confirmations.
 *
 * Shape mirrors buildAxlServer() from axl-server.js:
 *   buildRestAdapter(manifestPath, { contextExtractor, engine, stateStore })
 *   => { router, engine, manifest }
 */
/**
 * RFC 7807 "Problem Details for HTTP APIs".
 *
 *   type      the stable machine-readable code -- the old `error` field, unchanged in
 *             value, so existing client branching survives the shape change
 *   title     a short human summary of the *class* of problem, constant per type
 *   status    the HTTP status, duplicated in the body as the RFC requires
 *   detail    what went wrong with THIS request
 *   instance  the path that produced it, so a log line identifies the call
 *
 * Content-Type is application/problem+json, which is the part that lets a generic
 * client recognise the shape without being told.
 */
export function problem(res, status, type, title, detail, extensions = {}) {
  res.status(status);
  res.type("application/problem+json");

  // RFC 7807 asks `instance` to identify "the specific occurrence of the problem". The
  // path alone does not -- every 403 on /actions/foo carried an identical value, which
  // made the field useless for the thing it exists for. Appending the request id as a
  // fragment keeps it a valid relative URI reference, keeps the path readable at a
  // glance in a log, and makes it genuinely occurrence-specific.
  const path = res.req?.originalUrl ?? res.req?.url;
  const requestId = res.getHeader?.("X-Request-Id");
  const instance = requestId ? `${path ?? ""}#${requestId}` : path;

  return res.json({
    type,
    title,
    status,
    detail,
    instance,
    ...extensions
  });
}

/**
 * @param {string} manifestPath
 * @param {{ contextExtractor?: () => object, engine?: any, stateStore?: any }} [options]
 */
export function buildRestAdapter(manifestPath, { contextExtractor, engine, stateStore } = {}) {
  const manifest = loadManifest(manifestPath);
  const actualEngine = engine || new AxlEngine(manifest, stateStore);
  const router = Router();

  // Parse JSON bodies on all REST routes
  router.use((req, res, next) => {
    if (!req.body && req.headers["content-type"]?.includes("application/json")) {
      // Express may not have parsed yet if this router is mounted without express.json()
      // But serve.ts mounts express.json() before this router, so this is a safety net.
      let data = "";
      req.on("data", chunk => data += chunk);
      req.on("end", () => {
        try { req.body = data ? JSON.parse(data) : {}; } catch { req.body = {}; }
        next();
      });
    } else {
      next();
    }
  });

  /**
   * Extracts context from the current request using the contextExtractor
   * provided by serve.ts (same AsyncLocalStorage pattern as MCP).
   */
  function getContext() {
    if (contextExtractor) {
      return contextExtractor();
    }
    return {};
  }

  /**
   * Maps engine errors to a status code and an RFC 7807 Problem Details body.
   *
   * Classification is unchanged -- same branches, same order, same status codes. Only
   * the response *shape* changed, from the ad-hoc `{error, message}` to
   * `{type, title, status, detail, instance}`.
   *
   * The old `error` code string lives on as `type`, deliberately: it is what client
   * logic branches on, so `body.error === "NOT_FOUND"` becomes `body.type ===
   * "NOT_FOUND"` -- a shape change, not a rewrite of anyone's error handling. Codes
   * are used bare rather than as URIs: RFC 7807 says `type` SHOULD be a URI reference,
   * and a bare token is a valid relative reference. Minting fake https:// URLs that
   * resolve to nothing would be worse.
   *
   * MCP is untouched. It has its own error convention and forcing 7807 into it would
   * fight the protocol.
   */
  /**
   * The hint an error carries, if any.
   *
   * Read off the error rather than inferred from the route: only the throw site knows
   * whether a confirmation failure means "wrong OTP, try again with the same token" or
   * "that token is gone, start over". Absent -- not null, not empty -- when there is no
   * clear next step, so `if (body.next_action)` and `"next_action" in body` agree.
   */
  function hint(err) {
    return err && typeof err.nextAction === "string" ? { next_action: err.nextAction } : {};
  }

  function sendError(res, err) {
    if (err instanceof ValidationError) {
      return problem(res, 400, "VALIDATION_ERROR", "Validation failed", err.message, hint(err));
    }
    if (err instanceof PermissionError) {
      return problem(res, 403, "PERMISSION_DENIED", "Permission denied", err.message);
    }
    if (err instanceof NotFoundError) {
      // An unknown confirmation token carries a hint; an unknown action name does not.
      // The latter is a bug in the caller, not something to retry.
      return problem(res, 404, "NOT_FOUND", "Not found", err.message, hint(err));
    }
    if (err instanceof TooManyAttemptsError) {
      // The pending confirmation is destroyed at this point, so retrying the same token
      // can never succeed. Starting over is the only route forward.
      return problem(res, 429, "TOO_MANY_ATTEMPTS", "Too many attempts", err.message, hint(err));
    }
    // 504, not 503 or 500: AXL is a gateway here, and a step's TIMEOUT expiring is
    // precisely "the upstream server did not respond in time". Checked before
    // BackendError only for readability -- TimeoutError deliberately does not extend it.
    if (err instanceof TimeoutError) {
      return problem(res, 504, "TIMEOUT", "Backend timeout", err.message,
        { timeout_ms: err.timeoutMs });
    }
    if (err instanceof BackendError) {
      // `body` is the backend's own response and is preserved as an extension member,
      // which 7807 explicitly allows -- dropping it would lose the only detail a caller
      // can act on when their backend rejects something.
      return problem(res, err.status || 502, "BACKEND_ERROR", "Backend error",
        err.message || "The backend returned an error.", { body: err.body });
    }
    if (err.message && err.message.startsWith("Unknown action:")) {
      return problem(res, 404, "NOT_FOUND", "Not found", err.message);
    }
    if (err.message && err.message.startsWith("Unknown workflow:")) {
      return problem(res, 404, "NOT_FOUND", "Not found", err.message);
    }
    if (err instanceof RateLimitError) {
      // Retry-After is the standard HTTP way to say this, so it is set as a header too.
      // Seconds, rounded up: rounding down would send the caller back one tick early,
      // straight into another rejection.
      const seconds = Number.isFinite(err.retryAfterMs)
        ? Math.max(1, Math.ceil(err.retryAfterMs / 1000))
        : undefined;
      if (seconds !== undefined) res.setHeader("Retry-After", String(seconds));
      return problem(res, 429, "RATE_LIMIT_EXCEEDED", "Rate limit exceeded", err.message, {
        next_action: "retry_after",
        ...(seconds !== undefined ? { retry_after: seconds } : {}),
      });
    }
    // Retained for any caller still throwing the pre-typed bare Error.
    if (err.message && err.message.includes("Rate limit exceeded")) {
      return problem(res, 429, "RATE_LIMIT_EXCEEDED", "Rate limit exceeded", err.message);
    }
    if (err.message && (err.message.includes("invalid inputs") || err.message.includes("Invalid initial arguments"))) {
      return problem(res, 400, "VALIDATION_ERROR", "Validation failed", err.message);
    }
    // Everything above is a typed engine error with a curated message. Anything
    // reaching here is an unexpected internal fault, whose raw text is not safe to
    // return -- see safeErrorMessage. Still logged server-side by the caller.
    return problem(res, 500, "INTERNAL_ERROR", "Internal error", safeErrorMessage(err));
  }

  // ---- POST /actions/:actionName ----
  router.post("/actions/:actionName", async (req, res) => {
    try {
      const context = getContext();
      const result = await actualEngine.execute(req.params.actionName, req.body || {}, context);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ---- GET /resources/:resourceName ----
  //
  // GET only, and that is the whole point: a resource is a read. Registering only
  // router.get() means POST/PUT/PATCH/DELETE to the same path fall through to Express's
  // 404 rather than being quietly accepted. Permission enforcement is identical to
  // /actions/:name -- same context, same engine check, same sendError mapping.
  router.get("/resources/:resourceName", async (req, res) => {
    try {
      const context = getContext();
      const result = await actualEngine.readResource(req.params.resourceName, context);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ---- POST /workflows/resume ----
  router.post("/workflows/resume", async (req, res) => {
    try {
      const { token, otp } = req.body || {};
      if (!token || !otp) {
        return problem(res, 400, "VALIDATION_ERROR", "Validation failed", "Both 'token' and 'otp' are required.");
      }
      const result = await actualEngine.resumeWorkflow(token, otp, getContext());
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ---- POST /workflows/:workflowName ----
  router.post("/workflows/:workflowName", async (req, res) => {
    try {
      const context = getContext();
      const result = await actualEngine.runWorkflow(req.params.workflowName, req.body || {}, context);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ---- POST /confirm ----
  router.post("/confirm", async (req, res) => {
    try {
      const { token, otp } = req.body || {};
      if (!token || !otp) {
        return problem(res, 400, "VALIDATION_ERROR", "Validation failed", "Both 'token' and 'otp' are required.");
      }
      const result = await actualEngine.confirmAction(token, otp, getContext());
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  return { router, engine: actualEngine, manifest };
}
