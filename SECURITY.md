# Security Policy

AXL sits between untrusted clients and a production backend. A defect in its permission
engine, confirmation gates or rate limiter is a defect in the security posture of every
application built on it. Reports are taken seriously and handled accordingly.

---

## Supported versions

| Version | Supported |
|---|---|
| 1.7.x | Yes |
| 1.0.x – 1.6.x | Security fixes only, until 2.0 |
| < 1.0.0 | No |

**1.4.x and earlier accept `RATE_LIMIT` units the engine cannot enforce**, applying no
limit at all rather than failing. Upgrade and recompile — see `AXL388` in the changelog.

**1.6.x and earlier discard every non-path argument on a `DELETE` action.** The argument was
validated, the call returned `200`, and the backend never received it — so a `DELETE` whose
behaviour depended on an argument silently did the wrong thing. See `1.7.0` in the changelog.

AXL versions in lockstep across all packages, so a supported version number applies
identically to `scl-axl`, `@silvercloudlabs/compiler`, `@silvercloudlabs/runtime`, `@silvercloudlabs/generators` and `axl-flow`.

---

## Reporting a vulnerability

**Do not open a public issue, pull request or discussion for a security defect.**

Use GitHub's private vulnerability reporting:

**https://github.com/Silvercloud-labs/axl/security/advisories/new**

This creates a confidential advisory visible only to the maintainers. If you cannot use
GitHub Security Advisories, open a public issue containing **no technical detail** — just a
request for a private channel — and one will be provided.

### What to include

| Field | Detail |
|---|---|
| Affected version | Output of `axl --version` |
| Component | Compiler, engine, REST adapter, MCP adapter, WebSocket adapter, or CLI |
| Impact | What an attacker gains — data disclosure, privilege escalation, bypass, denial of service |
| Reproduction | The smallest `.flow` project and request sequence that demonstrates it |
| Observed behaviour | Real output: status codes, response bodies, logs |
| Configuration | Any non-default flags — `--host`, `--trust-proxy`, `--trust-identity-headers`, `AXL_*` environment variables |

A working reproduction is far more valuable than a description of one.

### Response process

| Stage | Target |
|---|---|
| Acknowledgement of receipt | 72 hours |
| Initial assessment and severity | 7 days |
| Fix or documented mitigation | Depends on severity; you will receive progress updates |
| Public advisory | Published once a fix is available, coordinated with you |

Reporters are credited in the advisory unless they ask not to be.

---

## Scope

### In scope

Anything that breaks a guarantee AXL claims to make:

- Bypassing a `PERMISSION` level — reaching an `AUTH`, `ROLE` or `OWNER` action without satisfying it
- Defeating a `CONFIRM` OTP gate, or executing a confirm-gated action as another user
- Evading `RATE_LIMIT`, including by rotating a credential or header
- Reading another session's events over the WebSocket transport
- Idempotency cache collisions that leak one caller's result to another
- Origin validation bypass on `/mcp` or the `/ws` upgrade
- Server-Side Request Forgery through path or argument construction
- Discovery documents reflecting an unvalidated `Host` header
- Compiler or manifest loading crashes, hangs, or denial of service on malformed input
- Sensitive data — tokens, OTPs, internal addresses — appearing in responses or logs

### Out of scope

These are properties of the design, documented as such. They are not vulnerabilities.

| Behaviour | Why it is not a defect |
|---|---|
| AXL does not validate bearer tokens | Authentication is the backend's job. AXL forwards the credential and never inspects it. |
| `X-AXL-Subject` / `X-AXL-Roles` are trusted under `--trust-identity-headers` | The flag is the operator asserting an authenticating gateway sits in front and overwrites both headers. Without it, `ROLE` and `OWNER` deny everything. |
| `X-Forwarded-For` is trusted under `--trust-proxy` | Same posture, same reasoning. |
| A missing `Origin` header is accepted by default | Browsers always send one; rejecting an absent origin adds no rebinding protection while breaking every non-browser client. `AXL_MCP_STRICT_ORIGIN=1` enforces the stricter reading. |
| The OTP appears in an API response under `AXL_DEMO_OTP=1` | That flag exists for demonstration and is off by default. |
| `OWNER <input>` does not prove record ownership | It asserts the caller's subject equals the named *argument*. Proving ownership of the underlying record requires a backend lookup, which is a backend concern. This limit is documented. |
| A failed `PARALLEL` block leaves sibling side effects committed | AXL has no compensation mechanism. The thrown error names what committed. |
| `GET /manifest.json` is public | It is a discovery contract, served deliberately. |
| Vulnerabilities in your own backend | AXL proxies to it; it does not defend it. |

If you believe one of these boundaries is drawn wrongly, that is a worthwhile **design
discussion** — open a public issue for it rather than an advisory.

---

## Deployment guidance

Defaults are chosen to fail closed. Widening them is an explicit operator decision.

| Setting | Default | Widen with |
|---|---|---|
| Bind address | Loopback only, `127.0.0.1` and `::1` | `--host` |
| Origin validation | Loopback passes; others get `403 FORBIDDEN_ORIGIN` | `AXL_ALLOWED_ORIGINS` |
| Missing `Origin` | Allowed | `AXL_MCP_STRICT_ORIGIN=1` to reject |
| Identity headers | Ignored; `ROLE` and `OWNER` deny everything | `--trust-identity-headers` |
| `X-Forwarded-For` | Ignored | `--trust-proxy` |
| OTP in responses | Never | `AXL_DEMO_OTP=1` (demonstration only) |
| Public base URL in discovery | Derived from the validated bound address | `AXL_PUBLIC_URL`, `AXL_ALLOWED_HOSTS` |

### Before exposing a server publicly

1. Run `axl inspect <url>` and read the **"reachable without a session"** count. Every
   `PUBLIC` action and resource is an unauthenticated proxy to your backend.
2. Confirm `AXL_DEMO_OTP` is unset.
3. If you use `ROLE` or `OWNER`, confirm the gateway in front **overwrites** `X-AXL-Subject`
   and `X-AXL-Roles` on every request rather than passing client values through.
4. Set `RATE_LIMIT` on every `PUBLIC` action and resource. Units are `sec`, `min`, `hr`
   and `day`; anything else is rejected at compile time as `AXL388`. Before 1.5.0 an
   unrecognised unit compiled clean and applied no limit at all, so recompile any project
   written against an earlier version.
5. Review any `.flow` files produced by `axl adapt` line by line. Imported permissions are
   defaulted to `AUTH` and marked `REVIEW REQUIRED`; they are a starting point, not a
   verdict.

---

## Disclosure

Coordinated disclosure. Please give a reasonable window for a fix before publishing.
Advisories are published through GitHub Security Advisories once a fix is available.
