# @axl/runtime

The AXL execution engine and its transport adapters.

Reads a compiled `manifest.json` and serves it — enforcing permissions, confirmation
gates, rate limits and idempotency — while proxying every call to the backend at
`BASE_URL`.

Part of the [AXL monorepo](https://github.com/Silvercloud-labs/axl). Not published
standalone; `scl-axl` is the entry point.

## Contents

| File | Responsibility |
|---|---|
| `engine.js` | Permission checks, confirm gates, rate limits, idempotency, workflow execution |
| `axl-server.js` | MCP server construction — tools from actions, resources from resources |
| `rest-adapter.js` | REST routes and RFC 7807 problem responses |
| `backend-adapter.js` | Outbound calls to `BASE_URL`, including timeout cancellation |
| `transport-manager.js` | WebSocket connections and identity-scoped event fan-out |
| `state.js` | In-memory and file-backed state stores |
| `manifest.js` | Manifest loading and validation |
| `schema-utils.js` | Type coercion and JSON Schema construction |

## This is hand-written source

Plain ESM JavaScript with no build step. Nothing compiles into this directory — the
CLI and the test suite import these files directly. Edit them freely.

It lived at the repository root as `/src` until the open-source restructure, where a
directory named `src` beside four TypeScript packages read like generated output.

## Security posture

Defaults fail closed, and widening them is an explicit operator decision. `ROLE` and
`OWNER` deny every request unless the server runs with `--trust-identity-headers`,
because AXL never validates the bearer token — a header gate without an
authenticating gateway in front is decoration.

See [SECURITY.md](https://github.com/Silvercloud-labs/axl/blob/main/SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
