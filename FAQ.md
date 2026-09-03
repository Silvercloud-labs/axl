# FAQ

---

### Is AXL open source, or just free to use?

**Open source.** Apache License 2.0, an OSI-approved licence. You can read it, run it,
modify it, redistribute it, fork it, and sell software built on it — commercially, without
asking and without paying.

There is no open-core split, no paid tier, no telemetry, and no feature that is held back.
The entire toolchain is in this repository: the compiler, the runtime engine, the CLI, the
generators and the VS Code extension.

### Why Apache 2.0 and not MIT?

Apache 2.0 is permissive in the same way MIT is, and adds two things that matter
specifically for a language and compiler:

| | MIT | Apache 2.0 |
|---|---|---|
| Free to use, modify, sell | Yes | Yes |
| Explicit patent grant | No | Yes |
| Trademark protection for the name | No | Yes |
| Requires stating changes | No | Yes |

The patent grant protects both contributors and adopters: anyone who contributes code also
grants a patent licence for it, and that grant terminates for anyone who sues over patents
in the project. MIT is silent on patents, which means a company adopting it is relying on
nobody having a patent claim rather than on anybody having granted anything.

### Why not GPL?

Because of where AXL sits. The runtime is imported into your server process and the compiler
produces a manifest your code loads. A copyleft licence would make that combination a
licensing question for every adopter, which for a piece of build tooling is a reason not to
adopt it. Copyleft is the right answer for an application people run; Apache 2.0 is the
right answer for a compiler people build on.

### Is it production-ready?

**Not yet — it's shipped, but young.**

| | Status |
|---|---|
| Compiler, runtime, CLI | Working, 750 tests passing |
| Published to npm | Yes — `npm install -g scl-axl` |
| VS Code extension on the Marketplace | Not yet. Install the `.vsix` from [Releases](https://github.com/yuvrajnag/axl-os/releases), or build it from source |
| Used in production anywhere | Not that we know of |
| Semantic versioning commitment | From 1.0 onward, yes |

Install it (see [docs/installation.md](docs/installation.md)) and treat it as early
software. The security model is deliberate and the defaults fail closed, but "the design
is careful" is not the same claim as "this has run in front of real traffic".

### What does AXL not do?

Scope boundaries are decisions, not gaps awaiting a patch.

| Not in scope | Why |
|---|---|
| Auth, payments, identity infrastructure | Backend concerns. AXL never issues, stores or verifies a credential |
| OAuth integrations | Owned entirely by the backend. AXL proxies to what already exists |
| A database or ORM | AXL holds no domain data |
| Full MCP parity | No Prompts, Notifications, Progress tracking or Roots |
| Application-code analysis | `axl adapt` reads API specifications, not Express/Prisma/Spring source |
| Compensating transactions | A failed workflow does not roll back completed steps. It names what already committed |

The last one is the most likely to surprise you. If two backend calls must be atomic, that
transaction belongs in your backend behind one action, not in a `PARALLEL` block.

### How is this different from writing an MCP server by hand?

The protocol is not the differentiator — a hand-written MCP server speaks the same protocol.
Two things are:

1. **Your discovery contract is generated and compile-time validated** rather than
   hand-maintained. A tool whose schema disagrees with its implementation is not
   representable.
2. **One source emits both transports.** REST and MCP are served from the same manifest by
   the same engine, so they cannot drift apart. The common failure of a hand-written pair is
   that the permission check exists on one path and not the other.

If you only need MCP and have three tools, write it by hand. AXL earns its place when the
same capabilities have to be reachable by a web client and an agent, with the same rules
applied to both.

### Do I have to rewrite my backend?

No. AXL never replaces your backend — it sits in front of it and calls it over HTTP at the
`BASE_URL` you declare. Your existing routes stay exactly as they are.

If you already have an OpenAPI document, `axl adapt openapi` will scaffold the `.flow`
project for you. Read [docs/adapt.md](docs/adapt.md) first: every imported action is
`AUTH` and marked `REVIEW REQUIRED`, deliberately, and that output is a starting point
rather than a result.

### Why a new language instead of YAML or TypeScript?

YAML has no type checker, no diagnostics with line numbers, and no way to reject a
permission that does not exist. Most of what the AXL compiler does — `AXL322` for a missing
permission, `AXL388` for an unenforceable rate limit, `AXL335` for a `PARALLEL` member
binding from a sibling — has nowhere to live in a schema-less document format.

TypeScript would work, but a decorated TypeScript API becomes a program, and a program can
do anything at load time. The point of a hard compile boundary is that the runtime loads
data, not code.

`.flow` is deliberately not Turing-complete. There are no expressions, no arithmetic and no
user functions. Everything in a `.flow` file is a declaration, which is what makes the whole
file checkable.

### Does it work without the VS Code extension?

Yes — the compiler, CLI and runtime are independent of any editor. But `.flow` files will be
plain grey text, because VS Code only bundles grammars for about sixty languages and a new
one is not among them. That is true for Rust, Svelte, Prisma and Terraform too.

See [docs/installation.md](docs/installation.md#3-vs-code-extension).

### What is `RATE_LIMIT 100/hour`?

A compile error, `AXL388`. The four accepted units are `sec`, `min`, `hr` and `day`.

Before 1.5.0 an unrecognised unit compiled clean and applied **no limit at all**, while
`axl inspect` still printed the declared string. If you wrote a project against an earlier
version, recompile it — anything that now fails on `AXL388` was running unlimited.

### Can I use it with Claude, Cursor or Codex?

Yes. `axl serve` exposes an MCP endpoint at `/mcp` over Streamable HTTP that any MCP client
can connect to. Your actions become tools and your resources become MCP resources, with the
permission model applied identically to what a REST client gets.

### How do I report a security problem?

Not in a public issue. Use GitHub's private vulnerability reporting — see
[SECURITY.md](SECURITY.md), which also lists the behaviours that are by design and therefore
not vulnerabilities.

### How can I contribute?

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues describing a real problem are as useful as
pull requests, and often more so — a bug report with a minimal `.flow` file that reproduces
it is the single most valuable thing you can send.

---

Something missing here? [Open an issue](https://github.com/Silvercloud-labs/axl/issues).
