# Working in an AXL project with an AI agent

Guidance for AI coding agents — and the people directing them — building or
modifying a project that uses AXL. This is about *using* AXL. For contributing to
the compiler and runtime themselves, see [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## The mental model

AXL is a compiler. One declarative source emits two transports.

```
.flow files  →  axl compile  →  manifest.json  →  AXL runtime  →  your backend
                                                   ├── REST
                                                   ├── MCP
                                                   └── WebSocket (events only)
```

The runtime reads `manifest.json` and nothing else. It never sees a `.flow` file,
and the compiler never runs in production. Validation is therefore a build-time
guarantee, not a request-time check.

**AXL does not implement your backend.** It proxies to the address in `BASE_URL`.
Auth, payments, identity and persistence are backend concerns — a request to "add
login to AXL" is a request in the wrong place.

---

## Rules that matter most

### 1. Write the `.flow` files, not the manifest

`manifest.json` is build output. Editing it directly routes around the validator,
which is the entire point of the toolchain. It is also overwritten on the next
`axl compile`.

### 2. Never infer a permission

Every action and resource needs an explicit `PERMISSION`. A missing one is a
compile error (`AXL322` / `AXL329`) precisely so that nothing falls through to a
`PUBLIC` default by accident.

`PUBLIC` means an unauthenticated proxy to the backend. Use it only for
capabilities that genuinely need no session — typically browse, search, register
and login — and pair each one with a `RATE_LIMIT`.

### 3. Use the real syntax

The most common failure mode when generating `.flow` files is inventing syntax
that resembles other config languages. There is no `public: true`, no
`confirm: true`, and no `bind` block.

| Intent | Correct syntax |
|---|---|
| Unauthenticated | `PERMISSION search_hotels : PUBLIC` |
| Needs a session | `PERMISSION create_booking : AUTH` |
| Needs a role | `PERMISSION refund : ROLE staff` |
| Caller's own record | `PERMISSION update_profile : OWNER user_id` |
| OTP gate | `CONFIRM cancel_booking : OTP` |
| Rate limit | `RATE_LIMIT search_hotels : 60/min` |
| Bind a step argument | `STEP charge USING booking_id = create_booking.id` |

Rate-limit units are `sec`, `min`, `hr`, `day` — **only those four**. Any other
spelling compiles clean and applies no limit at all.

### 4. `OUTPUT` is mandatory

An action that returns nothing writes `OUTPUT Null` explicitly. Omitting the line
is an error (`AXL320`), not a shorthand.

### 5. Pick the right primitive

| Use | When |
|---|---|
| `ACTION` | The call mutates something |
| `RESOURCE` | The call only reads |

A `RESOURCE` takes no `INPUT`, is `GET` only, allows no `{placeholders}` in its
path, and cannot carry a `CONFIRM`. If a read needs arguments, it is an `ACTION`.

### 6. Write `DESC` on everything

An action's `DESC` and each input's trailing `DESC` become the MCP tool
description and parameter descriptions. That text is the **only** channel through
which a calling model learns what a capability does. A missing action `DESC` is a
warning (`AXL323`) because it degrades tool selection without making the action
wrong.

For destructive capabilities, add `IRREVERSIBLE true` and `EFFECTS "..."` so an
autonomous caller can decide to ask a human first.

---

## Working loop

```bash
axl init my-app        # scaffold — do not hand-roll the directory
cd my-app
# edit flow/*.flow
axl compile            # fails loudly with a code, file and line
axl inspect ./build    # read what you just exposed
axl serve              # loopback only by default
```

`axl inspect` prints a **"reachable without a session"** count. Check it after
every change. It is the honest summary of a project's exposure, and it is the one
number worth reading before any deploy.

`axl dev` watches and recompiles on change.

---

## Discovery, for a client connecting to an AXL server

1. `GET /.well-known/axl` — the AXL discovery document
2. `GET /manifest.json` — the full contract
3. Call actions over REST at `POST /actions/:name`, or connect MCP at `/mcp`

If neither transport answers, the connection has failed. **Do not fall back to
browser automation, HTML scraping or DOM inspection.** An application either
exposes AXL or it does not; scraping a UI to simulate an API defeats every
guarantee the manifest provides.

The WebSocket endpoint is **events only**. Its sole inbound message is `ping`,
answered with `pong`. Actions cannot be invoked over it.

---

## Security posture an agent must not "helpfully" relax

| Default | Why it is that way |
|---|---|
| Server binds loopback only | Exposure is an explicit operator decision (`--host`) |
| `ROLE` and `OWNER` deny everything without `--trust-identity-headers` | AXL never validates bearer tokens, so a header-based gate without an authenticating gateway in front is decoration — and worse than no gate, because it looks like one |
| OTP never appears in a response | `AXL_DEMO_OTP=1` exists for demos only |
| `axl adapt` marks every imported action `AUTH` | An OpenAPI spec carries no AXL permission semantics. `security: []` says nothing about whether an endpoint is safe to expose |

Generated output from `axl adapt` carries `REVIEW REQUIRED` markers. Those are not
noise to strip — they mark decisions a human still has to make.

---

## Things that will not be accepted

- Editing `manifest.json` instead of the `.flow` source
- Adding auth, payment or identity implementation to AXL itself
- Turning a `RESOURCE` into a zero-argument tool, or folding resources into
  `actions` with a flag — the separation is what makes the isolation guarantees
  free rather than checked
- Relaxing a `PARALLEL` restriction without reading why it exists
- Inferring `PUBLIC` or `CONFIRM` from an HTTP method. `DELETE /sessions` and
  `DELETE /accounts` are the same verb
