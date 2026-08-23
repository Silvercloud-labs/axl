# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] — 2026-08-17

Findings from a pre-release audit of the whole repository. Each one below was reproduced
before it was fixed.

### Fixed — correctness

- **A `DELETE` action silently discarded every non-path argument.** `executeHttpCall`
  excluded `DELETE` from the JSON body *and* restricted query encoding to `GET`, so any
  argument not consumed as a path parameter went nowhere. Verified against an echo backend:

  ```
  ACTION remove_item … INPUT item_id, reason : String REQUIRED
                       ENDPOINT DELETE /items/{item_id}

  AXL returned      200 {"ok":true}
  backend received  DELETE /items/i_1   (no body, no query)
  ```

  The argument was declared `REQUIRED`, validated, and thrown away, and the caller got a
  success. `DELETE` now carries its remaining arguments as a query string, like `GET`.
  Query rather than body because RFC 9110 gives a `DELETE` body no defined semantics and
  proxies may drop it, so a body would have been the less reliable repair.

- **`AXL389`: a `{placeholder}` in an `ACTION` endpoint path must name one of its inputs.**
  `AXL328` already caught this on a `RESOURCE`. On an `ACTION` the same mistake — a renamed
  input, a typo — compiled clean and then failed every single call:

  ```
  POST /actions/delete_task  →  500 {"type":"INTERNAL_ERROR","detail":"Internal error."}
  ```

  with nothing in the server log, because `buildUrl` threw a bare `Error` that
  `safeErrorMessage` does not recognise as user-facing. Two fixes: the compiler now rejects
  the unfillable-by-construction case with a suggestion, and `buildUrl` throws a
  `ValidationError` so the remaining reachable case is a `400` with a real message instead
  of an opaque `500`.

- `TimeoutError` was missing from `safeErrorMessage`'s list. `rest-adapter.js` catches it
  earlier, so the omission was unreachable rather than harmless — one reordered `catch` and
  a legitimate "Backend did not respond within 2000ms" would have been redacted.

### Fixed — publishability

- **`@axl/runtime` was unpublishable: it declared no `dependencies` at all** while its
  shipped `.js` files import `express`, `zod` and `@modelcontextprotocol/sdk`. It worked
  in-repo only because the root manifest declares them and npm workspaces hoists to the
  root `node_modules`; there is no root to hoist from on a user's machine. Packed and
  installed into an empty project, **5 of 8 entry points failed**:

  ```
  engine.js             FAILED: Cannot find package 'zod'
  axl-server.js         FAILED: Cannot find package '@modelcontextprotocol/sdk'
  schema-utils.js       FAILED: Cannot find package 'zod'
  backend-adapter.js    FAILED: Cannot find package 'zod'
  rest-adapter.js       FAILED: Cannot find package 'express'
  ```

  All eight now import clean from the real tarball, verified the same way.

- **`@axl/compiler` shipped its own test suite to npm.** `files: ["dist"]` swept in
  `dist/__tests__/` — 10 of 30 files, 26.3 kB. Now 20 files, no tests.

- `@axl/compiler` and `@axl/generators` had no `repository`, `bugs` or `author`, so both
  would have rendered on npm with no link back to the source.

- The author string was `"Silver Cloud Labs"` in two manifests against `Silvercloud Labs`
  in all six `NOTICE` files, the `LICENSE` and the README; the root manifest's was empty.

- `test/publishable.test.ts` now checks that every bare import a package makes is declared,
  that no package ships tests, that `LICENSE` and `NOTICE` are listed, and that one author
  name matches `NOTICE`.

### Fixed — CLI

- **The CLI printed the wrong product name.** `axl --help` and the `axl init` banner both
  said `AI Experience Layer`; every `NOTICE`, the `LICENSE`, the README and `OVERVIEW.md`
  say **AI Execution Layer**. One exported `TAGLINE` now, in `ui.ts`.

- **`axl init` reported version `0.2.0` when run from source.** `index.ts` grew a
  two-candidate resolver when `axl --version` had this bug, and its comment describes it —
  but `ui.ts`'s `brand()` kept its own copy with the hardcoded `0.2.0` fallback. So
  `npm run axl -- init`, a documented script, printed `axl v0.2.0` while the built binary
  printed the real version. One exported `resolveVersion()` now, used by both.

- **`axl init` generated an agent guide listing 15 of the language's 49 keywords** — missing
  `RESOURCE`, `EVENT`, `PARALLEL`, `SWITCH`, `CASE`, `DEFAULT`, `RETRY`, `TIMEOUT`, `WAIT`,
  `IRREVERSIBLE`, `EFFECTS`, `SIDE_EFFECTS`, `ROLE` and `OWNER`, i.e. everything added
  between 1.1.0 and 1.5.0. An agent that does not know `RESOURCE` exists writes an `ACTION`
  for every read. The list is now derived from the compiler's `KEYWORDS` at generation time,
  and the guide gained sections on `ACTION` vs `RESOURCE`, permission levels, rate-limit
  units, consequence metadata and the `PARALLEL` restrictions. It also described AXL as
  compiling "to an MCP server", contradicting the two-transport model everywhere else.

### Added

- **The shipped runtime is now type-checked.** `packages/runtime` is plain ESM JavaScript
  with no build step, so it was absent from `tsconfig.json`'s project references — meaning
  the code that actually serves every request was checked by nothing. `tsconfig.runtime.json`
  runs `checkJs` over it and `npm run build` gates on it.

  It found ten errors and **no live defect**, which is worth stating plainly rather than
  dressing up. The substantive two: `z.record(z.any())` is a Zod 3 signature that Zod 4
  tolerates at runtime (verified — identical parse behaviour and identical emitted JSON
  Schema), and `settled[i].value` was read off a `PromiseSettledResult` union without
  narrowing, which is correct only because the preceding branch throws. Both are now
  explicit.

- CI gained a `permissions: contents: read` block — without one a job inherits the
  repository default token scope — and an `npm audit --audit-level=high` job.

- **Publish configuration, found while preparing the first npm release.** Three defects,
  each of which would have broken or corrupted that release:

  | | |
  |---|---|
  | `@axl/compiler`, `@axl/runtime`, `@axl/generators` had no `publishConfig.access` | A scoped package defaults to **restricted**. The first `npm publish` fails with "You must sign up for private packages" — on packages that were always meant to be public |
  | `axl-flow` was publishable to npm | The VS Code extension belongs on the Marketplace. `npm publish --workspaces` would have pushed it to the registry, where it does nothing. Now `private: true`; `vsce package` is unaffected, verified |
  | `repository.url` and `bin.axl` were auto-corrected by npm on every publish | The published manifest would not have matched the repository |

- **`tsc --build` will silently skip a package whose `dist/` was deleted but whose
  `tsconfig.tsbuildinfo` was not.** Reproduced: `packages/generators` "built successfully"
  with no `dist/index.js` at all, and `npm pack` happily produced a tarball whose `main`
  pointed at a file that was not in it — an install that succeeds and fails on first import.
  `test/publishable.test.ts` now checks every path a manifest names in `main`, `types`,
  `exports` and `bin` against the actual packed file list.

