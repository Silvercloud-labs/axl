# @silvercloudlabs/generators

The AXL generator registry.

`axl generate` reads the `GENERATORS` block in `app.flow` and runs the matching
generators against the compiled manifest. Generators produce artifacts; they do not
affect runtime behaviour.

Part of the [AXL monorepo](https://github.com/Silvercloud-labs/axl).

## Implemented

| ID | Output |
|---|---|
| `DIAGRAM` | A visual representation of the project's actions and workflows |

## Reserved, not yet built

`AGENT`, `DOCS`, `SDK_TS`, `SDK_JAVA`, `SDK_PYTHON`.

Declaring one of these is a compile error (`AXL343`) rather than a silent no-op, and
it is distinct from an unknown generator name (`AXL340`). A build that claims to have
generated an SDK it did not produce is worse than one that refuses.

The set of implemented generators is asserted against this registry in
`packages/compiler/__tests__/validator.test.ts`, so the two cannot drift.

## Adding a generator

1. Implement it in `src/` and register it in `src/index.ts`.
2. Add its ID to `IMPLEMENTED_GENERATORS` in `packages/compiler/types.ts`.
3. Add a `CHANGELOG.md` entry.

The registry test fails if steps 1 and 2 disagree.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
