import crypto from "crypto";
import { z } from "zod";
import { EventEmitter } from "node:events";
import { buildZodShape } from "./schema-utils.js";
import { InMemoryStateStore } from "./state.js";
import { executeHttpCall } from "./backend-adapter.js";

function isEnvFlagEnabled(value) {
  return typeof value === "string" && ["1", "true", "yes"].includes(value.toLowerCase());
}

/**
 * The message an adapter may safely return to a client.
 *
 * Typed engine errors carry curated, user-facing text ("Incorrect OTP. 3 attempt(s)
 * remaining.") and pass through untouched. Anything else is an unexpected internal
 * fault whose raw text is not safe on the wire -- exception messages routinely carry
 * connection strings, internal hostnames and credentials -- so it is replaced with a
 * generic string unless AXL_DEBUG_ERRORS=1, the same opt-in serve.ts's express error
 * handler already uses. The caller still logs the real error server-side.
 */
export function safeErrorMessage(err) {
  // Every engine error class, deliberately exhaustive. TimeoutError was missing: it is
  // currently caught earlier by rest-adapter.js, so the omission was unreachable rather
  // than harmless -- one reordered catch and a legitimate "Backend did not respond within
  // 2000ms" would have been redacted to "Internal error.".
  if (err instanceof PermissionError || err instanceof ValidationError ||
      err instanceof NotFoundError || err instanceof TooManyAttemptsError ||
      err instanceof RateLimitError || err instanceof BackendError ||
      err instanceof TimeoutError) {
    return err.message;
  }
  return isEnvFlagEnabled(process.env.AXL_DEBUG_ERRORS)
    ? (err && err.message) || String(err)
    : "Internal error.";
}

/**
 * Constant-time OTP comparison. Plain `!==` on strings short-circuits at the first
 * differing character, which leaks how many leading digits were correct. The 5-attempt
 * lockout makes that hard to exploit in practice, but a constant-time compare costs
 * nothing and removes the question entirely.
 *
 * Buffers are hashed to a fixed width first: timingSafeEqual throws on length mismatch,
 * and comparing raw inputs would leak the OTP's length through that exception.
 *
 * The non-string guard keeps this a pure timing change. Stored OTPs are always strings,
 * so `!==` already rejected a JSON-number OTP; coercing here would have quietly started
 * accepting `{"otp": 123456}`, which is a separate decision from constant-time compare.
 */
function otpMatches(submitted, expected) {
  if (typeof submitted !== "string") return false;
  const digest = (v) => crypto.createHash("sha256").update(v, "utf8").digest();
  return crypto.timingSafeEqual(digest(submitted), digest(String(expected)));
}

// Flat delay between workflow step retry attempts. See _runStepWithRetry for why this
// is flat rather than exponential.
const STEP_RETRY_DELAY_MS = 250;

/**
 * Resolves a dotted path like "check_order.status" against the workflow's recorded step
 * outputs. Shared by IF and SWITCH so the two cannot drift on what a path means.
 */
function resolveStepOutputPath(stepOutputs, path) {
  const parts = String(path).split(".");
  let value = stepOutputs[parts[0]];
  for (let i = 1; i < parts.length; i++) {
    value = value?.[parts[i]];
  }
  return value;
}

/**
 * Reads the `RETRY`/`TIMEOUT` modifiers off a workflow step.
 *
 * A step is either a bare action-name string or an object, and either form may reach
 * here from a hand-written manifest, so both are normalised to explicit defaults in one
 * place rather than re-derived at each call site.
 */
export function stepExecutionOptions(step) {
  const obj = typeof step === "object" && step !== null ? step : {};
  return {
    attempts: Number.isInteger(obj.retry) && obj.retry > 1 ? obj.retry : 1,
    timeoutMs: Number.isInteger(obj.timeout) && obj.timeout > 0 ? obj.timeout : undefined,
  };
}

// Aggregate cap on failed OTP confirmations per client, across all of their tokens.
// 20 failures per 15 minutes leaves room for four full per-token lockout cycles -- well
// beyond honest fat-fingering -- while taking a brute-force attempt from unbounded down
// to roughly 1.4 guesses a minute against a 900k-value space.
const CONFIRM_FAILURE_LIMIT = 20;
const CONFIRM_FAILURE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Tags an error with the one clear next step for the caller.
 *
 * Set where the error is raised, because that is the only place that knows which case it
 * is: "wrong OTP, attempts remain" and "no such token" are both surfaced from the
 * confirmation routes, but only the first can be retried with the same token. An adapter
 * inferring from the route would tell a caller holding an expired token to retry it,
 * which loops forever.
 */
function withNextAction(err, nextAction) {
  err.nextAction = nextAction;
  return err;
}

const locks = new Map();
async function withLock(key, fn) {
  while (locks.has(key)) {
    await locks.get(key);
  }
  // Initialised to a no-op rather than left undefined: the Promise executor does run
  // synchronously so the real resolver always lands before `finally`, but nothing in the
  // code says so, and a type-checker reading it cannot tell the difference between this
  // and a genuine use-before-assignment.
  /** @type {(value?: any) => void} */
  let resolve = () => {};
  locks.set(key, new Promise(r => { resolve = r; }));
  try {
    return await fn();
  } finally {
    locks.delete(key);
    resolve();
  }
}



/**
 * The AXL execution engine. One instance per loaded manifest.
 *
 * Responsibilities (in order, every single call):
 *   1. Does this action exist at all?
 *   2. Permission check (PUBLIC vs AUTH)
 *   3. Confirm-gate check (OTP) -- two-phase: request, then confirm
 *   4. Execute the real HTTP call against the site's own backend
 */