### Changed

- `npm audit` reported one high-severity advisory (`nanoid <3.3.18`, transitive).
  Now zero.
- Fixture and example `BASE_URL`s moved off real registered domains
  (`api.booking.com`, `api.social.com`, `api.massive.com`, `api.healthsync.com`,
  `bananazon.com`) to RFC 2606 `.example` names. None was ever called.
- `.gitignore` covers `.DS_Store`, `._*`, `Thumbs.db` and `desktop.ini`. None was tracked;
  this keeps it that way.
- The stray `## [Unreleased]` section sitting *below* `## [1.0.0]` is now a clearly labelled
  pre-1.0 development log. It recorded the transport flags as both added and removed, had
  two `### Changed` headings, and named paths that no longer exist.

## [1.6.0] — 2026-08-17

### Fixed

- **Four of the seven `.flow` input type forms were validated as strings.**
  `buildZodShape` handled `number` and `boolean` and sent everything else to `z.string()`.
  The language accepts five primitives, `List<T>` and any declared `ENTITY`, so
  `Float`, `Null`, `List<T>` and every entity-typed input were type-checked as text.

  **`Float` failed in both directions at once.** An action declaring
  `min_rating : Float REQUIRED` advertised `{"type":"string"}` in its MCP tool schema, so a
  model sent `"4.5"` — and a caller who read the `.flow` file and sent `4.5` got back:

  ```
  VALIDATION_ERROR  expected string, received number  (path: min_rating)
  ```

  The declared type was the one value the parameter would not accept. Verified against a
  running server before and after.

  | Type form | Before | Now |
  |---|---|---|
  | `String` | string | string |
  | `Number` | number | number |
  | `Float` | **string** | number |
  | `Boolean` | boolean | boolean |
  | `Null` | **string** | null |
  | `List<T>` | **string** | array, element type checked recursively |
  | `ENTITY` | **string** | object, declared fields type-checked |

  `Number` and `Float` both accept any JSON number. JSON has one numeric type; the two
  names differ in what they document to a reader, not in what the wire can carry, so
  rejecting `4.5` from a `Number` would reject valid JSON.

  Entity fields are checked as **optional**, because the manifest carries no
  `REQUIRED`/`OPTIONAL` marker per entity field and requiring all of them would reject
  payloads the specification never called invalid.

  An unknown type name still degrades to a string rather than throwing, so a hand-assembled
  manifest stays loadable — the compiler is what rejects unknown types (`AXL310`).

  This is a **minor** bump rather than a major one on the same reasoning as `AXL388` in
  1.5.0: no correctly-functioning project can have depended on `Float` meaning string,
  because a caller sending the type the spec declared was rejected. Nothing has been
  published, so no user can be broken in practice.

  `test/input-types.test.ts` covers all seven type forms, both directions, and asserts that
  every entry in the compiler's `PRIMITIVE_TYPES` is genuinely mapped rather than landing in
  the string fallback the way `Float` and `Null` did.

- **A correctly-configured server reported itself as misconfigured.** `identity` being
  absent has two causes an operator fixes in different places — the flag is off, or the flag
  is on and the gateway sent no claim — and the engine could not tell them apart, so it
  always blamed the flag:

  ```
  # server started WITH --trust-identity-headers, request carried no identity header
  403 PERMISSION_DENIED
  "…the server is not configured to accept one. Start the server with
   --trust-identity-headers…"
  ```

  The context now carries `identityTrusted`, and the two cases report differently: a
  disabled channel still names the flag, while an enabled channel with no claim names the
  gateway. Denial is unchanged in both cases — only the diagnostic moved. A context
  assembled by hand rather than by `axl serve` carries no `identityTrusted` and keeps the
  stricter message.

  The reason `identityTrusted` did not reach the engine at first is the more interesting
  half: both transports built the engine context by **hand-copying a fixed field list**, so
  a new context field silently arrived as `undefined` unless it was added in three separate
  places. Both now spread one `currentContext()` helper.

- **The WebSocket event sanitiser was a denylist.** It did `delete context.sessionCookie`
  and forwarded whatever else the context held, so every field ever added to the request
  context shipped to every subscribed socket until somebody remembered to exclude it.
  Verified against a running server on the previous commit: a caller's `Idempotency-Key`
  was broadcast verbatim.

  ```
  action.started -> {"idempotencyKey":"idem-secret-42","ip":"127.0.0.1","requestId":"…"}
  ```

  It is now an allowlist of `ip` and `requestId`, so the next context field is opt-in rather
  than opt-out. This matches the shape of the broadcast filter directly above it, which was
  already rewritten to fail closed for the same reason.

### Added

- `OVERVIEW.md` — a single long-form document covering what AXL is, how the compiler and
  runtime work, the full lifecycle of a request, and how a human client, an AI agent and an
  operator each interact with a running server. Every command output, manifest excerpt and
  MCP payload in it was captured from a real run.

## [1.5.0] — 2026-08-09

### Changed — documentation structure

- **The README was a 920-line reference manual.** It contained the language tour, the
  workflow semantics, the whole HTTP and MCP surface, the events table, the security model,
  the error model, the CLI reference and the OpenAPI adapter guide — so the thing a reader
  meets first was a specification, and the pitch was buried inside it. Those chapters are
  now guides under `docs/`, each linked from a short README:

  | New | From |
  |---|---|
  | `docs/language.md` | README "The .flow language" |
  | `docs/workflows.md` | README "Workflows and control flow" |
  | `docs/permissions.md` | README "Security model" |
  | `docs/architecture.md` | README "Architecture" |
  | `docs/cli.md` | README "CLI reference" |
  | `docs/adapt.md` | README "Importing an existing API" |
  | `docs/protocol.md` | rewritten, absorbing README "HTTP surface", "MCP surface", "Events" and "Error model" |

  No content was dropped. `assets/` holds the README's images.

- **`docs/protocol.md` disagreed with the implementation in four places**, which matters
  more than layout because it is the document a client implementer works from:

  | Claim | Reality |
  |---|---|
  | Errors are `{ "error": ..., "details": ... }` | RFC 7807 `application/problem+json` with `type`/`title`/`status`/`detail`/`instance` |
  | `401 Unauthorized` for a missing session | `403 PERMISSION_DENIED`. AXL issues no challenge, so there is no 401 anywhere |
  | "Resources and Prompts are disabled" over MCP | Resources are served — `resources/list`, `resources/read`, `axl://resource/<name>` — and `capabilities.resources` is derived from the manifest |
  | Discovery payload had no `ws` field | It has one, and the WebSocket transport is mounted unconditionally |

  It also documented a "Thunderstrike Standard" connection sequence, naming a specific
  external client as the normative reference in a public protocol document.

- `FAQ.md` added, answering the questions that actually gate adoption: whether AXL is open
  source or merely free, why Apache 2.0 rather than MIT or GPL, whether it is
  production-ready (it is not — nothing has been published yet), and what it deliberately
  does not do.

### Fixed — documentation accuracy

