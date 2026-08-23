# AXL Language Specification v1

AXL (AI-native eXecution Language) is a declarative specification language designed to describe backend applications, entities, actions, workflows, and security rules in a way that is easily understood by both humans and AI agents.

## 1. Philosophy

* **Declarative**: Focus on *what* the application does, not *how* it does it.
* **Minimalist**: Avoid programming language constructs (no braces, semicolons, or complex expressions).
* **AI-Native**: Structured to be easily generated and parsed by Large Language Models.
* **Strict**: The compiler enforces referential integrity across the entire project before execution.

## 2. File Structure

An AXL project consists of up to 5 `.flow` files in a single directory:

1. `app.flow` (Required): Core application metadata.
2. `schema.flow` (Optional): Data entity definitions.
3. `actions.flow` (Optional): API endpoints and executable actions.
4. `workflows.flow` (Optional): Orchestration of multiple actions.
5. `auth.flow` (Optional): Security, permissions, and rate limiting rules.

## 3. Lexical Grammar

* **Identifiers**: `[a-zA-Z_][a-zA-Z0-9_]*`
* **Strings**: Double-quoted `"...""` with standard escape sequences (`\n`, `\t`, `\"`, `\\`).
* **Numbers**: Integers (`42`) and floats (`3.14`).
* **Versions**: Semantic version strings (`1.0.0`).
* **Comments**: Started by `--` and continue to the end of the line.
* **Whitespace**: Used as token separators. Indentation is aesthetic but recommended.

### Reserved Keywords

`APP`, `NAME`, `VERSION`, `DESCRIPTION`, `FRAMEWORK`, `LANGUAGE`, `DATABASE`, `BASE_URL`, `ENTITY`, `ACTION`, `RESOURCE`, `DESC`, `EVENT`, `INPUT`, `OUTPUT`, `ENDPOINT`, `WORKFLOW`, `STEP`, `END`, `PERMISSION`, `CONFIRM`, `RATE_LIMIT`, `REQUIRED`, `OPTIONAL`, `PUBLIC`, `AUTH`, `OTP`, `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `GENERATORS`.

### Built-in Types

* `String`, `Number`, `Float`, `Boolean`, `Null`
* `List<T>` (Generic list)

## 4. Syntax and Semantics

### 4.1. `app.flow`

An AXL project starts with the `app.flow` file. It describes the global application configuration, tech stack, and generator outputs.

```flow
APP bananazon
NAME "Bananazon"
VERSION 1.0.0
DESCRIPTION "Modern ecommerce platform"
FRAMEWORK SpringBoot
LANGUAGE Java
DATABASE PostgreSQL
BASE_URL https://api.bananazon.com

GENERATORS
  DIAGRAM
```

### Generators (AI Outputs)

AXL uses the `GENERATORS` block to define which AI-ready artifacts the compiler should produce. These are strictly used by `axl generate` and do not affect the runtime.

The following generator IDs are reserved:
- `DIAGRAM`: A visual workflow diagram representation.
- `AGENT`: AI agent manifests/scaffolding.
- `DOCS`: Semantic documentation for AI retrieval.
- `SDK_TS`: TypeScript SDK.
- `SDK_JAVA`: Java SDK.
- `SDK_PYTHON`: Python SDK.

### 4.2. `schema.flow`

Defines data models.

```flow
ENTITY <identifier>
  <identifier> : <type>
  <identifier> : <type>
```

### 4.3. `actions.flow`

Defines executable capabilities mapped to HTTP endpoints.

```flow
ACTION <identifier>
  DESC <string>
  INPUT
    <identifier> : <type> [REQUIRED | OPTIONAL] [DESC <string>]
  OUTPUT <type>
  ENDPOINT <HTTP_METHOD> <path>
  [EVENT <identifier>]
```

`EVENT` names the domain event this action produces on success. It is emitted **in
addition to** the generic `action.completed` lifecycle event, never instead of it, and is
delivered over WebSocket with the same fail-closed, identity-matched scoping every other
event uses. Two actions may not declare the same event name (`AXL351`), and a name may
not collide with a lifecycle event — the DSL cannot express one (they contain dots), and
`loadManifest` rejects a hand-edited manifest that does.

`OUTPUT` is mandatory. An action that returns nothing declares `OUTPUT Null` explicitly
rather than omitting the line.

The optional trailing `DESC` on an input line documents that one parameter. It is carried
into `manifest.json` and into the generated MCP tool schema, so a model calling the tool
sees what the parameter means instead of only its type:

```flow
ACTION create_task
  DESC "Create a task inside a project"
  INPUT
    project_id : String REQUIRED DESC "ID of the project the task belongs to"
    title      : String REQUIRED DESC "Short headline shown in task lists"
    due_date   : String OPTIONAL DESC "ISO-8601 date, e.g. 2026-08-31"
  OUTPUT Task
  ENDPOINT POST /projects/{project_id}/tasks
```

### 4.4. `resources.flow`

Declares read-only, non-mutating views of backend state — a cart, a profile, a live
value. The counterpart to an action, and deliberately a narrower primitive.

```flow
RESOURCE <identifier>
  DESC <string>
  OUTPUT <type>
  ENDPOINT GET <path>
