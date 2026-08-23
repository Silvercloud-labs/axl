# Wire protocol

What a client sees. Everything on this page is served by `axl serve` from a compiled
`manifest.json` — no part of it is configurable per deployment except the base URL.

AXL exposes an application's capabilities **simultaneously** over REST and MCP, plus a
one-way WebSocket event stream. The engine behind all three is the same, so validation,
permissions, confirmation gates and rate limits cannot differ between them.

---

## 1. Discovery

Discovery is the entry point. A client reads one document and learns every other URL.

```console
$ curl -s http://127.0.0.1:3939/.well-known/axl
{
  "version": "1.0",
  "server_name": "TaskDeck",
  "server_version": "1.0.0",
  "manifest": "http://127.0.0.1:3939/manifest.json",
  "rest": "http://127.0.0.1:3939",
  "mcp": "http://127.0.0.1:3939/mcp",
  "ws": "ws://127.0.0.1:3939/ws",
  "auth": {
    "type": "bearer",
    "note": "Obtain a session via the project's own login/register action, then send it as: Authorization: Bearer <token>"
  }
}
```

### Connection sequence

1. `GET /.well-known/axl`
2. `GET` the URL in `manifest` — the full capability contract
3. Invoke over whichever transport suits the client: `rest` or `mcp`
4. Optionally connect to `ws` for events

> **A client must not fall back to browser automation, DOM scraping, Playwright or
> Selenium.** An application either exposes AXL or it does not. A scraper that "works"
> silently bypasses every permission the spec declares.

### The base URL is validated, not echoed

Every absolute URL in both discovery documents is built from the address the server actually
bound, not from the request's `Host` header. A forged `Host` used to produce a discovery
document advertising an attacker-controlled origin, signed by nothing but having come from
this server.

Deployments legitimately behind a reverse proxy under a different name have two escape
hatches, because silently rewriting their public URL would be its own bug:

| Variable | Effect |
|---|---|
| `AXL_PUBLIC_URL` | The exact origin to advertise. Wins outright |
| `AXL_ALLOWED_HOSTS` | Comma-separated additional `Host` values to accept as-is |

---

## 2. Operations

### Discovery and health

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness. Returns name, version, `axl_version` |
| `GET` | `/manifest.json` | The compiled manifest |
| `GET` | `/.well-known/axl` | AXL discovery document |
| `GET` | `/.well-known/mcp` | MCP discovery document |

`/manifest.json` is public by design — it is a discovery contract, served deliberately.

### Invocation

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/actions/:name` | Invoke an action |
| `GET` | `/resources/:name` | Read a resource |
| `POST` | `/workflows/:name` | Start a workflow |
| `POST` | `/workflows/resume` | Resume a paused workflow |
| `POST` | `/confirm` | Complete an OTP-gated action |
| `ALL` | `/mcp` | MCP Streamable HTTP transport |

```http
POST /actions/create_task HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>

{ "project_id": "p_1", "title": "Buy groceries" }
```

---

## 3. Request headers

| Header | Effect |
|---|---|
| `Authorization: Bearer <token>` | Establishes a session. Passed to your backend verbatim; **AXL never validates it** |
| `Idempotency-Key` | Replays a cached result. **Requires a session** — anonymous callers get no replay rather than one shared across a NAT |
| `X-Request-Id` / `X-Correlation-Id` / `X-Amzn-Trace-Id` | Correlation id, echoed on the response and attached to every event |
| `X-AXL-Subject` / `X-AXL-Roles` | Identity claims. Honoured **only** under `--trust-identity-headers` |

## 4. Manifest schema

`/manifest.json` is the compiled representation of the `.flow` sources. Its top-level keys:

| Key | Contents |
|---|---|
| `app` | Name, version, description, `base_url` |
| `axl_version` | Protocol version, currently `1.0` |
| `entities` | `ENTITY` schemas — fields, types, references |
| `actions` | Input schema, output type, endpoint, permission, confirm flag, consequence metadata |
| `resources` | Output type, endpoint, permission |
| `workflows` | Ordered steps, bindings, branches |
| `rateLimits` | Declared quota per action or resource name |

Clients should ignore unknown fields. Additive manifest changes are minor-version changes.

---

## 5. Authentication

AXL does not issue, store, validate or inspect credentials. It forwards them.

1. **Minting** — the client calls a `PUBLIC` action your project defines (a `login` or
   `register` action). Your backend returns a session token.
2. **Use** — the client sends `Authorization: Bearer <token>` on subsequent requests.
3. **Forwarding** — AXL attaches it to the outbound backend call unchanged.

A session's *existence* is what `AUTH` checks. Its *validity* is checked by your backend
when the proxied call arrives. This is why `ROLE` and `OWNER` need
`--trust-identity-headers` and an authenticating gateway — see
[Permissions and rate limiting](permissions.md).

### WebSocket authentication

Browser-native WebSockets cannot send headers during the handshake, so the session is
passed as a query parameter:

```
ws://127.0.0.1:3939/ws?token=<session_token>
```

A socket with no valid token receives no session-scoped events.

---

## 6. MCP surface

Served over Streamable HTTP at `/mcp`.

| Manifest concept | MCP primitive |
|---|---|
| `ACTION` | Tool — `tools/list`, `tools/call` |
| `RESOURCE` | Resource — `resources/list`, `resources/read`, URI `axl://resource/<name>` |
| `DESC` on an action | Tool description |
| `DESC` on an input | Parameter description in the tool schema |
| `IRREVERSIBLE` / `EFFECTS` / `SIDE_EFFECTS` | Appended to the tool description |