- **`axl serve` never printed the discovery URL.** `/.well-known/axl` is the URL a client is
  supposed to start from, and it was the one URL missing from the startup banner — while the
  README showed a `Discovery` line the server did not actually emit. The banner now prints
  it, so the documented way to connect a client is the way a developer can see.

- **`axl inspect` printed a line containing one em-dash under every action without a confirm
  gate, an `IRREVERSIBLE` marker or a rate limit** — most actions on a typical project,
  doubling the height of the list to convey nothing. The README quietly showed the output
  with those lines removed, so the documented output was not obtainable. The line is now
  omitted when there is nothing to put on it.

- `test/docs-links.test.ts` resolves every relative link and image in every markdown file in
  the repository, and checks that each `#fragment` matches a real heading in its target.
  It caught two dangling anchors on its first run, including one in a README badge — badge
  links are `[![alt](img)](target)`, and the inner `]` hides the outer target from a naive
  link pattern, so the most prominent links in the repository had never been checked.

### Changed — licence

- **Relicensed from MIT to Apache License 2.0.** Both are permissive, OSI-approved and
  free for any use including commercial; Apache 2.0 adds two things that matter for a
  language and compiler specifically. It grants patent rights explicitly, which protects
  contributors and adopters alike, and it protects the "AXL" name — neither of which MIT
  covers. `LICENSE` is the canonical text from apache.org with only the appendix
  placeholder filled in; `NOTICE` is added alongside it, and both ship inside every
  publishable package.

### Security

- **`axl serve --trust-identity-headers` was rejected as an unknown option**, for the
  whole life of the flag. The serve handler read it, but it was missing from the
  per-command allowlist, so the CLI exited before reaching that code.

  This was not cosmetic. `ROLE` and `OWNER` deny every request unless the flag is set,
  and the flag could not be set — so two of the language's four permission levels were
  unusable, including in the `hotel-booking` example. Nothing failed loudly; the flag
  simply looked like a typo.

  Verified after the fix against the example: `refund_booking` (`ROLE staff`) returns
  403 with no identity header, and reaches its confirmation gate with
  `X-AXL-Roles: staff`. `packages/cli/test/flags.test.ts` now asserts every flag the CLI
  reads is either allowlisted or deliberately rejected, which is the exact shape this bug
  had.

- **`RATE_LIMIT` no longer fails open.** The engine enforces only `<count>/<unit>` with
  `unit` in `sec|min|hr|day`, and returned without applying any limit when a declared
  value did not match. So `RATE_LIMIT search : 100/hour` compiled without a diagnostic,
  `axl inspect` printed `limit 100/hour`, and the capability ran completely unlimited.
  On a `PUBLIC` action — an unauthenticated proxy to the developer's backend — the whole
  protection was silently absent, and nothing anywhere reported it.

  A malformed value is now the compile error **`AXL388`**, with the accepted spelling in
  the suggestion (`100/hour` → `Use "100/hr"`). Common aliases are mapped: `second(s)`,
  `minute(s)`, `hour(s)`, `days`, and the single letters `s`, `m`, `h`, `d`.

  The compiler and the runtime share one pattern, `RATE_LIMIT_PATTERN` in
  `packages/compiler/types.ts`, and a test asserts it matches the expression in
  `packages/runtime/engine.js`. A looser pattern in the compiler would pass a value the
  runtime then ignores, reopening exactly this hole.

  Reproduced before the fix with a control: `3/min` returned 429 from the fourth
  request; `3/hour` allowed all eight. 22 regression cases cover accepted units,
  suggested aliases, malformed values and compiler/runtime agreement.

**Minor, not major — a judgement call, stated rather than made silently.** A project
declaring `100/hour` compiled before and now does not, which the versioning policy would
normally read as breaking. It is classified minor because the behaviour that "worked"
was a no-op that misrepresented itself: no correctly-functioning project changes, and
every project this breaks was already running with no rate limit at all. Failing the
build is how its author finds out. No version of AXL has been published, so no user can
be broken in practice.

### Fixed

- **`.vscode/settings.json` bound `*.flow` to a language id that does not exist.** The
  workspace pinned `"files.associations": { "*.flow": "axl" }` while the extension
  contributes the id `flow`. A `files.associations` entry overrides an extension's own
  file-extension mapping, so inside this repository every `.flow` file was assigned to
  `axl` — no grammar, no file icon, no hovers, no diagnostics, no snippets. It presented
  as a broken highlighter, and no amount of grammar work would have fixed it. The
  association is removed: the extension already claims `.flow` on its own.
  `packages/vscode/test/contributions.test.ts` now ties the manifest, the grammar, the
  snippets, the activation event and the workspace settings to a single language id.

- **The `.flow` grammar was 20 keywords behind the language.** `RESOURCE`, `EVENT`,
  `IRREVERSIBLE`, `EFFECTS`, `SIDE_EFFECTS`, `ROLE`, `OWNER` and the entire control-flow
  surface — `IF`, `ELSE`, `SWITCH`, `CASE`, `DEFAULT`, `PARALLEL`, `USING`, `RETRY`,
  `TIMEOUT`, `WAIT` — rendered as plain text, so close to half of a `.flow` file was
  uncoloured. Nothing connected the grammar to the compiler, so nothing caught the drift.
  `packages/vscode/test/grammar.test.ts` now asserts every entry in the compiler's
  `KEYWORDS` set is matched by some grammar pattern.

- **Declarations were indistinguishable from references.** Every identifier fell through
  to one `variable.other` rule, which is why `.flow` looked flat beside a mainstream
  language. Declaration names now carry `entity.name.function` / `entity.name.type` /
  `entity.name.namespace`, input fields carry `variable.parameter`, `{placeholders}` in
  an `ENDPOINT` path are scoped apart from the path, `step.field` bindings scope the step
  and the property separately, and rate-limit units highlight only for `sec|min|hr|day`.
  Verified by tokenising the examples with the real VS Code TextMate engine.

- **`icons/flow.svg` was a 516 KB base64 bitmap in an SVG wrapper** — the AXL mark
  exported from a design tool as a PNG injected through an SVG `<pattern>`, with no
  vector geometry in it at all. It rendered as a downscaled bitmap at the 16x16 the file
  tree actually draws, and it renders as an empty box in any SVG renderer that does not
  resolve `<use>` inside `<pattern>`. The mark has been traced to real paths: **2.6 KB**
  of `<path>` data, sharp at every size.

- **`icons/marketplace-icon.png` was a JPEG renamed to `.png`**, 1024x1024 and 342 KB.
  The Marketplace requires a real PNG. Replaced with a genuine 256x256 PNG rendered from
  the vector mark: **7 KB**. The packaged extension drops from roughly 900 KB to 43 KB.

- **The packaged extension shipped a second copy of its own source.** `.vscodeignore`
  excluded `dist/test/**` but not `dist/src/**`, so the `.vsix` carried the unbundled
  `tsc` output and its declaration files alongside the `esbuild` bundle that `main`
  actually points at.

- `.vscode/extensions.json` recommends `axl.axl-flow`, so opening the repository in VS
  Code offers the extension instead of leaving `.flow` files uncoloured until the reader
  works out that an extension exists.