export class AxlEngine extends EventEmitter {
  constructor(manifest, stateStore) {
    super();
    this.manifest = manifest;
    this.state = stateStore || new InMemoryStateStore();

    // Start cleanup sweep every minute
    this.cleanupInterval = setInterval(() => {
      if (typeof this.state._sweep === 'function') {
        this.state._sweep();
      }
    }, 60000);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  destroy() {
    clearInterval(this.cleanupInterval);
  }

  /**
   * `manifest.actions` is a plain object indexed by a caller-supplied string, so a bare
   * `actions[name]` also resolves everything on Object.prototype. `constructor`,
   * `toString`, `valueOf`, `hasOwnProperty` and `__proto__` all came back truthy and
   * were handed on as action definitions, which then blew up somewhere further in and
   * surfaced as a 500 instead of a 404. Own-property check first, everywhere manifest
   * data is indexed by an external string.
   */
  getActionDef(actionName) {
    if (typeof actionName !== "string" || !Object.hasOwn(this.manifest.actions, actionName)) {
      throw new NotFoundError(`Unknown action: "${actionName}"`);
    }
    return this.manifest.actions[actionName];
  }

  /**
   * Resources live in their own manifest map, so an action name never resolves here and
   * a resource name never resolves in getActionDef. That separation is the isolation
   * guarantee -- `POST /actions/cart` and `GET /resources/add_to_cart` both 404, with no
   * extra check needed anywhere. Same own-property guard as getActionDef, for the same
   * Object.prototype reason.
   *
   * `resources` is optional in a manifest: every project compiled before the RESOURCE
   * primitive existed has no such key, and those manifests must keep loading.
   */
  getResourceDef(resourceName) {
    const resources = this.manifest.resources;
    if (!resources || typeof resourceName !== "string" || !Object.hasOwn(resources, resourceName)) {
      throw new NotFoundError(`Unknown resource: "${resourceName}"`);
    }
    return resources[resourceName];
  }

  // workflows is an array, so the prototype-chain problem above does not arise here --
  // `.find()` only ever sees real elements. Typed the same way so both lookups classify
  // identically on every transport instead of relying on a message prefix match.
  getWorkflowDef(workflowName) {
    const def = this.manifest.workflows?.find(w => w.name === workflowName);
    if (!def) {
      throw new NotFoundError(`Unknown workflow: "${workflowName}"`);
    }
    return def;
  }

  /**
   * `requestId` is hoisted out of `context` onto the event itself.
   *
   * Every event already carries the context, so the id is technically reachable via
   * `data.context.requestId` -- but a subscriber correlating events to one inbound call
   * should not have to know that, and the WS filter already treats `context` as an
   * identity blob rather than a place to read fields from. Hoisting makes the
   * correlation key a first-class part of the event shape.
   */
  emitEvent(type, data) {
    const requestId = data?.context?.requestId;
    this.emit("event", { type, data: requestId ? { requestId, ...data } : data });
  }

  /**
   * context = { sessionCookie: string | null }
   * Represents the authenticated end-user's session, passed through from
   * whatever client (Thunderstrike, Claude, etc.) is calling the MCP tool.
   */
  /**
   * PUBLIC / AUTH / ROLE:<role> / OWNER:<input>.
   *
   * ── Why ROLE and OWNER do not break "AXL owns no identity" ──────────────────────
   *
   * AXL still issues nothing, stores nothing and verifies nothing. It reads a claim it
   * is handed and compares it. That is a claim-check, not an identity system.
   *
   * But a claim is only a security control if it comes from somewhere the caller cannot
   * write. AXL deliberately never validates the bearer token -- auth is the backend's
   * job -- so *everything* an ordinary client sends is attacker-controlled. A ROLE gate
   * reading a client-supplied header would be decoration: any caller could send
   * `X-AXL-Roles: admin`. That is strictly worse than having no gate at all, because it
   * looks like one.
   *
   * So identity claims are honoured only when the operator explicitly asserts they come
   * from a trusted upstream (`serve --trust-identity-headers`), exactly the posture
   * `--trust-proxy` already takes for `X-Forwarded-For`. With the flag off -- the
   * default -- `context.identity` is never populated, and ROLE and OWNER DENY
   * EVERYTHING rather than silently passing. Fail closed, and say why.
   *
   * ── What OWNER can and cannot promise ───────────────────────────────────────────
   *
   * `OWNER user_id` asserts: the caller's subject claim equals the `user_id` argument.
   * It does NOT and cannot assert that the caller owns the underlying record -- that
   * needs a backend lookup, which is a backend concern. Use it for "you may only act on
   * your own id", not for "you may only delete tasks you created" unless the task's
   * owner is itself an argument.
   */
  checkPermission(actionDef, context, args = {}) {
    const declared = actionDef.permission;

    if (declared === "PUBLIC") return;

    if (declared === "AUTH") {
      if (!context || !context.sessionCookie) {
        throw new PermissionError("This action requires authentication. No session provided.");
      }
      return;
    }

    const sep = typeof declared === "string" ? declared.indexOf(":") : -1;
    const level = sep === -1 ? declared : declared.slice(0, sep);
    const param = sep === -1 ? undefined : declared.slice(sep + 1);

    if (level === "ROLE" || level === "OWNER") {
      // Both are authenticated levels first: no session, no further questions.
      if (!context || !context.sessionCookie) {
        throw new PermissionError("This action requires authentication. No session provided.");
      }

      const identity = context.identity;
      if (!identity) {
        // Denying is the only safe answer either way -- the alternative is trusting
        // whatever the caller claimed about themselves. But `identity` being absent has
        // two causes an operator fixes differently, and reporting the wrong one sends
        // them to change a setting that is already correct.
        //
        // `identityTrusted` is undefined for a context assembled by hand rather than by
        // `axl serve`; the stricter message is the safer default there.
        if (context.identityTrusted !== true) {
          throw new PermissionError(
            `This action requires a verified identity claim, but the server is not configured to accept one. ` +
            `Start the server with --trust-identity-headers, and only behind a gateway that authenticates the ` +
            `request and overwrites the identity headers.`
          );
        }
        throw new PermissionError(
          `This action requires a verified identity claim, but the request carried none. ` +
          `The gateway in front of AXL must set X-AXL-Subject and/or X-AXL-Roles on every request.`
        );
      }

      if (level === "ROLE") {
        const roles = Array.isArray(identity.roles) ? identity.roles : [];
        if (!roles.includes(param)) {
          throw new PermissionError(`This action requires the "${param}" role.`);
        }
        return;
      }

      // OWNER
      const subject = identity.subject;
      if (!subject) {
        throw new PermissionError("This action is restricted to the owning user, but the request carries no identity subject.");
      }
      const claimed = args ? args[param] : undefined;
      if (claimed === undefined || claimed === null) {
        throw new PermissionError(`This action is restricted to the owning user and requires the "${param}" argument.`);
      }
      if (String(claimed) !== String(subject)) {
        // Deliberately does not echo either value -- confirming or denying a specific
        // subject would make this a probe for which ids exist.
        throw new PermissionError(`This action is restricted to the owning user.`);
      }
      return;
    }

    throw new Error(`Unknown permission level: ${declared}`);
  }

  /**
   * The most specific identity available for a caller, used for SCOPING: which
   * idempotency cache entry is theirs, which pending confirmation they own.
   *
   * The session narrows here, which is exactly right for scoping -- a caller who
   * changes their session simply stops matching their own entries, which harms
   * nobody but themselves. Do NOT use this to key a quota; see _clientQuotaKeys.
   *
   * Single source of truth on purpose -- four call sites used to inline this same
   * expression, which is how confirmAction's copy drifted (it was missing the `ip`
   * fallback) and how a caller-identity check could be added to one path and silently
   * miss the others.
   */
  _clientKey(context) {
    const ip = context?.ip || 'anon';
    return context?.sessionCookie ? `${ip}|${context.sessionCookie}` : ip;
  }

  /**
   * Every bucket a caller must be under to be admitted. All of them are checked, and
   * all of them are incremented -- a quota is only as strong as its least forgeable
   * dimension.
   *
   * AXL never validates the bearer token (auth belongs to the backend, by design), so
   * `sessionCookie` is attacker-chosen free text. Keying a quota on it -- or on any
   * composite that includes it -- means rotating the Authorization header mints an
   * unlimited supply of fresh buckets. Measured against the real server: 40 of 40
   * requests admitted through a 10/min limit from a single source IP, simply by
   * sending a new random bearer token each time.
   *
   * So the source IP anchors the quota and is always enforced. The session is an
   * ADDITIONAL, narrower bucket on top -- it can only ever make a caller hit a limit
   * sooner, never later. That keeps one heavy user from spending a shared NAT'd IP's
   * whole allowance on their own, without handing anyone a way out of the IP bucket.
   *
   * Not double counting: each request increments each bucket exactly once, and each
   * bucket carries the same limit. One steady session from one IP therefore still gets
   * the full quota -- both of its buckets reach the limit on the same request.
   */
  _clientQuotaKeys(context) {
    const ip = context?.ip || 'anon';
    const session = context?.sessionCookie;
    return session ? [ip, `${ip}|${session}`] : [ip];
  }

  /**
   * Scopes an idempotency key to the client that supplied it, so two clients reusing the
   * same key (they are client-chosen, so collisions are expected) never read each
   * other's results. Returns undefined when there is no key -- or no session.
   *
   * Requiring a session is deliberate. Falling back to the IP meant two anonymous
   * clients behind one NAT that happened to pick the same key read each other's cached
   * result, and a cached result is not always innocuous: a confirm-gated action caches
   * its `confirmationRequired` envelope, so the leak is a live confirmation token. An
   * anonymous request carries no identity strong enough to hang a replay cache on, so
   * anonymous callers get no idempotency rather than a shared one -- their calls simply
   * execute every time, which is the pre-idempotency behaviour and safe by default.
   *
   * `scope` further narrows the key for a call originating inside a PARALLEL block. The
   * whole workflow runs under one client-supplied idempotencyKey, and the action name is
   * the only other thing in the key -- so without a scope, a member would share a replay
   * slot with any other use of that same action in the same workflow. Deterministic (it
   * is the member's index in the block), so a genuine replay of the whole workflow still
   * hits the same entries.
   */
  _idempotencyCacheKey(actionName, context, scope) {
    if (!context || !context.idempotencyKey) return undefined;
    if (!context.sessionCookie) return undefined;
    const base = `${this._clientKey(context)}:${actionName}:${context.idempotencyKey}`;
    return scope ? `${base}:${scope}` : base;
  }

  async _checkRateLimit(actionName, context) {
    const rateLimits = this.manifest.rateLimits;
    // Own-property check for the same reason as getActionDef: `rateLimits["toString"]`
    // resolves a function off Object.prototype, which is truthy and then fails the
    // format match, silently skipping the limit rather than applying it.
    if (!rateLimits || !Object.hasOwn(rateLimits, actionName)) return;
    const rlStr = rateLimits[actionName];
    if (!rlStr) return;

    const match = rlStr.match(/^(\d+)\/(sec|min|hr|day)$/);
    if (!match) return; // ignore invalid formats

    const limit = parseInt(match[1], 10);
    const unit = match[2];
    const msPerUnit = { sec: 1000, min: 60000, hr: 3600000, day: 86400000 }[unit];

    const keys = this._clientQuotaKeys(context).map(k => `${actionName}:${k}`);

    // One lock for the whole key set, keyed on the anchor (the IP bucket), because
    // every context that shares a bucket also shares that anchor. Locking each key
    // separately would let a rejection on the second bucket leave the first already
    // incremented.
    await withLock(`rl:${keys[0]}`, async () => {
      const now = Date.now();
      const records = [];

      for (const key of keys) {
        let record = await this.state.get("rateLimits", key);
        if (record && now > record.windowEnd) {
          await this.state.delete("rateLimits", key);
          record = undefined;
        }
        if (!record) {
          record = { count: 0, windowEnd: now + msPerUnit };
        }
        records.push({ key, record });
      }

      // Check every bucket before touching any of them: a request that is going to be
      // rejected must not consume allowance from the buckets it did clear.
      const exceeded = records.filter(({ record }) => record.count >= limit);
      if (exceeded.length > 0) {
        // The caller must wait for the LAST exceeded window to roll over, not the
        // first -- clearing one bucket while another is still full would send them
        // straight back into a rejection.
        const clearsAt = Math.max(...exceeded.map(({ record }) => record.windowEnd));
        throw new RateLimitError(
          `Rate limit exceeded for action "${actionName}".`,
          Math.max(0, clearsAt - now)
        );
      }

      for (const { key, record } of records) {
        record.count++;
        await this.state.set("rateLimits", key, record, Math.max(0, record.windowEnd - now));
      }
    });
  }

  /**
   * Runs the real HTTP call against the site's backend. No permission or
   * confirm logic here -- callers must have already cleared those gates.
   */
  async _executeHttp(actionName, actionDef, args, context, options = {}) {
    return executeHttpCall(this.manifest.app.base_url, actionDef, args, context, options);
  }

  /**
   * Main entry point. Called by the MCP tool handler for every tool call.
   *
   * If the action requires confirmation and this is the first call,
   * returns a { confirmationRequired: true, token, otp } result instead
   * of executing -- caller must call confirmAction(token, otp) next.
   *
   * `options.timeoutMs` bounds the backend call. It is per-execution, supplied by the
   * caller rather than read off the action, because a deadline is a property of the
   * place the action is being called from -- a workflow step declares `TIMEOUT`, an
   * ad-hoc REST or MCP call declares nothing and waits.
   */
  async execute(actionName, args, context, options = {}) {
    const actionDef = this.getActionDef(actionName);
    // args matter here: OWNER compares the caller's identity against one of them.
    this.checkPermission(actionDef, context, args || {});
    
    try {
      const schema = z.object(buildZodShape(actionDef.input, this.manifest?.entities));
      schema.parse(args || {});
    } catch (err) {
      throw new ValidationError(`Validation failed for action "${actionName}": ${err.message}`);
    }

    await this._checkRateLimit(actionName, context);

    const cacheKey = this._idempotencyCacheKey(actionName, context, options.idempotencyScope);

    const doExecute = async () => {
      if (cacheKey) {
        const cached = await this.state.get("idempotencyCache", cacheKey);
        if (cached) return cached;
      }

      const startedAt = Date.now();
      this.emitEvent("action.started", { actionName, args, context });

      if (actionDef.confirm === "OTP") {
        const token = crypto.randomUUID();
        const otp = String(crypto.randomInt(100000, 999999));
        await this.state.set("pendingConfirmations", token, {
          actionName, args, context, otp,
          // Who is allowed to confirm this. Without it, a token was a pure bearer
          // credential: anyone who learned it (it is handed out in an API response,
          // and used to be broadcast over an unauthenticated WebSocket) could confirm
          // and the action would then execute under THIS requester's session. Verified
          // live: a second registered user confirmed the first user's token and deleted
          // the first user's task.
          requesterKey: this._clientKey(context),
          attempts: 0
        }, 5 * 60 * 1000); // 5 min TTL
        
        const result = {
          confirmationRequired: true,
          // Formalised into the same vocabulary the error hints use, deliberately.
          // This is not an error, but it is the same question -- "what do I do next" --
          // and the answer was previously only in prose. A machine caller should not
          // have to parse an English sentence to learn it must call confirm_action, and
          // one caller reading one field across both success and failure is simpler
          // than two mechanisms. Purely additive: `message` is unchanged.
          next_action: "confirm_action",
          token,
          // Only included when explicitly opted in via AXL_DEMO_OTP=1. This is meant for
          // local development only -- in production the OTP must be delivered out-of-band
          // (SMS/email), never returned in the response.
          ...(isEnvFlagEnabled(process.env.AXL_DEMO_OTP) ? { otp_demo_only: otp } : {}),
          message: `Action "${actionName}" requires confirmation. Call confirm_action with this token and the OTP.`,
        };
        
        if (cacheKey) {
          await this.state.set("idempotencyCache", cacheKey, result, 86400000); // 24hr TTL
        }
        
        return result;
      }

      const result = await this._executeHttp(actionName, actionDef, args, context, options);
      if (cacheKey) {
        await this.state.set("idempotencyCache", cacheKey, result, 86400000); // 24hr TTL
      }
      // Elapsed wall time for the whole gated execution, not just the HTTP call: it is
      // what a caller actually waited, which is the number worth reporting.
      this.emitEvent("action.completed", {
        actionName, args, context, result, durationMs: Date.now() - startedAt
      });

      // A named domain event, when the action declares one. Emitted IN ADDITION to the
      // generic lifecycle event above, never instead of it -- a subscriber already
      // listening for action.completed must keep working, so this is purely additive.
      //
      // Carries the same `context` for the same reason every other event does: the
      // WebSocket filter fails closed and delivers only on a positive identity match,
      // so an event emitted without it would reach nobody. The compiler guarantees the
      // name is neither a lifecycle name nor shared with another action (AXL350/AXL351).
      if (actionDef.event) {
        this.emitEvent(actionDef.event, { actionName, args, context, result });
      }

      return result;
    };

    if (cacheKey) {
      return await withLock(`idem:${cacheKey}`, doExecute);
    }
    return await doExecute();
  }

  /**
   * Reads a resource: the non-mutating counterpart to execute().
   *
   * Same permission gate, same backend adapter, same rate limiting -- and deliberately
   * NOT the same idempotency handling. The two pieces of that machinery exist for
   * different reasons and only one of them applies to a read:
   *
   *   Idempotency: SKIPPED. The cache exists to stop a retry causing a second side
   *   effect -- charging a card twice. A GET has no side effect to duplicate, so replay
   *   protection buys nothing. It would also actively harm: entries are written with a
   *   24-hour TTL, and a resource is by definition a *live* value. Serving yesterday's
   *   cart from cache would be a correctness bug introduced by a safety feature.
   *
   *   Rate limiting: KEPT. Whether a call is idempotent says nothing about what it
   *   costs. A PUBLIC resource is an unauthenticated proxy to the developer's backend,
   *   which is exactly the scraping and DoS surface RATE_LIMIT exists for. Skipping it
   *   because "GETs are safe" would confuse safe-to-repeat with free-to-repeat.
   *
   * No confirm-gate branch exists here at all, rather than a branch that never fires:
   * the compiler rejects CONFIRM on a resource (AXL334), so there is nothing to check.
   *
   * Args are always `{}` -- a resource takes no inputs, and the compiler rejects a path
   * with placeholders (AXL328), so there is nothing for buildUrl to fill.
   */
  async readResource(resourceName, context) {
    const resourceDef = this.getResourceDef(resourceName);
    // Always {} -- a resource takes no inputs, which is why OWNER is rejected on one
    // at compile time (AXL362): there would be no field to compare against.
    this.checkPermission(resourceDef, context, {});
    await this._checkRateLimit(resourceName, context);
    return this._executeHttp(resourceName, resourceDef, {}, context);
  }

  /**
   * Counts a failed OTP attempt against the client, across every token they hold.
   *
   * The 5-attempt lockout is per token, and a client can mint a fresh token (with a
   * fresh OTP) just by calling the action again -- so the lockout caps guesses per
   * token but not in aggregate. Measured before this existed: 2000 wrong guesses from
   * a single IP in 44ms, 400 lockouts each reset by simply requesting a new token.
   *
   * Returns true once the client is over the aggregate limit.
   *
   * Counted against every bucket in _clientQuotaKeys, for the same reason rate limits
   * are: were this keyed on the session, an attacker would clear their own lockout by
   * sending a different bearer token.
   */
  async _recordConfirmFailure(context) {
    const keys = this._clientQuotaKeys(context).map(k => `confirmFailures:${k}`);
    return await withLock(`rl:${keys[0]}`, async () => {
      const now = Date.now();
      let locked = false;
      for (const key of keys) {
        let record = await this.state.get("rateLimits", key);
        if (record && now > record.windowEnd) record = undefined;
        if (!record) record = { count: 0, windowEnd: now + CONFIRM_FAILURE_WINDOW_MS };
        record.count++;
        await this.state.set("rateLimits", key, record, Math.max(0, record.windowEnd - now));
        if (record.count >= CONFIRM_FAILURE_LIMIT) locked = true;
      }
      return locked;
    });
  }

  async _isConfirmLocked(context) {
    const now = Date.now();
    for (const k of this._clientQuotaKeys(context)) {
      const record = await this.state.get("rateLimits", `confirmFailures:${k}`);
      if (record && now <= record.windowEnd && record.count >= CONFIRM_FAILURE_LIMIT) return true;
    }
    return false;
  }

  /**
   * Second phase of a confirm-gated action.
   *
   * `callerContext` is the context of whoever is calling *now* -- not the context
   * captured when the confirmation was requested. It must be supplied: the caller's
   * identity is compared against the requester's before the OTP is even looked at.
   */
  async confirmAction(token, submittedOtp, callerContext, options = {}) {
    const pending = await withLock(`confirm:${token}`, async () => {
      const p = await this.state.get("pendingConfirmations", token);
      if (!p) {
        throw withNextAction(
          new NotFoundError("Invalid or expired confirmation token."), "request_confirmation");
      }

      // Caller-identity binding. Deliberately raises the SAME error as an unknown
      // token: a distinct "not your token" response would turn this endpoint into an
      // oracle for which tokens exist. Checked before the OTP comparison so a wrong
      // caller cannot burn down the real requester's attempt budget either.
      if (this._clientKey(callerContext) !== p.requesterKey) {
        throw withNextAction(
          new NotFoundError("Invalid or expired confirmation token."), "request_confirmation");
      }

      // Checked before the OTP comparison: a locked-out client must not get to keep
      // testing guesses, even correct ones.
      if (await this._isConfirmLocked(p.context)) {
        throw withNextAction(
          new TooManyAttemptsError("Too many incorrect confirmation attempts. Try again later."),
          "request_confirmation");
      }

      if (!otpMatches(submittedOtp, p.otp)) {
        const clientLocked = await this._recordConfirmFailure(p.context);
        p.attempts = (p.attempts || 0) + 1;
        if (p.attempts >= 5 || clientLocked) {
          await this.state.delete("pendingConfirmations", token);
          throw withNextAction(
            new TooManyAttemptsError("Too many incorrect attempts. Action cancelled -- please retry from the start."),
            "request_confirmation");
        }
        await this.state.set("pendingConfirmations", token, p, 5 * 60 * 1000);
        // The token is still alive and the budget is not spent, so the same token with
        // the right OTP still works -- this is the one case that means "try again".
        throw withNextAction(
          new ValidationError(`Incorrect OTP. ${5 - p.attempts} attempt(s) remaining.`),
          "retry_confirmation");
      }

      await this.state.delete("pendingConfirmations", token);
      return p;
    });

    const actionDef = this.getActionDef(pending.actionName);
    // `options` is empty for a direct confirm_action call -- there is no step to have
    // declared anything. resumeWorkflow fills it from the paused step, so a step's
    // RETRY/TIMEOUT still apply to the execution that happens after human approval
    // rather than being quietly dropped at the pause.
    const attempts = Number.isInteger(options.attempts) && options.attempts > 1 ? options.attempts : 1;
    const result = await this._withRetry(attempts, options.onRetry || (() => {}), () =>
      this._executeHttp(pending.actionName, actionDef, pending.args, pending.context, {
        timeoutMs: options.timeoutMs
      })
    );


    // Update cache with the final executed result. Must use the exact same key
    // construction as execute(), or the replay never finds this entry.
    const cacheKey = this._idempotencyCacheKey(pending.actionName, pending.context);
    if (cacheKey) {
      await this.state.set("idempotencyCache", cacheKey, result, 86400000);
    }
    
    return result;
  }

  /**
   * Starts a workflow execution.
   */
  async runWorkflow(workflowName, initialArgs, context) {
    const workflowDef = this.getWorkflowDef(workflowName);
    
    if (workflowDef.steps.length > 0) {
      const firstStep = workflowDef.steps[0];
      const actionName = typeof firstStep === "string" ? firstStep : firstStep.action;
      if (actionName) {
        const actionDef = this.getActionDef(actionName);
        const schema = z.object(buildZodShape(actionDef.input, this.manifest?.entities));
        try {
          schema.parse(initialArgs || {});
        } catch (err) {
          throw new Error(`Invalid initial arguments for workflow "${workflowName}": ${err.message}`);
        }
      }
    }
    
    this.emitEvent("workflow.started", { workflowName, initialArgs, context });
    
    return this._continueWorkflow({
      workflowName,
      remainingSteps: [...workflowDef.steps],
      args: { ...initialArgs },
      stepOutputs: {},
      context,
      workflowRunId: crypto.randomUUID(),
      // Carried in the persisted state, so a run that pauses for OTP and resumes hours
      // later reports total elapsed rather than restarting the clock at resume.
      startedAt: Date.now()
    });
  }

  /**
   * Runs one workflow step, honouring its optional `RETRY <n>` and `TIMEOUT <ms>`
   * modifiers.
   *
   * ── How the two compose ─────────────────────────────────────────────────────────
   *
   * TIMEOUT is per ATTEMPT, not per step: `RETRY 3 TIMEOUT 1000` gives each of the
   * three attempts its own second, so the worst case is 3s of waiting plus the retry
   * delays, not one second shared between them. Per-step would make the second and
   * third attempts progressively more likely to be killed by a deadline the first
   * attempt spent, which is the opposite of what a retry is for.
   *
   * A timeout is retry-eligible. It is the canonical transient failure -- if any
   * failure is worth a second attempt, a backend that was briefly too slow is.
   *
   * ── What is retried, and what deliberately is not ────────────────────────────────
   *
   * ONLY BackendError and TimeoutError. A retry is a bet that the same request will fare better a moment
   * later, and that bet is only sane when the failure was the backend call itself --
   * a 503, a dropped connection, a blip. ValidationError and PermissionError are
   * properties of the request, so retrying just fails identically N times, N times more
   * slowly, while looking like the system is trying. RateLimitError is excluded for a
   * sharper reason: retrying into a limit you have already exceeded is the one thing
   * guaranteed to keep you over it.
   *
   * A CONFIRM/OTP pause is never retried either, and that falls out of the design
   * rather than needing a guard: execute() *returns* a `confirmationRequired` envelope,
   * it does not throw. A pause therefore exits this loop as a success on the first
   * attempt. Covered by a test so a future refactor that starts throwing on pause does
   * not silently turn a human approval gate into N retries.
   *
   * ── Backoff ─────────────────────────────────────────────────────────────────────
   *
   * A flat delay between attempts, not exponential and not jittered. Reasoning: the
   * delay is not configurable in this pass, so the only thing an author declaring
   * `RETRY 3` can reason about is the worst case, and a flat delay makes that
   * arithmetic trivial (`(n-1) * STEP_RETRY_DELAY_MS`). Exponential backoff is the
   * right answer for a long outage, but it would make the worst case depend on a
   * constant nobody declared, and it interacts badly with the per-attempt TIMEOUT this
   * is designed to compose with. Zero delay is not an option -- that is just hammering.
   */
  async _runStepWithRetry(state, step, actionName, actionArgs, extraOptions = {}) {
    const { attempts, timeoutMs } = stepExecutionOptions(step);

    return this._withRetry(attempts, (attempt) => {
      this.emitEvent("step.retrying", {
        workflowName: state.workflowName,
        actionName,
        attempt: attempt.number,
        of: attempts,
        reason: attempt.reason,
        context: state.context
      });
    }, () => this.execute(actionName, actionArgs, state.context, { timeoutMs, ...extraOptions }));
  }

  /**
   * The retry loop itself, with no opinion about what is being retried.
   *
   * Separate from _runStepWithRetry because the confirmed-execution path
   * (confirmAction, reached from resumeWorkflow) has to run the same budget against a
   * bare _executeHttp rather than a full execute(): a paused step's permission,
   * validation and rate-limit gates were already cleared before it paused.
   */
  async _withRetry(attempts, onRetry, run) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await run();
      } catch (err) {
        lastError = err;
        const retryable = err instanceof BackendError || err instanceof TimeoutError;
        if (!retryable || attempt === attempts) throw err;

        onRetry({ number: attempt, reason: err.message });
        await new Promise(r => setTimeout(r, STEP_RETRY_DELAY_MS));
      }
    }
    throw lastError;
  }

  /**
   * Builds one step's arguments: USING bindings first, then any unbound input the
   * workflow's initial args can supply, then schema validation.
   *
   * Extracted so a PARALLEL member is prepared by exactly the same code as a sequential
   * step. Note this is deliberately done for every member *before* any of them is
   * dispatched -- a member with bad inputs must not fire off its siblings first.
   */
  _resolveStepArgs(state, step, actionName) {
    const bindings = typeof step === 'object' ? (step.bindings || []) : [];
    const actionDef = this.getActionDef(actionName);
    const actionArgs = {};

    for (const binding of bindings) {
      const sourceData = state.stepOutputs[binding.sourceStep];
      if (!sourceData) {
        throw new Error(`Workflow error: Source step ${binding.sourceStep} output not found.`);
      }
      actionArgs[binding.targetField] = sourceData[binding.sourceField];
    }

    // Merge from initialArgs for unbound fields
    for (const inputName of Object.keys(actionDef.input)) {
      if (!(inputName in actionArgs) && (inputName in state.args)) {
        actionArgs[inputName] = state.args[inputName];
      }
    }

    const schema = z.object(buildZodShape(actionDef.input, this.manifest?.entities));
    try {
      schema.parse(actionArgs);
    } catch (err) {
      throw new Error(`Workflow error at step "${actionName}": invalid inputs. ${err.message}`);
    }

    return actionArgs;
  }

  /**
   * Runs a PARALLEL block: every member dispatched at once, the block advancing only
   * once all of them have settled.
   *
   * ── Why this needs no new persisted state ───────────────────────────────────────
   *
   * Because nothing inside can pause. The compiler rejects CONFIRM inside a block
   * (AXL381) and rejects any nested control flow (AXL383), so a member can only
   * succeed or throw. The block is therefore atomic as far as `remainingSteps` is
   * concerned: it is shifted once, after everything has settled. There is never a
   * moment where half a block needs representing in a flat cursor, which is exactly
   * the problem that stopped an earlier attempt at this.
   *
   * ── Failure ─────────────────────────────────────────────────────────────────────
   *
   * Fail-fast: the first rejection propagates and the workflow stops, matching what a
   * sequential step failure already does. **Sibling side effects are not rolled back.**
   * A member that completed before another failed has really called the backend, and
   * there is no compensation mechanism -- the same caveat that already applies when a
   * sequential workflow dies partway through, except a block can leave more than one
   * committed action behind. The error says so, because a caller reading only the
   * message would otherwise assume the block was all-or-nothing.
   *
   * `Promise.allSettled`, not `Promise.all`: `all` rejects the instant one member
   * throws, leaving its siblings running unobserved into an unhandled rejection. This
   * still fails fast to the caller -- it just waits for the others to stop first, so
   * nothing is left dangling.
   */
  async _runParallelBlock(state, members) {
    // Every member's args are resolved before any is dispatched, so a bad input fails
    // the block without having already fired the others at the backend.
    const prepared = members.map(member => ({
      member,
      actionName: member.action,
      args: this._resolveStepArgs(state, member, member.action),
    }));

    const settled = await Promise.allSettled(
      prepared.map(({ member, actionName, args }, i) =>
        this._runStepWithRetry(state, member, actionName, args, {
          // Distinct replay slot per member. See _idempotencyCacheKey -- the whole
          // workflow shares one client-supplied idempotencyKey, and the index keeps a
          // member from sharing a slot with the same action used elsewhere in the run.
          idempotencyScope: `par${i}`,
        })
      )
    );

    const failure = settled.find(r => r.status === "rejected");
    if (failure) {
      const completed = prepared
        .filter((_, i) => settled[i].status === "fulfilled")
        .map(p => p.actionName);
      const err = failure.reason;
      if (err instanceof Error && completed.length > 0) {
        // Appended rather than replaced: the original message is the actual diagnosis,
        // and swallowing it to say something tidier would lose it.
        err.message =
          `${err.message} (parallel block in workflow "${state.workflowName}": ` +
          `${completed.join(", ")} already completed and ${completed.length === 1 ? "was" : "were"} not rolled back)`;
      }
      throw err;
    }

    // Safe to key by action name: the compiler guarantees no action appears twice in
    // one block (AXL382), so these writes cannot collide with each other.
    prepared.forEach(({ actionName }, i) => {
      // Every entry is fulfilled here -- the `if (failure)` above throws otherwise -- but
      // reading `.value` off the union without saying so is exactly the shape of a real
      // bug elsewhere, so the check is explicit.
      const result = settled[i];
      if (result.status !== "fulfilled") return;
      const value = result.value;
      if (value && typeof value === "object") {
        state.stepOutputs[actionName] = value;
      }
    });
  }

  /**
   * Internal loop to run workflow steps until completion or pause.
   */
  async _continueWorkflow(state) {
    const workflowDef = this.getWorkflowDef(state.workflowName);
    
    // Add stepOutputs if not present
    if (!state.stepOutputs) {
      state.stepOutputs = {};
    }
    
    while (state.remainingSteps && state.remainingSteps.length > 0) {
      const step = state.remainingSteps[0];
      
      if (typeof step === 'object' && step.if) {
        const conditionValue = resolveStepOutputPath(state.stepOutputs, step.if);

        state.remainingSteps.shift();
        if (conditionValue) {
           state.remainingSteps.unshift(...step.then);
        } else if (step.else) {
           state.remainingSteps.unshift(...step.else);
        }
        continue;
      }

      // The general multi-way branch. IF/ELSE above is untouched -- SWITCH is the
      // general form, not its replacement.
      if (typeof step === 'object' && step !== null && typeof step.switch === 'string') {
        const subjectValue = resolveStepOutputPath(state.stepOutputs, step.switch);
        // Compared as a string: the value arrives from a backend as JSON, so `CASE 2`
        // has to match a numeric 2 as readily as a "2". null/undefined are excluded
        // rather than stringified -- "undefined" is not a value anyone means to match.
        const key = subjectValue === null || subjectValue === undefined ? null : String(subjectValue);
        const matched = key === null ? undefined : step.cases.find(c => c.value === key);

        state.remainingSteps.shift();
        if (matched) {
          state.remainingSteps.unshift(...matched.steps);
        } else if (step.default) {
          state.remainingSteps.unshift(...step.default);
        } else {
          // Falling through silently would let a workflow report COMPLETED having
          // skipped the only thing it exists to do. If not matching is acceptable,
          // that intent is spelled `DEFAULT` with an empty body.
          throw new ValidationError(
            `Workflow "${state.workflowName}" switched on "${step.switch}" with value ` +
            `${JSON.stringify(subjectValue)}, which matched no CASE and there is no DEFAULT.`
          );
        }
        continue;
      }

      // A fixed pause. The whole workflow runs inline with the request that started it,
      // so this holds that request open for the duration -- which is the honest cost of
      // a synchronous engine, and the reason WAIT is fixed-duration only. Waiting on an
      // external event would mean parking a run indefinitely, which needs a durable
      // scheduler this does not have; the compiler rejects that spelling (AXL374).
      if (typeof step === 'object' && step !== null && typeof step.wait === 'number') {
        this.emitEvent("workflow.waiting", {
          workflowName: state.workflowName,
          workflowRunId: state.workflowRunId,
          durationMs: step.wait,
          context: state.context
        });
        await new Promise(r => setTimeout(r, step.wait));
        state.remainingSteps.shift();
        continue;
      }

      // A block of steps that run concurrently. Shifted once, after every member has
      // settled -- see _runParallelBlock for why that keeps the flat cursor sufficient.
      if (typeof step === 'object' && step !== null && Array.isArray(step.parallel)) {
        this.emitEvent("parallel.started", {
          workflowName: state.workflowName,
          workflowRunId: state.workflowRunId,
          actionNames: step.parallel.map(m => m.action),
          context: state.context
        });

        await this._runParallelBlock(state, step.parallel);

        this.emitEvent("parallel.completed", {
          workflowName: state.workflowName,
          workflowRunId: state.workflowRunId,
          actionNames: step.parallel.map(m => m.action),
          context: state.context
        });

        state.remainingSteps.shift();
        continue;
      }

      const isActionStep = typeof step === 'string' || (typeof step === 'object' && step.action);
      // A step matching neither branch used to fall through without advancing
      // remainingSteps, spinning this `while` forever. The loop is synchronous between
      // awaits, so it did not just hang the one workflow -- it pinned the event loop and
      // took the whole process down with it. Reproduced with a hand-edited manifest.
      if (!isActionStep) {
        throw new ValidationError(
          `Workflow "${state.workflowName}" has a malformed step: expected an action name, ` +
          `an object with an "action" field, a branch with an "if" field, or a block with ` +
          `a "parallel" field, got ${JSON.stringify(step)}.`
        );
      }
      {
        const actionName = typeof step === 'string' ? step : step.action;
        const actionArgs = this._resolveStepArgs(state, step, actionName);

        const result = await this._runStepWithRetry(state, step, actionName, actionArgs);

        if (result && result.confirmationRequired) {
          await this.state.set("pausedWorkflows", result.token, state, 86400000); // 24hr TTL for paused workflows
          // `context` is not decoration: every transport that fans events out to
          // clients uses it to decide who an event belongs to. Emitted without it,
          // this event -- which carries a live confirmation token -- was delivered to
          // every connected WebSocket client, authenticated or not.
          this.emitEvent("workflow.paused", { workflowName: state.workflowName, actionName, token: result.token, context: state.context });
          return {
            ...result,
            message: `Workflow "${state.workflowName}" paused at step "${actionName}" for confirmation. Call resume_workflow with this token and the OTP.`
          };
        }
        
        if (result && typeof result === "object") {
          state.stepOutputs[actionName] = result;
        }
        
        state.remainingSteps.shift();
      }
    }
    
    this.emitEvent("workflow.completed", {
      workflowName: state.workflowName,
      workflowRunId: state.workflowRunId,
      finalResult: state.stepOutputs,
      context: state.context,
      ...(state.startedAt ? { durationMs: Date.now() - state.startedAt } : {})
    });
    
    return {
      status: "COMPLETED",
      workflowRunId: state.workflowRunId,
      finalResult: state.stepOutputs
    };
  }

  /**
   * Resumes a paused workflow.
   */
  async resumeWorkflow(token, submittedOtp, callerContext) {
    const state = await this.state.get("pausedWorkflows", token);
    // Same caller-identity binding as confirmAction, and deliberately folded into the
    // same error: checking it here as well keeps a leaked token from distinguishing
    // "a paused workflow exists for this token" from "no such token" before
    // confirmAction ever runs.
    if (!state || this._clientKey(callerContext) !== this._clientKey(state.context)) {
      // Unknown or expired: retrying with this token can never succeed, so the hint has
      // to point at starting the gated call over rather than at trying again.
      throw withNextAction(
        new ValidationError("Invalid or expired workflow run token."), "request_confirmation");
    }

    const step = state.remainingSteps[0];
    const actionName = typeof step === "string" ? step : step.action;
    const { attempts, timeoutMs } = stepExecutionOptions(step);

    // This will throw if OTP is incorrect or expired.
    // Also it handles the actual execution of the paused action -- which is why the
    // step's own RETRY/TIMEOUT have to be handed down: the execution a paused step is
    // waiting for happens inside confirmAction, not back in the step loop.
    const result = await this.confirmAction(token, submittedOtp, callerContext, {
      attempts,
      timeoutMs,
      onRetry: (attempt) => this.emitEvent("step.retrying", {
        workflowName: state.workflowName,
        actionName,
        attempt: attempt.number,
        of: attempts,
        reason: attempt.reason,
        context: state.context
      })
    });

    await this.state.delete("pausedWorkflows", token);

    if (result && typeof result === "object") {
      state.stepOutputs[actionName] = result;
    }
    
    state.remainingSteps.shift();
    this.emitEvent("workflow.resumed", { workflowName: state.workflowName, actionName, context: state.context });
    return this._continueWorkflow(state);
  }
}

export class PermissionError extends Error {}
export class ValidationError extends Error {}
export class NotFoundError extends Error {}
export class TooManyAttemptsError extends Error {}
// Thrown when a manifest RATE_LIMIT is exceeded. Typed (rather than a bare Error) so the
// adapters can classify it instead of string-matching the message, and so it is not
// mistaken for an unexpected internal fault and redacted by safeErrorMessage.
export class RateLimitError extends Error {
  /**
   * Milliseconds until the exceeded window rolls over. Read straight off the bucket
   * state the limiter already tracks, so this costs nothing to produce and is a real
   * number rather than a guessed backoff.
   */
  constructor(message, retryAfterMs) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}
export class BackendError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}
/**
 * Thrown when a step's `TIMEOUT <ms>` deadline expires before the backend answered.
 *
 * Deliberately NOT a subclass of BackendError, even though it is a backend failure and
 * the retry loop treats it as one. BackendError carries the status the backend actually
 * returned; a timeout means there was no response to have a status. Subclassing would
 * make `err.status` undefined on something every adapter reads as a real upstream code.
 */
export class TimeoutError extends Error {
  constructor(message, timeoutMs) {
    super(message);
    this.timeoutMs = timeoutMs;
  }
}