```

A resource is addressed by name alone:

* **No `INPUT` block.** Parameterised reads are MCP "resource templates" and are not
  supported. Declare an `ACTION` if the read needs arguments (`AXL232`).
* **No `CONFIRM`.** An OTP gate exists so a human approves a mutation; there is nothing
  to approve on a read, so `CONFIRM` naming a resource is an error (`AXL334`).
* **`GET` only** (`AXL326`), and the path may not contain `{placeholders}` (`AXL328`) —
  with no inputs there would be nothing to fill them with.
* **`PERMISSION` is required** (`AXL329`), same as for actions, and uses the same
  `PUBLIC` / `AUTH` levels.
* **`RATE_LIMIT` is permitted.** A read being idempotent says nothing about what it
  costs, and a `PUBLIC` resource is an unauthenticated proxy to the backend.

`resources.flow` is optional, and unlike the other optional files its absence produces
no warning — most projects expose no resources at all.

Resources are compiled into a `resources` block in `manifest.json`, separate from
`actions`, and are served at `GET /resources/:name` over REST and through MCP's
`resources/list` and `resources/read` — as resources, never as tools.

### 4.5. `workflows.flow`

Defines ordered sequences of actions.

```flow
WORKFLOW <identifier>
  STEP <action_identifier>
  STEP <action_identifier>
END
```

### 4.6. `auth.flow`

Defines security policies for actions.

```flow
PERMISSION <action_or_resource_identifier> : PUBLIC | AUTH | ROLE <role> | OWNER <input>
CONFIRM <action_identifier> : OTP
RATE_LIMIT <action_or_resource_identifier> : <count>/<unit>
```

#### Rate limit values

`<count>` is a non-negative integer and `<unit>` is one of:

| unit | window |
|---|---|
| `sec` | 1 second |
| `min` | 1 minute |
| `hr` | 1 hour |
| `day` | 24 hours |

No other spelling is accepted. `100/hour` and `100/minute` are `AXL388`, with the
correct form given in the suggestion. The compiler and the runtime share one pattern so
that a value passing validation is always a value the engine enforces — before 1.5.0 they
were separate, and an unrecognised unit compiled clean while applying no limit at all.

#### Permission levels

| level | requires |
|---|---|
| `PUBLIC` | nothing |
| `AUTH` | a session |
| `ROLE <role>` | a session **and** a verified identity claim carrying `<role>` |
| `OWNER <input>` | a session **and** a verified identity subject equal to the `<input>` argument |

`ROLE` and `OWNER` read an identity claim from `X-AXL-Subject` and `X-AXL-Roles`. **Those
headers are honoured only when the server is started with `--trust-identity-headers`**,
and with the flag off both levels deny every request.

This is not optional strictness. AXL never validates the bearer token — auth is the
backend's job — so everything an ordinary client sends is attacker-controlled. A `ROLE`
gate reading a client-supplied header would be decoration: any caller could send
`X-AXL-Roles: admin`. The flag is the operator asserting that an authenticating gateway
sits in front and **overwrites** both headers on every request. It is the same posture
`--trust-proxy` already takes for `X-Forwarded-For`.

AXL still issues, stores and verifies nothing — it compares a claim it is handed. That is
a claim-check, not an identity system.

**What `OWNER` does not promise.** `OWNER user_id` asserts that the caller''s subject equals
the `user_id` *argument*. It cannot assert that the caller owns the underlying record —
that needs a backend lookup, which is a backend concern. Use it for "you may only act on
your own id", not for "you may only delete tasks you created" unless the task''s owner is
itself an argument. `OWNER` is rejected on a `RESOURCE` (`AXL362`), which has no inputs to
compare against, and rejected when it names something that is not an input of the action
(`AXL363`).

## 5. Validation Rules

The compiler enforces strict referential integrity:

* **Uniqueness**: Entities, actions, resources, workflows, and fields within an entity must have unique names. An action and a resource may not share a name (`AXL306`), because `PERMISSION`/`CONFIRM`/`RATE_LIMIT` reference them by bare name.
* **References**: Types used in fields/inputs/outputs must be primitives, `List<T>`, or defined entities.
* **Integrity**: `STEP`, `PERMISSION`, `CONFIRM`, and `RATE_LIMIT` must reference defined actions.
* **Completeness**: Every action must have an `OUTPUT` (`AXL320`) and a `PERMISSION` (`AXL322`) defined. A missing `ENDPOINT` is a warning (`AXL321`) and defaults to `GET /`; a missing `DESC` is a warning (`AXL323`), because an empty description degrades MCP tool selection without making the action wrong.
* **Cycles**: Circular references between entities are prohibited.

## 6. Compiler Architecture

The AXL Compiler is fully typed and implemented in TypeScript. It operates in distinct phases:

1. **Lexer**: Character-by-character tokenization (`packages/compiler/lexer.ts`).
2. **Parser**: Recursive-descent AST generation (`packages/compiler/parser.ts`).
3. **Validator**: Semantic cross-AST checks (`packages/compiler/validator.ts`).
4. **Manifest Generator**: JSON generation for the runtime (`packages/compiler/manifest.ts`).

### Output

The compiler produces a single `manifest.json` file. The AXL runtime (engine and MCP server) consumes *only* this JSON file, entirely decoupling execution from parsing.