```console
$ curl -s http://127.0.0.1:3939/.well-known/mcp
{
  "mcp_version": "1.0",
  "server_name": "TaskDeck",
  "server_version": "1.0.0",
  "endpoints": { "streamable_http": "http://127.0.0.1:3939/mcp" },
  "capabilities": { "tools": true, "resources": false, "prompts": false },
  "authentication": { "required": true, "methods": ["bearer"] }
}
```

`capabilities.resources` is **derived from the manifest**, not hardcoded — a project with no
`RESOURCE` declarations correctly advertises `false`, because advertising a capability whose
listing is empty is a lie a client will act on.

`prompts` is `false` always. AXL exposes no Prompts, Notifications, Progress tracking or
Roots, and is intentionally narrower than MCP.

A resource is **never** registered as a zero-argument tool. Doing so would put a read into
the mutation menu and leave `resources/list` empty.

---

## 7. Events

Broadcast over `ws://<host>/ws`. The socket accepts exactly one inbound message type,
`ping`, and replies `pong`. **Actions cannot be invoked over it.**

| Event | Emitted when |
|---|---|
| `action.started` | An action begins |
| `action.completed` | An action succeeds |
| `workflow.started` | A workflow begins |
| `workflow.paused` | A workflow hits a confirmation gate |
| `workflow.resumed` | A paused workflow continues |
| `workflow.waiting` | A `WAIT` step begins |
| `workflow.completed` | A workflow finishes |
| `step.retrying` | A `RETRY` attempt is about to repeat |

Plus any domain event named with `EVENT <Name>` on an action. Named events are **purely
additive** — emitted alongside `action.started` and `action.completed`, never instead of
them. Duplicate names across actions are a compile error (`AXL351`).

Every event carries the originating request's correlation id as `data.requestId`.

> **The broadcast filter fails closed.** A client receives an event only on a positive
> identity match. An event carrying no context reaches **nobody**, rather than everybody.
> That structural shape is the point: a future contextless event is silently dropped instead
> of silently leaked.

Credentials — session cookies, tokens — are stripped from event payloads before
transmission.

---

## 8. Errors

**REST errors are RFC 7807** `application/problem+json`:

```console
$ curl -s -X POST http://127.0.0.1:3939/actions/does_not_exist -d '{}' \
    -H 'Content-Type: application/json'
{
  "type": "NOT_FOUND",
  "title": "Not found",
  "status": 404,
  "detail": "Unknown action: \"does_not_exist\"",
  "instance": "/actions/does_not_exist#783b5e15-2e0e-4d29-9433-518558594d1c"
}
```

`type` carries the machine-readable code. `instance` is `<path>#<request-id>`, so it
identifies the specific occurrence rather than being identical across every error on a
route. Prefix matching on `instance` still works; exact equality does not.

| `type` | Status |
|---|---|
| `MALFORMED_JSON` | 400 |
| `VALIDATION_ERROR` | 400 |
| `PERMISSION_DENIED` | 403 |
| `FORBIDDEN_ORIGIN` | 403 |
| `NOT_FOUND` | 404 |
| `TOO_MANY_ATTEMPTS` | 429 |
| `RATE_LIMIT_EXCEEDED` | 429 |
| `TIMEOUT` | 504 |
| `BACKEND_ERROR` | varies |

There is **no 401**. A missing session on an `AUTH` action is `403 PERMISSION_DENIED`, not
`401 Unauthorized`, because AXL issues no challenge — a `WWW-Authenticate` header would
name a scheme AXL does not implement.

Some errors carry a `next_action` hint, attached at the engine's throw site rather than
inferred from the route — only the throw site knows which case it is. Its **absence is part
of the contract**: `PERMISSION_DENIED` gets no hint because it can mean three different
things, and the key is omitted entirely rather than set to null.

**MCP keeps its own error convention.** Tool-result envelopes and JSON-RPC errors are not
converted to RFC 7807; doing so would fight the protocol. Both transports classify through
the same branch set, so a rate-limit rejection reports `RATE_LIMIT_EXCEEDED` on either.

---

## 9. Versioning

The protocol version appears as `version` in `/.well-known/axl` and as `axl_version` in the
manifest. Currently `1.0`.

| Change | Meaning |
|---|---|
| Minor | Additive fields in the manifest or discovery payload. Clients ignore unknown fields |
| Major | Breaking changes to the transport sequence or authentication requirements |

Existing `.flow` specs keep compiling across minor versions. Client implementers should
respect the `version` field during discovery rather than assuming.

---

## Related

- [Architecture](architecture.md) — where the boundary between compiler and runtime sits
- [Permissions and rate limiting](permissions.md) — what gates a call before it proceeds
- [Workflows and control flow](workflows.md) — confirmation and resume envelopes
- [SPECIFICATION.md](../SPECIFICATION.md) — the source language the manifest comes from
