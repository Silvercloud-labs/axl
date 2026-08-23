# The `.flow` language

A practical tour. For the formal grammar, reserved keywords and complete validation rules,
see [SPECIFICATION.md](../SPECIFICATION.md).

---

## Project shape

A project is up to six files in one directory. Only `app.flow` is required.

| File | Required | Declares |
|---|---|---|
| `app.flow` | Yes | Application metadata, backend `BASE_URL`, generator outputs |
| `schema.flow` | No | `ENTITY` data models |
| `actions.flow` | No | `ACTION` — mutating capabilities |
| `resources.flow` | No | `RESOURCE` — read-only views |
| `workflows.flow` | No | `WORKFLOW` — ordered orchestration |
| `auth.flow` | No | `PERMISSION`, `CONFIRM`, `RATE_LIMIT` |

Syntax is deliberately minimal: no braces, no semicolons, no expressions. Comments start
with `--`. Indentation is aesthetic — the parser ignores it.

`axl init` scaffolds five of the six. `resources.flow` is left out because most projects
expose no resources, and unlike the other optional files its absence produces no warning.
Add it when you need one.

---

## The two primitives

`ACTION` and `RESOURCE` are separate end to end — separate manifest maps, separate REST
route families, separate MCP primitives. They are not one concept with a flag.

| | `ACTION` | `RESOURCE` |
|---|---|---|
| Semantics | Mutating | Read-only |
| REST | `POST /actions/:name` | `GET /resources/:name` |
| MCP | Tool (`tools/list`, `tools/call`) | Resource (`resources/list`, `resources/read`) |
| `INPUT` | Yes | No — rejected (`AXL232`) |
| HTTP methods | Any | `GET` only (`AXL326`) |
| Path placeholders | Yes | No (`AXL328`) |
| `CONFIRM` | Yes | No — rejected (`AXL334`) |
| `PERMISSION` | Required (`AXL322`) | Required (`AXL329`) |
| `RATE_LIMIT` | Yes | Yes |
| Idempotency cache | Yes | Skipped — a read has no side effect to deduplicate |

A resource skips the idempotency cache because entries carry a 24-hour TTL and a resource
is by definition a live value; a cache hit would serve a stale one. It keeps rate limiting
because idempotent says nothing about cheap, and a `PUBLIC` resource is an unauthenticated
proxy to your backend.

---

## Types

| Category | Types |
|---|---|
| Primitives | `String`, `Number`, `Float`, `Boolean`, `Null` |
| Generic | `List<T>` |
| User-defined | any `ENTITY` declared in `schema.flow` |

Every type reference is resolved at compile time. Circular entity references are rejected
(`AXL342`).

---

## A complete project

```flow
-- app.flow
APP taskdeck
NAME "TaskDeck"
VERSION 1.0.0
DESCRIPTION "Project and task tracking"
BASE_URL https://api.taskdeck.example

GENERATORS
  DIAGRAM
```

```flow
-- schema.flow
ENTITY Task
  id         : String
  project_id : String
  title      : String
  done       : Boolean
```

```flow
-- actions.flow
ACTION create_task
  DESC "Create a task inside a project"
  INPUT
    project_id : String REQUIRED DESC "ID of the project the task belongs to"
    title      : String REQUIRED DESC "Short headline shown in task lists"
    due_date   : String OPTIONAL DESC "ISO-8601 date, e.g. 2026-08-31"
  OUTPUT Task
  ENDPOINT POST /projects/{project_id}/tasks
  EVENT TaskCreated
```

```flow
-- auth.flow
PERMISSION create_task : AUTH
RATE_LIMIT create_task : 30/min
```

Two things about that declaration are easy to miss:

`OUTPUT` is **mandatory**. An action returning nothing writes `OUTPUT Null` explicitly
rather than omitting the line, so "returns nothing" and "nobody wrote the line" stay
distinguishable.

The per-input `DESC` is carried into the **MCP tool schema**, so a calling model sees what
a parameter means rather than only its type. This is the highest-leverage thing you can
write in a `.flow` file if agents will be calling your API.

---

## Read-only views

```flow
-- resources.flow
RESOURCE featured_hotels
  DESC "Editorially curated hotels for the home page"
  OUTPUT List<Hotel>
  ENDPOINT GET /hotels/featured
```

```flow
PERMISSION featured_hotels : PUBLIC
RATE_LIMIT featured_hotels : 60/min
```

A resource takes no input and is served at `GET /resources/featured_hotels`, plus
`axl://resource/featured_hotels` over MCP.

---

## Consequence metadata

Optional, absent by default, and surfaced in the **MCP tool description** — the only
channel through which a calling model learns anything about an action beyond its name and
arguments.

```flow
ACTION delete_account
  DESC "Permanently close an account"
  INPUT
    user_id : String REQUIRED DESC "Account to close"
  OUTPUT Null
  ENDPOINT DELETE /accounts/{user_id}
  IRREVERSIBLE true
  EFFECTS "Removes the account and every project owned by it"
  SIDE_EFFECTS "Sends a deletion confirmation email"
```

`IRREVERSIBLE` accepts only a bare `true` or `false` (`AXL386`). All three are errors on a
`RESOURCE` (`AXL387`), which has no consequences to declare.

An agent deciding whether to ask its user before calling something has nothing else to go
on. Write these.

---

## Events

An action may name a domain event:

```flow
ACTION create_task
  EVENT TaskCreated
```

Named events are **purely additive** — emitted alongside `action.started` and
`action.completed`, never instead of them. Duplicate names across actions are a compile
error (`AXL351`). See [Wire protocol → Events](protocol.md#7-events).

---

## Related

- [SPECIFICATION.md](../SPECIFICATION.md) — formal grammar, keywords, validation rules
- [Workflows and control flow](workflows.md) — `WORKFLOW`, branching, `PARALLEL`, gates
- [Permissions and rate limiting](permissions.md) — `PERMISSION`, `CONFIRM`, `RATE_LIMIT`
- [Working with an AI agent](agents.md) — how to get an agent to write correct `.flow`
- [examples/](../examples) — four runnable projects