- `.gitattributes` normalises line endings. Without it a Windows checkout produces CRLF
  files, and `axl format` plus the tests that compare compiler output against expected
  text both fail in ways that look like formatter bugs.

- `packages/vscode/test/icons.test.ts` reads the bytes of both icons — magic number, PNG
  dimensions, absence of embedded rasters — and checks that every icon the manifest
  declares exists. Neither original failure was visible from the file name.

- `packages/vscode/README.md` claimed VS Code 1.85.0+ while `engines.vscode` said
  `^1.75.0`.

### Added

- `engines.node: ">=20.19.0"` on all six manifests. Without it, npm installed silently
  on Node 18 and failed later with unrelated-looking runtime errors.
- `LICENSE` in every publishable package. npm always ships `README.md` but **not**
  `LICENSE`, so `scl-axl`, `@axl/compiler`, `@axl/runtime` and `@axl/generators` would
  each have published MIT-licensed code with no licence text in the tarball.

### Changed

- Published tarballs exclude source maps and `tsconfig.tsbuildinfo`. `scl-axl` drops
  from 83 files to 43.

## [Unreleased — folded into 1.5.0]

Repository restructure for the open-source release. **No runtime, compiler or adapter
behaviour changes**, so no version bump — every change below is layout, tooling or
documentation.

### Changed

- **`/src` is now `packages/runtime`, published internally as `@axl/runtime`.** It was
  never build output: nothing emitted to it, and `packages/cli/serve.ts` plus 18 test
  files imported it directly as source. A directory named `src` sitting beside four
  TypeScript packages read like generated code, and the contributor notes wrongly
  described it as compiled — which discouraged editing the actual engine. It is now the
  sixth workspace and versions in lockstep with the rest; `test/versions.test.ts` covers
  it.
- **`test-projects/`, `test-fixtures/` and `test-backend/` are consolidated under
  `fixtures/`** as `projects/`, `openapi/` and `backend/`.
- **The repository root is no longer an AXL project.** Its `flow/` and `axl.config.json`
  moved to `examples/taskdeck/`. Seven integration suites had been compiling the root in
  place, which is the only reason it had to be a project; they now compile
  `fixtures/projects/taskdeck/`.
- **`npm test` passes `--no-file-parallelism`.** The bare `vitest run` it used to invoke
  produced `EADDRINUSE` failures that look like regressions but are not, because several
  suites bind fixed ports.
- Root `compile`, `validate`, `doctor` and `init` scripts are removed — they operated on
  the root-as-project that no longer exists. `npm run axl -- <command>` replaces them.
- `AGENT.md` moved to `docs/agents.md` and was rewritten. The old copy documented syntax
  that does not exist (`bind` blocks, `public: true`, `confirm: true`), cited a test count
  from four releases earlier, and pointed at pre-move `src/` paths.

### Fixed

- **`examples/hotel-booking` did not compile.** It declared the reserved-but-unimplemented
  `MCP` and `OPENAPI` generators, so the project the README called a complete reference
  implementation failed on the first command a newcomer would run. It now declares
  `DIAGRAM`, and has been built out from a two-action scaffold into a project that
  actually exercises what its README claims: 11 actions, 2 resources, 3 workflows, all
  four permission levels, confirm gates, `PARALLEL`, `SWITCH`, `IF`/`ELSE` and
  `IRREVERSIBLE`.
- CI ran `npx vitest run` without `--no-file-parallelism`, the same fixed-port collision
  the local runner had.
- CI ran `npm install` rather than `npm ci`, so a drifted lockfile could pass.
- **Every documented install path was broken.** `npm install -g scl-axl` is the first
  command in the README, the CLI package README and the installation guide, and no AXL
  package has been published to npm — the registry returns 404 for `scl-axl`,
  `@axl/compiler` and `axl-flow`. All three documents now lead with a working
  install-from-source path and mark the npm route as pending first release.
- `docs/installation.md` stated a Node 18 floor and described the VS Code extension as
  required rather than optional.
- **Four integration suites were order-dependent.** `ws-security`, `ws-transport`,
  `mcp-origin` and `conformance` pointed at a `build/` directory they never produced,
  and passed only because an earlier file in the run had compiled it as a side effect.
  Run alone, each failed with "Manifest not found". They now compile through
  `test/helpers/fixture-project.ts`, which memoises the build so the cost stays at one
  compile per process. Verified by deleting every `build/` directory and running the
  suite, then each of the three suites individually.

### Added

- `packages/runtime/package.json` — `@axl/runtime`.
- `scripts/compile-examples.js` and `npm run examples:compile`, wired into CI. Every
  project under `examples/` must compile.
- `.github/`: issue forms for bugs and features, a pull request template, `CODEOWNERS`,
  and `dependabot.yml` for npm and Actions.
- `.editorconfig` and `.nvmrc` (20.19 — `chokidar@5` declares `engines.node >= 20.19.0`,
  which makes the documented Node 18 floor wrong).
- CI, licence, Node and test-count badges on the README.
- An install-from-source path in `README.md` and `docs/installation.md`, verified end to
  end: `npm link --workspace=scl-axl`, then `axl --version`, `axl init -y`,
  `axl compile`.
- CI now runs a Node version matrix (20.19 and 22.x) and a separate packaging job.
- Dedicated `--help` for the ten commands that had none — `validate`, `generate`,
  `build`, `dev`, `doctor`, `info`, `clean`, `format`, `lint` and `config` all fell back
  to a generic "Run this command to execute the X operation" stub. `doctor --conformance`
  in particular was a real flag documented nowhere.
- `README.md` files for `@axl/compiler`, `@axl/runtime` and `@axl/generators`, which
  had none. `packages/cli/README.md` — the npm landing page for `scl-axl` — was
  rewritten: it advertised MCP and OpenAPI generators that do not exist, listed 6 of
  15 commands, and described `axl serve` as MCP-only.
- `README.md` files for `examples/`, `examples/taskdeck/`, `fixtures/` and `scripts/`.
  The scripts directory in particular had no entry point: only `test-packaging.js` was
  referenced from `package.json`, so the rest were undiscoverable without listing it.

### Removed

- `packages/cli/demo/` — a stray `axl init` scaffold committed inside the CLI package,
  referenced by nothing.
- Editor- and assistant-specific configuration files, which configure one particular tool
  rather than being part of the project. Contributor-facing content that was only recorded
  there has moved into `CONTRIBUTING.md` (versioning policy, diagnostic-code conventions,
  the serial-test requirement, the two build traps) and `SECURITY.md` (the design
  boundaries that keep arriving as bug reports).

### Documentation

- `README.md`, `CONTRIBUTING.md`, `SECURITY.md` and `CODE_OF_CONDUCT.md` rewritten.
- `examples/hotel-booking/README.md` rewritten — it had described a rich booking system
  with rooms, refunds, admin roles and OTP gates while the project contained two actions
  on a `User` entity.

### Known, documented, not fixed

