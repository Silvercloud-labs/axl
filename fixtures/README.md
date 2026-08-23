# Test fixtures

Inputs owned by the test suite. Nothing here is documentation, and nothing here is
meant to be read as an example of good `.flow` style — see [`examples/`](../examples)
for that.

| Directory | Contents | Used by |
|---|---|---|
| `projects/taskdeck/` | The integration fixture. Compiled and served by the transport, permission and error-shape suites | `test/well-known`, `rest-adapter`, `rate-limit`, `session-expiry`, `problem-details`, `mcp-contract`, `resources` |
| `projects/{booking,hospital,massive,notes,social,storefront}/` | Compiler and CLI inputs of varying size and shape | Compiler tests, `scripts/benchmark.js` |
| `openapi/` | OpenAPI 3.0 and 3.1 documents | `test/adapt-openapi` |
| `backend/` | A real HTTP backend plus standalone verification scripts | Integration tests that need something behind `BASE_URL` |

---

## Why the fixture project is not an example

`projects/taskdeck/` and `examples/taskdeck/` started as the same project and will
drift, deliberately.

The fixture encodes assertions. Tests depend on its exact shape — that
`list_tasks` is rate-limited at `10/min`, that it declares no resources so
`capabilities.resources` can be checked as `false`, that `delete_task` is
confirm-gated. Changing it breaks tests, which is the point.

The example teaches. It should be free to grow a new action or a clearer comment
without anyone having to think about the suite.

Coupling the two would mean every documentation edit is a test change, and every
test requirement leaks into what newcomers read first.

## Why these are not inside `test/`

`test/` holds the suites. Fixtures are inputs to them, several are whole
multi-file projects, and `backend/` is a runnable server. Keeping them separate
means `test/` can be read as a list of what is verified rather than a mix of
assertions and material.

## Before this directory existed

These lived at the repository root as `test-projects/`, `test-fixtures/` and
`test-backend/`, and the root itself was an AXL project — a `flow/` directory and
an `axl.config.json` that seven integration suites compiled in place. That is why
the root had to be a project at all. It no longer is; the suites compile
`projects/taskdeck/` instead.
