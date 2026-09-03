# scl-axl

The AXL command-line interface — the `axl` binary.

AXL compiles a declarative `.flow` specification into a permission-aware server that
exposes the same capabilities over REST and MCP, proxied to your existing backend.

| | |
|---|---|
| Repository and full documentation | https://github.com/Silvercloud-labs/axl |
| Language specification | [SPECIFICATION.md](https://github.com/Silvercloud-labs/axl/blob/main/SPECIFICATION.md) |
| Guides | [docs/](https://github.com/Silvercloud-labs/axl/tree/main/docs) |
| FAQ | [FAQ.md](https://github.com/Silvercloud-labs/axl/blob/main/FAQ.md) |

## Install

```bash
npm install -g scl-axl
```

Requires Node.js 20.19.0 or later.

## Quick start

```bash
mkdir my-app && cd my-app
axl init -y
axl compile
axl serve
```

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

The server binds **loopback only** by default, on both `127.0.0.1` and `::1`. Use `--host`
to widen it deliberately.

## Commands

### Core

| Command | Purpose |
|---|---|
| `axl init [dir]` | Scaffold a new project |
| `axl adapt openapi <spec>` | Import an OpenAPI 3.0/3.1 document as a `.flow` project |
| `axl validate` | Type-check and validate all `.flow` files |
| `axl compile` | Build `manifest.json` |
| `axl generate` | Run declared generators |
| `axl build` | `compile` then `generate` |

### Development

| Command | Purpose |
|---|---|
| `axl serve` | Start the engine — REST, MCP and WebSocket together |
| `axl dev` | Watch mode, recompiling on change |
| `axl doctor` | Diagnose environment and project health |
| `axl doctor --conformance` | Project soundness self-checks |
| `axl info` | Print parsed project configuration |
| `axl inspect [target]` | Summarise what a manifest, or a running server, exposes |

### Utility

| Command | Purpose |
|---|---|
| `axl clean` | Remove `build/` and `generated/` |
| `axl format` | Auto-format `.flow` files |
| `axl lint` | Lint for warnings and best practices |
| `axl config` | View or edit `axl.config.json` |

Run `axl <command> --help` for command-specific options.

## Generators

`GENERATORS` in `app.flow` declares what `axl generate` should emit.

| ID | Status |
|---|---|
| `DIAGRAM` | Implemented |
| `AGENT`, `DOCS`, `SDK_TS`, `SDK_JAVA`, `SDK_PYTHON` | Reserved, not yet built |

Declaring a reserved-but-unbuilt generator is a compile error (`AXL343`), and
`axl generate` exits non-zero if any declared generator did not run.

## Check what you exposed

```bash
axl inspect ./build
```

Prints every action and resource with its permission level, confirm gate,
`IRREVERSIBLE` flag and rate limit — plus a count of what is **reachable without a
session**. Read that number before every deploy: each `PUBLIC` capability is an
unauthenticated proxy to your backend.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