- **Rate limits fail open.** The engine matches only `sec|min|hr|day`; any other unit is
  ignored and no limit applies, with no diagnostic at compile time. Reproduced with a
  control: `3/min` returns 429 from the fourth request, `3/hour` allows all eight.
  `axl inspect` prints the declared string either way, so it cannot distinguish an
  enforced limit from an ignored one.
- `--trust-identity-headers` is absent from `axl serve --help`, despite being the flag
  that decides whether `ROLE` and `OWNER` function at all.
- `packages/vscode` ships two icon files totalling 860 KB (`flow.svg` 516 KB,
  `marketplace-icon.png` 344 KB), which every clone of the compiler pays for.

## [1.4.0] — 2026-08-07

Richer action semantics, request correlation, a conformance self-check, and actionable
error hints.

**Minor, not major.** Every addition is optional and absent by default: an action that
declares none of the new fields emits the exact manifest key set it always did, and its
MCP description is byte-identical. One field changed shape rather than being added —
see `instance` under Changed.

**Named "v1.1.3" in the request; released as 1.4.0.** The repo was already at 1.3.1, so
1.1.3 would have been a version number going backwards. The project's versioning policy
puts this at minor — new keywords, a new command, new manifest fields, nothing existing
broken — which is 1.4.0.

### Added

- **`IRREVERSIBLE`, `EFFECTS`, `SIDE_EFFECTS` on `ACTION`** — declarative metadata about
  what a call does to the world, as opposed to how to invoke it.

  ```flow
  ACTION cancel_order
    DESC "Cancel an existing customer order"
    IRREVERSIBLE true
    EFFECTS "order.status -> CANCELLED"
    SIDE_EFFECTS "a refund may be initiated"
  ```

  Surfaced in the manifest and appended to the **MCP tool description**, which is the
  only channel through which a calling model learns anything about an action beyond its
  name and arguments. An autonomous caller can now read "IRREVERSIBLE" and decide to ask
  a human first — something it cannot infer from `POST`.

  `IRREVERSIBLE` takes a bare `true`/`false` and rejects anything else (`AXL386`);
  `yes` quietly meaning true would be the wrong kind of forgiving for a field whose
  purpose is warning a caller off a destructive action. All three are compile errors on
  a `RESOURCE` (`AXL387`) — a read-only primitive has no consequences to declare, and
  accepting them silently would leave an author believing they had documented one.

- **Request correlation.** Every inbound request carries an id: generated as a UUID, or
  taken from a client-supplied `X-Request-Id` / `X-Correlation-Id` / `X-Amzn-Trace-Id`
  so a caller can stitch an AXL call into a trace it already has. Echoed on every
  response, attached to every emitted event, and used in the RFC 7807 `instance` field.

  A supplied id is an opaque label — never an authorisation or routing input — so unlike
  the identity headers it needs no operator flag. It is length-capped and stripped of
  control characters, because it is reflected into a response header and written to logs.

- **Duration on completed events.** `action.completed` and `workflow.completed` report
  `durationMs`. The workflow clock lives in the persisted state, so a run that pauses for
  OTP and resumes hours later reports total elapsed rather than restarting at resume.

- **`axl inspect [manifest | build-dir | server-url]`** — a reporting command over data
  that already exists, adding no runtime capability. Every action and resource with its
  permission, confirm gate, `IRREVERSIBLE` flag and rate limit, plus a count of what is
  reachable with no session. Reads a local manifest or a running server's
  `/manifest.json`, because "what did I compile" and "what is live now" differ.

- **`axl doctor --conformance`** — a project-soundness pass alongside the existing
  environment checks. Sources compile; every action has a `PERMISSION`; no `CONFIRM` on a
  `RESOURCE`; the manifest loads; every manifest action carries a permission; no
  duplicate compiler diagnostic codes; and a live check that boots the project and asks
  for `/health`.

  Most restate an invariant the compiler already enforces — the value is visibility, not
  new enforcement. Two find what the compiler cannot: a stale or hand-edited manifest
  (the compiler only reads sources), and a project that compiles but will not serve.

  **Explicitly not a certification.** No badge, no external claim; the output says so.

- **`next_action` hints** on RFC 7807 errors and on the `confirmationRequired` envelope,
  offered only where a genuinely clear next step exists:

  | condition | `next_action` |
  | --- | --- |
  | `RATE_LIMIT_EXCEEDED` | `retry_after`, plus a derived `retry_after` in seconds |
  | `confirmationRequired` | `confirm_action` |
  | wrong OTP, attempts remain | `retry_confirmation` |
  | unknown or expired token | `request_confirmation` |
  | attempts exhausted | `request_confirmation` |
  | `PERMISSION_DENIED` | *(absent)* |
  | unknown action | *(absent)* |

  Absent means the key is not present at all — not null, not empty — so
  `if (body.next_action)` and `"next_action" in body` agree. `PERMISSION_DENIED` can mean
  a missing session, a wrong role, or acting on someone else's record; a hint there would
  be a guess, and a guess a client branches on is worse than nothing.

  `retry_after` is real, not a constant: the limiter already tracks each bucket's window
  end, so the delay is read off that state at the rejection point. It is the **last**
  exceeded window, since clearing one bucket while another is full would send the caller
  straight back into a rejection. Mirrored onto the standard `Retry-After` header.

### Changed

- **`instance` in RFC 7807 responses is now `<path>#<request-id>`.** It was the bare
  path, which RFC 7807 asks to identify "the specific occurrence" but which was identical
  across every 403 on a given route — the field was present without doing its job. Still
  a valid relative URI reference and still readable at a glance, now genuinely
  occurrence-specific. **Client impact:** exact-equality matching on `instance` breaks;
  prefix matching does not.

- `serve()` honours `port: 0` as an ephemeral-port request. It was treated as falsy and
  folded into the 3939 default — the one value guaranteed to collide with a server the
  developer already has running. The bound port is now read back rather than echoed.

### Fixed

- **`serve().close()` did not release the event loop.** The WebSocket sweep interval is
  cleared on `wss` "close", but the `WebSocketServer` is `noServer`, so nothing ever
  closed it and the listener never fired. Anything awaiting `close()` and expecting to
  exit — a script, a test, `axl doctor --conformance` — hung indefinitely. The interval
  is now unref'd, the socket server is shut down with the rest, and keep-alive
  connections are destroyed (`srv.close()` leaves them open and its callback does not
  fire until the last one goes).

### Out of scope, deliberately

No identity, delegation, payment, registry or gateway concepts were introduced. No log
storage or tracing backend either — that is a separate, much larger project, and this
pass is scoped to correlation, timing and reporting.

## [1.3.1] — 2026-08-07

### Fixed

