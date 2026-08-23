# CLI reference

Every command accepts `--help`. `axl <command> --help` prints the flags that command
actually accepts, which is the authoritative list — this page is a map, not a substitute.

---

## Core

| Command | Purpose |
|---|---|
| `axl init [dir]` | Scaffold a new project |
| `axl adapt openapi <spec>` | Import an OpenAPI 3.0/3.1 document as a `.flow` project |
| `axl validate` | Type-check and validate all `.flow` files |
| `axl compile` | Build `manifest.json` |
| `axl generate` | Run declared generators. Exits non-zero if any did not run |
| `axl build` | `compile` then `generate` |

## Development

| Command | Purpose |
|---|---|
| `axl serve` | Start the engine (REST, MCP, WebSocket) |
| `axl dev` | Watch mode, recompiling on change |
| `axl doctor` | Diagnose environment and project health |
| `axl doctor --conformance` | Project soundness self-checks |
| `axl info` | Print parsed project configuration |
| `axl inspect [target]` | Summarise what a manifest — or a running server — exposes |

## Utility

| Command | Purpose |
|---|---|
| `axl clean` | Remove `build/` and `generated/` |
| `axl format` | Auto-format `.flow` files |
| `axl lint` | Lint for warnings and best practices |
| `axl config` | View or edit `axl.config.json` |

## Global options

| Flag | Effect |
|---|---|
| `-h, --help` | Help for `axl` or a specific command |
| `-v, --version` | Print the current version |
| `--json` | Machine-readable output |
| `--quiet` | Suppress non-essential output |
| `--verbose` | Extra diagnostic logging |

---

## `axl serve`

```bash
axl serve [--port <n>] [--host <addr>] [--dir <path>] [--state-file <path>]
          [--trust-proxy] [--trust-identity-headers]
```

| Flag | Effect |
|---|---|
| `--port` | Listen port. Default `3939`. `0` picks a free one |
| `--host` | Bind address. Default is loopback only |
| `--dir` | Project directory. Default is the working directory |
| `--state-file` | Persist confirmations, paused workflows and idempotency across restarts |
| `--trust-proxy` | Honour `X-Forwarded-For` for rate-limit keying |
| `--trust-identity-headers` | Honour `X-AXL-Subject` / `X-AXL-Roles`. **Required for `ROLE` and `OWNER` to work at all** |

Both trust flags are assertions about your deployment, not conveniences. See
[Permissions and rate limiting](permissions.md#role-and-owner-need-a-trusted-gateway).

On start the banner prints every URL the server answers on, including the discovery
document a client should begin from:

```
  AXL Server
  ✔ Running (MCP + REST + WS)

  Health        http://localhost:3939/health
  Discovery     http://localhost:3939/.well-known/axl
  MCP Endpoint  http://localhost:3939/mcp
  REST API      http://localhost:3939/actions/:name
  WS API        ws://localhost:3939/ws
  Listening on  127.0.0.1:3939
```

---

## `axl inspect`

Takes a manifest path, a build directory, or the URL of a running server.

```bash
axl inspect                          # ./build/manifest.json
axl inspect ./build
axl inspect http://127.0.0.1:3939
```

```
  TaskDeck v1.0.0
  source        live server · http://127.0.0.1:3939
  axl_version   1.0
  base_url      http://localhost:4000/api

  6 action(s), 0 resource(s), 3 workflow(s)
  1 reachable without a session (PUBLIC)

  Actions
  ● list_projects       AUTH                  GET /projects
  ● create_project      AUTH                  POST /projects
  ● list_tasks          PUBLIC                GET /projects/{project_id}/tasks
                        limit 10/min
  ● create_task         AUTH                  POST /projects/{project_id}/tasks
  ● update_task_status  AUTH                  PATCH /tasks/{task_id}
  ● delete_task         AUTH                  DELETE /tasks/{task_id}
                        confirm

  Workflows
  ● ProjectCreation     1 step(s)
  ● TaskLifecycle       2 step(s)
  ● ProjectDeletion     1 step(s)
```

Pointing it at a **live server** answers a different question from pointing it at a local
manifest: what is actually serving right now, rather than what the last build produced.

The line that matters most is **"reachable without a session"**. Read it before every
deploy.

---

## `axl doctor`

```bash
axl doctor                # environment and project health
axl doctor --conformance  # project soundness self-checks
```

`--conformance` is a **self-check, not a certification**, and must not grow into one. Its
duplicate-diagnostic-code check is a warning by design: the heuristic has a high
false-positive rate, and a check that fails at that rate only teaches people to ignore it.

---

## Generators

`GENERATORS` in `app.flow` declares which artifacts `axl generate` should emit.

```flow
GENERATORS
  DIAGRAM
```

| ID | Status |
|---|---|
| `DIAGRAM` | Implemented |
| `AGENT`, `DOCS`, `SDK_TS`, `SDK_JAVA`, `SDK_PYTHON` | Reserved, not yet built (`AXL343`) |

Declaring a reserved-but-unbuilt generator is its own diagnostic, distinct from an unknown
name (`AXL340`). `axl generate` exits 1 if any declared generator did not run, so a build
that silently produced nothing is not mistaken for a successful one.

---

## Related

- [Installation](installation.md) — getting the `axl` binary
- [Quick start](quickstart.md) — the commands in sequence, with a real project
- [Importing an existing API](adapt.md) — `axl adapt` in detail
