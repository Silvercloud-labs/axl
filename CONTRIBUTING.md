# Contributing to AXL

Thank you for considering a contribution. This document covers everything needed to make a
change that can be reviewed and merged without a round trip.

---

## Table of contents

- [Ground rules](#ground-rules)
- [Local setup](#local-setup)
- [Project layout](#project-layout)
- [Testing](#testing)
- [Versioning policy](#versioning-policy)
- [Diagnostic codes](#diagnostic-codes)
- [Commit conventions](#commit-conventions)
- [Pull request process](#pull-request-process)
- [Reporting bugs](#reporting-bugs)
- [Proposing features](#proposing-features)
- [Licensing of contributions](#licensing-of-contributions)

---

## Ground rules

| Principle | What it means in practice |
|---|---|
| **Verify, do not infer** | If a change affects runtime behaviour — a status code, a build result, a race — run it and include the real output. Reasoning about what the code "should" do is not evidence. |
| **Stability first** | AXL sits between clients and a production backend. Backward compatibility and security outrank convenience. |
| **Scoped changes only** | A pull request does one thing. Spotted something else broken? Open a separate issue rather than folding a drive-by fix into an unrelated diff. |
| **Restrictions can be the design** | Several constructs deliberately reject ambiguous cases instead of inventing a semantics for them. Before relaxing a rule, read why it exists. |

Breaking architectural changes need discussion in an issue **before** the pull request.

---

## Local setup

### Requirements

| Component | Version |
|---|---|
| Node.js | 20.19.0 or later (`chokidar@5` sets the floor; `.nvmrc` pins it) |
| npm | 10 or later |

### Bootstrap

```bash
git clone https://github.com/Silvercloud-labs/axl.git
cd axl
npm install
npm run build
npx vitest run --no-file-parallelism
```

A clean checkout should report **750 tests passing across 50 files**. If it does not, stop
and open an issue — do not build on a red baseline.

### Two build gotchas that will waste your afternoon

**Use `npm run build`, not `tsc --noEmit`.** The bare `--noEmit` invocation is a weaker
gate than `tsc --build` and will pass on code the real build rejects.

**The CLI resolves `@axl/compiler` to its built `dist/`.** Editing compiler source and
re-running `npx tsx packages/cli/index.ts` silently exercises the *stale* build. Run
`npm run build` before testing any compiler change by hand.

### Simulate a fresh checkout

For anything dependency- or lockfile-shaped, installed `node_modules` in your working
environment can hide a missing `devDependency` that only surfaces on a clean clone. Verify
in a fresh directory before claiming a packaging fix works.

---

## Project layout

| Path | Package | Contents |
|---|---|---|
| `packages/compiler` | `@axl/compiler` | Lexer, parser, validator, manifest generator |
| `packages/runtime` | `@axl/runtime` | Execution engine, transport adapters, state stores |
| `packages/cli` | `scl-axl` | The `axl` binary and every subcommand |
| `packages/generators` | `@axl/generators` | Generator registry and implementations |
| `packages/vscode` | `axl-flow` | VS Code extension |
| `examples/` | — | Runnable `.flow` projects. All compile in CI — see [examples/README.md](examples/README.md) |
| `fixtures/` | — | Inputs owned by the test suite — see [fixtures/README.md](fixtures/README.md) |
| `scripts/` | — | Maintenance and verification scripts — see [scripts/README.md](scripts/README.md) |
| `test/` | — | Vitest suites |
| `docs/` | — | Guides and reference. The README links every one of them; `test/docs-links.test.ts` fails if it stops |
| `assets/` | — | Images used by the README |

> **`packages/runtime` is hand-written source, not build output.** It is plain ESM
> JavaScript with no compile step, imported directly by `packages/cli/serve.ts` and by the
> test suite. Edit it freely — nothing overwrites it.
>
> It lived at `/src` until the open-source restructure. A directory named `src` sitting
> next to four TypeScript packages read like generated output, and the old contributor
> notes actively described it as compiled, which discouraged people from touching the
> actual engine.

---

## Testing

### Running the suite

```bash
npm test          # already passes --no-file-parallelism
```

**Run serially.** Several suites bind fixed ports (3939, 3942, 3950, 3951, 3961–3963,
3996, 3999). Run in parallel they collide and produce `EADDRINUSE` failures that look like
real regressions but are not.

### Writing tests

| Requirement | Detail |
|---|---|
| Coverage | Every feature and every bug fix ships with a test |
| Location | `test/` for runtime and integration. Package-local units live in `packages/compiler/__tests__/` and `packages/cli/test/` |
| Ports | Bind port `0` and read the assigned port back. Do not add to the fixed-port list — `test/step-timeout.test.ts` shows the pattern |
| Teardown | Spawned servers must be reaped before the test exits. An orphan holding a port can make a later run pass against the *wrong* server |
| Pass rate | 100%. A pull request that leaves a test failing is not ready |

If a test passes suspiciously — especially one that binds a fixed port — check for a stale
process before believing it.

### Verifying by hand

Manual verification scripts live in `scripts/`. Several read OTP values from API responses
and therefore need the demonstration flag:

```bash
AXL_DEMO_OTP=1 node scripts/manual-workflow-check.js
```

Without it they run but verify nothing useful.

---

## Versioning policy

**Bump the version yourself whenever you change runtime, compiler, or adapter code.** This
is part of finishing the work, exactly like running the tests. It is not left for a
maintainer.

| Bump | When |
|---|---|
| **PATCH** `x.y.Z+1` | Bug fixes and internal-only changes. No new `.flow` syntax, no behaviour a user could depend on |
| **MINOR** `x.Y+1.0` | New additive capability — a keyword, primitive, permission level or manifest field that did not exist before, breaking nothing |
| **MAJOR** `X+1.0.0` | A change that breaks something that already worked — a changed response shape, removed or renamed syntax, a changed default an existing project would notice |

On a major-versus-minor edge case, **use judgement and state the reasoning in the commit
message and the changelog**. Never pick silently.

### Mechanics, every time

1. Bump **in lockstep across all six `package.json` files** — root, `compiler`, `runtime`,
   `cli`, `generators`, `vscode`.
2. Update the internal `@axl/*` workspace references between them.
3. Add a `CHANGELOG.md` entry under the new version describing what changed.

`test/versions.test.ts` enforces all three. A bump that misses a manifest, an internal pin,
or the changelog entry fails the suite.

Documentation-only changes need no bump.

---

## Diagnostic codes

Compiler diagnostics are `AXL<number>`. The number is part of the public contract — people
grep for it and script against it.

| Range | Area | Phase |
|---|---|---|
| `AXL1xx` | Lexical errors | Lexer |
| `AXL2xx` | Syntax and parse errors | Parser |
| `AXL3xx` | Semantic and validation errors | Validator |
| `AXL4xx` | Project-level warnings — missing or empty files | Compiler driver |

Rules:

- **Never reuse a code for two unrelated checks.** Confirm a candidate is genuinely unused
  across the whole repository before claiming it.
- **Renumbering an existing code is its own scoped change**, never a drive-by inside an
  unrelated pull request.
- A new check gets a new code and an entry in the changelog.

---

## Commit conventions

Format: `<type>(<scope>): <subject>`, imperative mood, no trailing period.

| Type | Use for |
|---|---|
| `feat` | A new capability |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `test` | Test-only changes |
| `chore` | Build, packaging, dependencies, release mechanics |
| `refactor` | Behaviour-preserving restructuring |

```
fix(compiler): reject OWNER naming a non-input argument

OWNER <name> silently passed validation when <name> was not an input of the
action, then denied every request at runtime with no indication why. It is now
AXL363 at compile time.

Verified against a project declaring OWNER on an absent argument: compile fails
with the file and line. Suite 750/750.
```

Explain **why**, not only what. If verification required running something that modified a
file — regenerating a build artifact, for instance — say so explicitly, even when the diff
looks like a no-op.

### Attribution

Commits are authored under your own identity. Do not add AI-assistant co-author trailers,
generated-by footers, or session links to commits, pull request descriptions, reviews, or
issue comments.

---

## Pull request process

Before opening:

- [ ] `npm run build` succeeds
- [ ] `npx vitest run --no-file-parallelism` passes in full
- [ ] New behaviour has a test
- [ ] Version bumped in lockstep across all six manifests, if runtime/compiler/adapter code changed
- [ ] `CHANGELOG.md` updated
- [ ] Documentation updated — `SPECIFICATION.md` for language changes, `README.md` for surface changes
- [ ] The diff contains only the change described

In the description, state the problem, the approach, and **how you verified it** — include
real command output for anything behavioural.

### Merge strategy

This repository does not allow merge commits.

| Strategy | Use when |
|---|---|
| **Rebase** | The branch has atomic, individually readable commits worth preserving |
| **Squash** | The branch is one logical change with noisy intermediate commits |

Both rewrite commit SHAs. **If your branch's commits are referenced anywhere in the
repository's documentation, re-point those references in the same pull request** — stale
hashes are how a commit reference becomes permanently useless.

---

## Reporting bugs

Open an issue with:

| Section | Contents |
|---|---|
| Environment | `axl --version`, `node --version`, operating system |
| Reproduction | The smallest `.flow` project or command sequence that triggers it |
| Expected | What should have happened |
| Actual | Real terminal output, not a paraphrase |

A minimal reproduction is worth more than a detailed description of one.

**Do not report security vulnerabilities as public issues.** See [SECURITY.md](SECURITY.md).

---

## Proposing features

Open an issue before writing code. Include:

- The problem, described independently of any solution
- Why existing primitives cannot express it
- The proposed `.flow` syntax, if it adds syntax
- What it would mean for compile-time validation

Proposals that push auth, payments or identity infrastructure into AXL will be declined —
those are backend concerns by design, and the boundary is what keeps AXL a compiler rather
than a framework.

---

## Licensing of contributions

AXL is licensed under the [Apache License 2.0](LICENSE). By submitting a contribution you
agree it is licensed under those terms, including the patent grant in section 3, and you
confirm you have the right to submit it.

No separate CLA is required. Apache 2.0 section 5 makes this the default for anything
submitted for inclusion, and this paragraph exists so nobody has to go and read section 5
to find that out.

Contributions stay attributed to their authors in the git history. If you add a
substantial new component, add yourself to [NOTICE](NOTICE).

---

## Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

Security defects do not go through the ordinary issue tracker — see [SECURITY.md](SECURITY.md).

---

Thank you for contributing.