- **`axl adapt openapi` now scaffolds a project `axl compile` will actually recognise.**
  It wrote the four `.flow` files flat into `--out`, but `findProjectRoot()` identifies a
  project by an `axl.config.json` or a `flow/` directory — so the natural next step,
  running `axl compile` in that directory, failed with **"Not an AXL project"**
  immediately after adapt reported success.

  `--out` is now the **project directory**, matching what `axl init` scaffolds:

  ```
  <dir>/flow/*.flow      app, schema, actions, auth
  <dir>/axl.config.json  written only when absent
  ```

  The default changed from `./flow` to `.`, which leaves the default file locations
  exactly where they were — `axl adapt openapi spec.yaml` still writes `./flow/*.flow`,
  and now writes `./axl.config.json` beside it. An existing `axl.config.json` is never
  overwritten.

  **Patch, not minor:** no new capability, and the command's output lands in the same
  place it did for the default invocation.

  The regression test that should have caught this was building the project directory
  itself — `mkdir flow/`, write a config — so it only ever proved the generated *file
  contents* compiled. It now runs `axl adapt` and `axl compile` as real CLI invocations
  with nothing scaffolded by hand in between, and asserts the resulting layout.

## [1.3.0] — 2026-08-07

`axl adapt openapi` — import an existing OpenAPI 3.0/3.1 spec as a `.flow` project.

**Minor, not major.** A new command and a new CLI dependency; no existing command,
syntax, manifest field or runtime behaviour changes.

### Added

- **`axl adapt openapi <spec-file> [--out <dir>]`** — generates `app.flow`,
  `schema.flow`, `actions.flow` and `auth.flow` from an OpenAPI document.

  It emits **`.flow` source, never `manifest.json`.** The generated files then go
  through the ordinary `axl compile`, so the existing validator still gates them —
  `AXL322` ("every action needs a `PERMISSION`"), unknown type references, duplicate
  names and the rest. Emitting a manifest directly would route around the single source
  of truth the adapter model exists to preserve.

  Runs before project resolution, like `init`: you import a spec in order to *create* a
  project. It refuses to overwrite existing `.flow` files, because re-running would
  discard hand-reviewed `PERMISSION` decisions.

### The security default — closed, and not inferred

**Every imported action is `AUTH`. Never `PUBLIC`, under any condition. No `CONFIRM`
gate is ever generated.**

An OpenAPI document carries no AXL permission semantics. `security: []` on an operation
means it overrides the spec's global HTTP auth requirement — it is not a claim that the
endpoint is safe to expose to an unauthenticated caller through AXL. Silence in a source
spec is not evidence of intent, and a spec's own auth documentation is routinely
incomplete or stale. So nothing is guessed: the importer defaults closed and marks every
entry for review, with a banner at the top of `auth.flow` and a `REVIEW REQUIRED` block
above each individual line.

`CONFIRM` is a business-risk judgement about a specific product, not something an HTTP
method implies — `DELETE /sessions` (log out) and `DELETE /accounts` (irreversible) are
the same verb. Generating a gate from the verb would be guessing; generating none while
looking thorough would be worse.

**The generated output requires human review before it is trustworthy to serve.** That
is a property of the design, not a gap in it.

### What it maps, and what it refuses to guess at

- `info` → `APP`/`NAME`/`VERSION`/`DESCRIPTION`; `servers[0].url` → `BASE_URL`.
- `components.schemas` → `ENTITY` blocks, with `$ref` between schemas resolving to the
  referenced entity rather than a stringified blob.
- One `ACTION` per operation. `operationId` → action name, or a stable name derived from
  method + path when absent (noted in a comment on the action). `parameters` and
  `requestBody` → `INPUT`, with `REQUIRED`/`OPTIONAL` taken from the spec's own
  `required` arrays. Success response schema → `OUTPUT`. Header and cookie parameters
  are skipped — they are transport concerns the engine supplies itself.
- The spec's `summary`/`description` is preserved as `DESC`, including per-parameter
  descriptions.

Anything AXL's type system cannot represent is **marked `TODO` in the generated file**
rather than silently approximated: `oneOf`/`anyOf`/`allOf` polymorphism, free-form
objects with no declared properties, a missing 2xx response, an absent summary, a
non-semver `info.version`, and a relative or missing `servers[0].url`. A developer who
reads "this was a `oneOf` and became String" can fix it; a silent String surfaces much
later as a runtime shape mismatch.

### Notes

