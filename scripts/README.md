# Scripts

Maintenance and verification scripts. Only some are wired into `package.json`, so
this file exists to make the rest discoverable — previously the only way to find
them was to list the directory.

| Script | Run with | Purpose |
|---|---|---|
| `compile-examples.js` | `npm run examples:compile` | Compiles every project under `examples/`. Also runs in CI |
| `test-packaging.js` | `npm run test:packaging` | Packs the CLI and verifies a fresh global install scaffolds and compiles |
| `benchmark.js` | `node scripts/benchmark.js` | Times the compiler against `fixtures/projects/massive` |
| `manual-mcp-check.js` | `node scripts/manual-mcp-check.js` | Drives a running server with a real MCP client |
| `manual-workflow-check.js` | `AXL_DEMO_OTP=1 node scripts/manual-workflow-check.js` | Walks a confirm-gated workflow end to end |
| `manual-notes-check.js` | `AXL_DEMO_OTP=1 node scripts/manual-notes-check.js` | Exercises the notes fixture over REST |

---

## The `AXL_DEMO_OTP=1` requirement

`manual-workflow-check.js` and `manual-notes-check.js` read the OTP out of the API
response. That value is **not** returned by default, and correctly so — it exists
in a response only under `AXL_DEMO_OTP=1`.

These are standalone HTTP scripts with no access to the engine's state store, so
unlike the unit tests they genuinely need the flag. Run without it, they complete
but verify nothing.

Never set `AXL_DEMO_OTP` on a server anyone else can reach.

## Adding a script

If it is worth keeping, add a row above. A script nobody can find is a script
nobody runs.
