import { BackendError, TimeoutError, ValidationError } from "./engine.js";

/**
 * Fills {path_param} placeholders in an endpoint path using values from args,
 * and returns the remaining args (the ones NOT consumed as path params) as
 * the request body / query.
 */
export function buildUrl(baseUrl, endpointPath, args) {
  const remaining = { ...args };
  const filledPath = endpointPath.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in remaining)) {
      // Typed, not a bare Error. safeErrorMessage() only passes through the engine's own
      // error classes, so a bare Error here was redacted to "Internal error." and
      // surfaced as a 500 with nothing in the log -- for a condition that is entirely a
      // property of the request and the spec. AXL389 now rejects the unfillable-by-
      // construction case at compile time; this remains reachable when a caller omits an
      // optional input that the path needs, which is a 400.
      throw new ValidationError(`Missing required path parameter: ${key}`);
    }
    const val = remaining[key];
    delete remaining[key];
    // encodeURIComponent escapes "/" and ":", so a path param cannot introduce a new
    // host or path segment -- but it leaves "." alone. A value of "." or ".." survives
    // into the URL as a relative path segment, and fetch() resolves it before sending,
    // so "/tasks/{id}/details" with id=".." reaches the backend as "/details". With one
    // "..' per path param an attacker walks up a segment at a time and lands on a
    // different endpoint than the action declares. Dot segments are never a legitimate
    // resource identifier, so reject them outright.
    const str = String(val);
    if (str === "." || str === "..") {
      throw new ValidationError(`Invalid path parameter '${key}': dot segments are not allowed.`);
    }
    return encodeURIComponent(str);
  });
  return { url: baseUrl + filledPath, remaining };
}

/**
 * Runs the real HTTP call against the site's backend.
 *
 * `options.timeoutMs`, when set, is a real deadline, not a bookkeeping one: an
 * AbortController is wired into fetch, so on expiry the request is actually
 * cancelled and the socket released. A deadline implemented with Promise.race would
 * resolve the caller on time while leaving the backend call running, which is the
 * opposite of what someone declaring a timeout wants -- under load that leaks a
 * connection per timed-out call.
 *
 * The deadline covers reading the response body as well as establishing the request.
 * A backend that answers headers instantly and then trickles the body forever is
 * exactly the kind of hang a timeout exists to bound, and the abort signal reaches
 * the body stream too.
 */
export async function executeHttpCall(baseUrl, actionDef, args, context, options = {}) {
  const { url, remaining } = buildUrl(baseUrl, actionDef.endpoint.path, args);
  const method = actionDef.endpoint.method;

  const headers = { "Content-Type": "application/json" };
  if (context && context.sessionCookie) {
    headers["Cookie"] = context.sessionCookie;
  }

  const fetchOpts = { method, headers };
  // GET and DELETE carry their non-path arguments as a query string; everything else
  // carries them as a JSON body.
  //
  // DELETE used to be excluded from the body AND from the query encoding, so every
  // argument that was not consumed as a path parameter was silently discarded. Verified
  // against an echo backend: an action with `reason : String REQUIRED` validated the
  // argument, returned 200, and the backend received `DELETE /items/i_1` with no body and
  // no query. The caller had no way to know.
  //
  // Query rather than body because RFC 9110 gives a DELETE body no defined semantics, and
  // proxies and servers are entitled to drop it -- so a body would have been the less
  // reliable of the two repairs.
  if (method === "GET" || method === "DELETE") {
    if (Object.keys(remaining).length > 0) {
      const u = new URL(url);
      for (const [k, v] of Object.entries(remaining)) {
        u.searchParams.append(k, String(v));
      }
      fetchOpts.url = u.toString();
    }
  } else {
    fetchOpts.body = JSON.stringify(remaining);
  }

  const finalUrl = fetchOpts.url || url;

  const timeoutMs = options.timeoutMs;
  let timer = null;
  // Tracked separately from the signal's own abort reason so a caller-supplied abort
  // (there is none today, but this is the obvious next parameter) is never reported as
  // a timeout it was not.
  let deadlineExpired = false;
  if (timeoutMs !== undefined) {
    const controller = new AbortController();
    timer = setTimeout(() => { deadlineExpired = true; controller.abort(); }, timeoutMs);
    fetchOpts.signal = controller.signal;
  }

  try {
    let res;
    try {
      res = await fetch(finalUrl, fetchOpts);
    } catch (error) {
      if (deadlineExpired) {
        throw new TimeoutError(`Backend did not respond within ${timeoutMs}ms.`, timeoutMs);
      }
      throw new BackendError(`Network error connecting to backend: ${error.message}`, 502, { error: error.message });
    }

    let text;
    try {
      text = await res.text();
    } catch (error) {
      if (deadlineExpired) {
        throw new TimeoutError(`Backend did not respond within ${timeoutMs}ms.`, timeoutMs);
      }
      throw error;
    }

    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }

    if (!res.ok) {
      throw new BackendError(`Backend returned ${res.status}`, res.status, body);
    }
    return body;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