- Parser is [`@readme/openapi-parser`](https://www.npmjs.com/package/@readme/openapi-parser)
  rather than `@apidevtools/swagger-parser`: it advertises OpenAPI **3.x** where the
  latter still says 3.0, and 3.1 is in scope. Both MIT; the former is far more actively
  maintained. Verified that 3.0.3 and 3.1.0 both validate and that a malformed document
  is rejected. Validation runs **before** any generation and hard-fails — half a project
  generated from a bad spec produces compile errors pointing at the generator instead of
  the real problem.
- Path placeholders are rewritten to match the generated snake_case input names.
  `buildUrl` resolves a placeholder by looking its name up in the action's arguments, so
  `ENDPOINT GET /books/{bookId}` beside `book_id : String` would throw
  `Missing required path parameter: bookId` on every call. Only the substituted value
  reaches the backend, so renaming the placeholder is safe.
- **No application-code analysis.** Express routes, Prisma schemas and Spring
  controllers are explicitly out of scope — they need real code analysis rather than
  reading a structured document, which is separate and much larger work.
  `axl adapt <anything-else>` says so rather than failing obscurely.
- No `workflows.flow` is generated. A comments-only stub was tried and rejected: the
  compiler treats a file with no declarations as `Empty file` and fails the build, which
  leaves a choice between inventing a workflow nobody asked for and shipping none. The
  cost is one accurate `AXL403` warning on a freshly imported project.

## [1.2.0] — 2026-08-07

`PARALLEL` — concurrent workflow branches.

**Minor, not major.** `PARALLEL` is a new keyword that did not previously parse, and no
existing workflow changes shape or behaviour. The one shared-code change — a per-member
qualifier on the idempotency cache key — applies only to calls originating inside a
block, so an existing cache entry keeps exactly the key it had.

### Added

- **`PARALLEL` block** — members are dispatched together and the block advances only once
  all of them have settled.

  ```flow
  WORKFLOW checkout
  STEP create_order
  PARALLEL
    STEP charge_card USING id = create_order.id
    STEP reserve_stock USING id = create_order.id
  END
  END
  ```

  Measured against a real backend: two 500ms steps complete in 551ms rather than 1009ms
  sequentially, with both requests reaching the backend 1ms apart; three complete in
  510ms. Members support `USING`, `RETRY` and `TIMEOUT` exactly as sequential steps do.

- `parallel.started` and `parallel.completed` lifecycle events, both carrying `context`.

### The restrictions, and what they buy

The block needs **no new persisted state** — it reuses the engine's existing flat
`remainingSteps` cursor untouched. That is bought entirely by compile-time restrictions,
each of which disallows an ambiguous case rather than inventing a semantics for it:

- **`AXL381` — no `CONFIRM` inside.** A confirmation pauses the workflow, and a pause
  writes one `pausedWorkflows` record keyed by one token; two members pausing would need
  two, and the members that already finished cannot be replayed. With pausing banned, the
  block is atomic from the persistence layer's point of view: either the workflow
  advances past the whole block, or the block is never partially persisted.
- **`AXL382` — no duplicate action inside one block.** `stepOutputs` is keyed by action
  name, so two concurrent copies would race for one key and any later `USING` binding on
  that name would depend on scheduling. The same action in two *separate* blocks is fine.
- **`AXL383` — only `STEP` inside.** `IF`, `SWITCH`, `WAIT` and a nested `PARALLEL` each
  either branch the cursor or park it, which is exactly what the block may not do.
- **`AXL384`** — at least two steps; a one-step block is just that step.
  **`AXL385`** — unclosed block.
- **A member may not bind from a sibling.** They are dispatched together, so a sibling's
  output does not exist yet. Binding from a step *before* the block, and from a member
  *after* it, both work.

### Failure semantics

**Fail-fast**, matching what a sequential step failure already does. Implemented with
`allSettled` rather than `Promise.all`: `all` rejects the instant one member throws and
leaves its siblings running unobserved into an unhandled rejection. The caller still
fails fast — the block just waits for the others to stop first.

**Sibling side effects are NOT rolled back.** A member that completed before another
failed has really called the backend, and there is no compensation mechanism. This is the
same caveat that already applies when a sequential workflow dies partway through, except
a block can leave more than one committed action behind. The error says so explicitly and
names them:

```
Backend returned 500 (parallel block in workflow "checkout":
charge_card already completed and was not rolled back)
```

Every member's arguments are resolved *before* any member is dispatched, so a member with
invalid inputs fails the block without having already fired its siblings at the backend.

### Changed

- Idempotency cache keys for calls inside a `PARALLEL` block gain a deterministic
  per-member qualifier (`:par0`, `:par1`). With `AXL382` in place the action name already
  keeps two members apart; what the qualifier adds is that a member no longer shares a
  replay slot with the same action used elsewhere in the same workflow under the
  workflow's single client-supplied idempotency key. Unscoped keys are byte-identical to
  before.

## [1.1.2] — 2026-08-07

Async and control-flow primitives for workflows: `RETRY`, `TIMEOUT`, `WAIT` and
`SWITCH`/`CASE`/`DEFAULT`.

**Minor, not major.** Every addition here is new syntax that did not previously parse, and
nothing that already compiled changes shape or behaviour: a step with no modifiers still
emits a bare action-name string in the manifest, and `IF`/`ELSE` still compiles to exactly
the branch shape it always did. The one behavioural change — a step's `RETRY`/`TIMEOUT`
now applying after an OTP pause — cannot affect an existing project, because no existing
project can have declared either modifier.

### Added

- **`RETRY <n>` step modifier** — re-attempts a step up to *n* times when the backend
  fails. Only `BackendError` and `TimeoutError` are retried; a validation or permission
  failure is a property of the request and would fail identically on every attempt, and
  retrying into an already-exceeded rate limit is the one thing guaranteed to keep you
  over it. Flat 250ms between attempts, so the worst case is a number an author can
  compute: `(n-1) × 250ms`.

- **`TIMEOUT <ms>` step modifier** — a real per-attempt deadline on the backend call,
  enforced with an `AbortController` wired into `fetch`. On expiry the request is
  genuinely cancelled and the socket released; a `Promise.race` deadline would answer
  the caller on time while leaving the call running, leaking a connection per timed-out
  request. The deadline covers reading the response body too.

  Per *attempt*, not per step: `RETRY 3 TIMEOUT 1000` gives each attempt its own second.
  Timeouts are retry-eligible — a backend that was briefly too slow is the canonical
  transient failure.

  New `TimeoutError`, deliberately **not** a `BackendError` subclass: `BackendError.status`
  is the code the backend returned, and a timeout means there was no response to have one.
  REST maps it to **504 `TIMEOUT`** (`application/problem+json`, with a `timeout_ms`
  extension member); MCP reports its own `TIMEOUT` code rather than a `BACKEND_ERROR`
  carrying an empty `status`.

- **`WAIT <ms>` step** — a fixed pause between steps. Its own step shape rather than a
  modifier, because a wait is not something an action does. Emits `workflow.waiting`
  (with `context`, so the fail-closed WebSocket filter can place it) — a multi-second
  silence is otherwise indistinguishable from a hang.

- **`SWITCH` / `CASE` / `DEFAULT`** — the general multi-way branch.

  ```flow
  SWITCH check_order.status
    CASE shipped
      STEP notify
    CASE cancelled
      STEP refund
    DEFAULT
      STEP escalate
  END
  ```

  Values compare stringified, since the subject arrives from a backend as JSON and
  `CASE 2` should match a numeric `2`. `null`/`undefined` match nothing rather than
  stringifying into `"null"`. `cases` is an ordered array in the manifest, not a
  value-keyed object — JSON objects carry no ordering guarantee, and source order is
  what an author sees.

- Reserved lifecycle event names now include `workflow.waiting` and `step.retrying`, so
  a domain `EVENT` cannot shadow either.

### Changed

- **A step's `RETRY` and `TIMEOUT` now apply after an OTP pause.** A confirm-gated step
  executes inside `confirmAction`, not back in the step loop, so both modifiers were
  previously dropped for exactly the steps most likely to declare them. `resumeWorkflow`
  hands them down. A direct `confirm_action` call has no step behind it and stays a
  single attempt with no deadline.

- `AxlEngine.execute()` and `confirmAction()` take an optional trailing options argument.
  Additive — every existing caller is unaffected. `_executeHttp` gained a matching fifth
  parameter, which three tests pinning its exact argument list were updated for.

- `loadManifest`'s malformed-step message now names every accepted step shape.

### Not built: `PARALLEL`

Concurrent workflow branches are **not** in this release. The blockers found while
investigating — a single flat cursor in the persisted state, multi-token pauses, an
idempotency-cache collision, `stepOutputs` aliasing, and undecided error semantics — each
needed a decision rather than an implementation. They were resolved and shipped in the
next release; see its entry.

## [1.1.1] — 2026-08-06

Completes AXL v1: the read-only primitive every audit asked for, named domain events,
role/ownership permissions, and a standard error shape.

### Breaking

- **REST error responses now use RFC 7807 Problem Details.** `{error, message}` becomes
  `{type, title, status, detail, instance}`, served as `application/problem+json`.
  The old `error` code string survives **verbatim** as `type`, so client logic branching
  on `NOT_FOUND` / `VALIDATION_ERROR` / `PERMISSION_DENIED` keeps working — it is a field
  rename, not a rewrite. `message` is now `detail`. Applies to every REST path and to the
  global handler, so one server no longer returns two error shapes depending on how far a
  request got. **MCP is unchanged** — it has its own error convention and forcing 7807
  into it would fight the protocol.

### Added

- **`RESOURCE` primitive** — read-only, non-mutating state (a cart, a profile, a live
  value), the one gap all three independent audits agreed on. Declared in
  `resources.flow`, compiled to its own `resources` manifest block, served at
  `GET /resources/:name` over REST and through MCP's real `resources/list` and
  `resources/read` — as resources, never as tools. `capabilities.resources` is now
  derived from the manifest rather than hardcoded.
- **`EVENT` on actions** — names the domain event an action produces, emitted *in
  addition to* the generic `action.completed`, with the same fail-closed, identity-matched
  WebSocket scoping.
- **`ROLE` and `OWNER` permission levels** — `PERMISSION x : ROLE staff` and
  `PERMISSION x : OWNER user_id`. Identity claims are read from `X-AXL-Subject` /
  `X-AXL-Roles` **only** under the new `serve --trust-identity-headers` flag; with it off
  both levels deny everything. AXL still issues, stores and verifies nothing — it compares
  a claim it is handed. See SPECIFICATION.md for what `OWNER` does and does not promise.

### Fixed

- `resources/read` errors now classify through the same branch set as tool errors, so an
  unexpected internal fault cannot leak its raw message through MCP.

## [1.0.0] — 2026-08-04

Every package in the workspace now declares `1.0.0` and moves together from here.
Previously the root read `0.1.0` while `scl-axl` was `0.2.3`, `axl-flow` was `0.2.0`,
and `@axl/compiler` / `@axl/generators` were both `0.1.0` — no package anywhere declared
the v1.0 the release commits were talking about. Internal workspace references were
updated to match.

Note this is a *lockstep* choice: the packages share a version and release together, so a
change in any one of them bumps all of them. That trades independent versioning for a
version number that means something across the whole toolchain.

#### Upgrade note — `--state-file` deployments only

Confirmation tokens are now bound to their requester, which means a pending confirmation
carries a `requesterKey` that records written by an earlier version do not have. Those
records fail the ownership check and are rejected as `Invalid or expired confirmation
token` — fail-closed, which is the right direction, but it does invalidate in-flight
state that survived the upgrade. Verified directly against both namespaces:

- `pendingConfirmations` — 5 minute TTL, so at worst a user re-triggers the action.
- `pausedWorkflows` — **24 hour TTL**, so a workflow paused before the upgrade cannot be
  resumed afterwards and must be re-run from the start.

Nothing to do for the default in-memory store, which starts empty on every boot. For a
file-backed store, either drain paused workflows before upgrading or accept that anything
paused within the previous 24 hours needs re-running.

### Security
- **Confirmation tokens are bound to their requester.** `confirmAction` and
  `resumeWorkflow` previously accepted a token from anyone who held it and then executed
  under the *original* requester's session. A mismatch now raises the same error as an
  unknown token, so the endpoint is not a token-existence oracle, and the check runs
  before the OTP comparison so a stranger cannot burn the owner's attempt budget.
- **WebSocket event broadcast fails closed.** The filter only skipped clients whose
  identity disagreed with the event's, so an event carrying no context reached every
  connected socket — `workflow.paused`, which carries a live confirmation token, was
  emitted exactly that way. Events are now delivered only on a positive identity match.
- **`workflow.paused`, `workflow.completed` and `workflow.resumed` carry their context**,
  so transports can attribute them.
- **The `/ws` upgrade validates `Origin`**, using the same check `/mcp` already had.
- **Rate limits and confirm-failure lockouts are anchored to the source IP.** They were
  keyed on the unvalidated bearer token, so rotating the `Authorization` header minted
  unlimited fresh buckets — 40 of 40 requests passed a 10/min limit. The session is now
  an additional narrowing bucket, never a replacement.
- **Idempotency requires a real session.** The IP fallback let two anonymous clients
  behind one NAT read each other's cached result, including a cached
  `confirmationRequired` envelope with a live token.
- **Discovery documents no longer reflect an unvalidated `Host` header.** `Host` is
  checked against the bound address; `AXL_PUBLIC_URL` and `AXL_ALLOWED_HOSTS` cover
  reverse-proxy deployments.
- Dependency advisories cleared via `npm audit fix` (no `--force`, no major bumps).

### Added
- **Per-parameter descriptions in `INPUT` blocks**: `title : String REQUIRED DESC "…"`.
  Threaded into `manifest.json` and into the generated MCP tool schema, so tools
  advertise what a parameter means instead of only its type.
- `axl_version` is emitted into the manifest (the AXL protocol version, `1.0`). Two
  consumers already read it; nothing had ever produced it.
- Manifest `workflows` are shape-validated at load, so a corrupted manifest fails with a
  path and an index instead of hanging the process mid-execution.

### Changed
- **`OUTPUT` is now genuinely mandatory** (`AXL320`). The validator always had this check
  but the parser defaulted a missing `OUTPUT` to `Null`, making it unreachable and
  `SPECIFICATION.md`'s claim untrue. **Breaking**: an action that omitted `OUTPUT` must
  now declare `OUTPUT Null` explicitly.
- **`GENERATORS` is validated against generators that can actually run.** Declaring an
  unimplemented one is a compile error (`AXL343`) rather than a clean compile followed by
  `axl generate` printing "not found" and exiting 0.
- **`axl generate` exits 1** when any requested generator did not run.
- A missing action-level `DESC` now warns (`AXL323`) — an empty tool description gives a
  model nothing to select on.
- MCP error codes match REST's: `NOT_FOUND`, `TOO_MANY_ATTEMPTS` and
  `RATE_LIMIT_EXCEEDED` are reported instead of a catch-all `WORKFLOW_ERROR`.
- `/.well-known/mcp` reports `authentication.methods: ["bearer"]`, agreeing with
  `/.well-known/axl` about the credential they both describe.
- Scaffolded `AGENT.md` no longer claims `axl generate` produces MCP tool definitions and
  an OpenAPI spec. Only Mermaid diagrams exist.

### Fixed
- Inherited `Object.prototype` members (`constructor`, `toString`, `valueOf`,
  `hasOwnProperty`, `__proto__`) resolved as action names and returned 500 instead of 404.
- A malformed workflow step matching neither branch spun a synchronous loop and pinned
  the event loop, taking down the whole process.
- A 400 for malformed JSON reported "Internal Server Error"; 4xx responses now describe
  the request problem, with the generic string reserved for real 5xx faults.
- `axl doctor` no longer reports a hardcoded, now-wrong compiler version.
- `docs-smoke.test.ts` polls `/health` instead of sleeping a fixed 2000ms against a
  ~2473ms cold start, and reaps its server's whole process group — it was leaking a
  process that held port 3939 across runs, to the point where a later run of the test
  passed against the *orphan* rather than its own server.

## Pre-1.0 development log

The entries below predate 1.0.0 and are kept for provenance only. They were written as an
`[Unreleased]` section during initial development and never reconciled: the transport flags
are recorded as both added and removed, `### Changed` appears twice, and the paths named
(`src/backend-adapter.js`, a root `AGENT.md`) no longer exist. Read 1.0.0 and later for
anything load-bearing.

- Transport selection flags (`--rest`, `--mcp`, `--both`) were added to `axl serve` and then
  removed again. The engine serves REST, MCP and WebSocket unconditionally; the flags are
  still rejected by name, with a message explaining why.
- `TransportManager` was introduced so endpoint registration is not the engine's concern.
- `GET /.well-known/axl` and `GET /manifest.json` became the discovery surface.
- The REST adapter was added alongside MCP, and the backend adapter was extracted so the
  execution model stayed transport-agnostic.
- A global `express.json()` was breaking the MCP `StreamableHTTPServerTransport` by
  consuming the request stream early.
- `docs/installation.md` and `docs/quickstart.md` were added, and the README became a
  landing page.
