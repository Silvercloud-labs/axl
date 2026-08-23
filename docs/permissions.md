# Permissions and rate limiting

How the engine decides whether a call proceeds. This document describes the **mechanism**.
For the vulnerability-reporting process and the list of behaviours that are by design, see
[SECURITY.md](../SECURITY.md).

---

## Defaults

Defaults are chosen to fail closed. Widening any of them is an explicit operator decision.

| Setting | Default | Widen with |
|---|---|---|
| Bind address | Loopback only (`127.0.0.1` and `::1`) | `--host` |
| Origin validation | Loopback origins pass; others get `403 FORBIDDEN_ORIGIN` | `AXL_ALLOWED_ORIGINS` |
| Missing `Origin` header | Allowed | `AXL_MCP_STRICT_ORIGIN=1` to reject |
| OTP in API responses | Never | `AXL_DEMO_OTP=1` (demonstration only) |
| Identity headers | Ignored; `ROLE` and `OWNER` deny everything | `--trust-identity-headers` |
| `X-Forwarded-For` | Ignored | `--trust-proxy` |
| Public base URL in discovery | Derived from the validated bound address | `AXL_PUBLIC_URL`, `AXL_ALLOWED_HOSTS` |

A *missing* `Origin` is allowed by default because browsers always send one — rejecting an
absent origin adds no rebinding protection while breaking every non-browser client.

---

## Permission levels

Every action and every resource must declare one. There is no default (`AXL322`, `AXL329`).

| Level | Requires |
|---|---|
| `PUBLIC` | Nothing |
| `AUTH` | A session |
| `ROLE <role>` | A session **and** a verified identity claim carrying `<role>` |
| `OWNER <input>` | A session **and** a verified identity subject equal to the named argument |

```flow
PERMISSION list_hotels      : PUBLIC
PERMISSION create_booking   : AUTH
PERMISSION refund_booking   : ROLE staff
PERMISSION update_profile   : OWNER user_id
```

### `ROLE` and `OWNER` need a trusted gateway

> **`ROLE` and `OWNER` deny every request unless the server was started with
> `--trust-identity-headers`.**

This is not optional strictness. AXL never validates the bearer token, so everything an
ordinary client sends is attacker-controlled. A `ROLE` gate reading a client-supplied
header would be decoration — and worse than no gate, because it looks like one.

The flag is the operator asserting that an authenticating gateway sits in front and
**overwrites** `X-AXL-Subject` and `X-AXL-Roles` on every request rather than passing client
values through. If your gateway only *adds* those headers when absent, a client can supply
its own and the flag is unsafe.

```bash
axl serve --trust-identity-headers
```

### What `OWNER` does not promise

`OWNER user_id` asserts that the caller's subject equals the `user_id` **argument**. It
cannot assert that the caller owns the underlying record — that needs a backend lookup,
which is a backend concern.

Use it for "you may only act on your own id", not "you may only delete tasks you created".
The second needs a check inside your backend.

---

## Rate limiting

Declared as `RATE_LIMIT <name> : <count>/<unit>`.

```flow
RATE_LIMIT list_hotels    : 60/min
RATE_LIMIT create_booking : 10/min
RATE_LIMIT export_report  : 5/hr
```

| Unit | Window |
|---|---|
| `sec` | 1 second |
| `min` | 1 minute |
| `hr` | 1 hour |
| `day` | 24 hours |

Only those four units are accepted. Anything else — `100/hour`, `100/minute`, `100/m` — is
the compile error `AXL388`, with the correct spelling in the suggestion.

> **Before 1.5.0 an unrecognised unit failed open.** It compiled clean and applied no limit
> at all, while `axl inspect` still printed the declared string — so the project looked
> rate-limited from every angle except the one that mattered. If you have a project written
> against an earlier version, recompile it: a build that now fails on `AXL388` was running
> that capability unlimited.

### How a quota is keyed

Every quota is anchored to the **source IP**, always. A session is an *additional, narrower*
bucket, never a replacement, and both are checked before either is incremented.

Keying a quota on the bearer token alone would be bypassable by rotating the `Authorization`
header, since AXL never validates it. A single `ip|session` composite key reads like
IP-anchoring but is equally rotatable — rotate the session half and you get a fresh bucket.

`X-Forwarded-For` is ignored unless `--trust-proxy` is set, for the same reason: behind no
proxy it is a client-supplied string, and honouring it would make every quota bypassable by
one header.

---

## Before exposing a server publicly

1. Run `axl inspect <url>` and read the **"reachable without a session"** count. Every
   `PUBLIC` action and resource is an unauthenticated proxy to your backend.
2. Confirm `AXL_DEMO_OTP` is unset.
3. If you use `ROLE` or `OWNER`, confirm the gateway in front **overwrites**
   `X-AXL-Subject` and `X-AXL-Roles` on every request.
4. Set `RATE_LIMIT` on every `PUBLIC` action and resource.
5. Review any `.flow` files produced by `axl adapt` line by line — see
   [Importing an existing API](adapt.md).

---

## Related

- [SECURITY.md](../SECURITY.md) — reporting a vulnerability, and what is out of scope
- [Wire protocol](protocol.md) — the headers and error codes involved
- [CLI reference](cli.md) — `axl serve` flags, `axl inspect`
