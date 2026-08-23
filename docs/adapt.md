# Importing an existing API

`axl adapt` reads an API specification and writes a `.flow` project. It is a starting point
that requires review, and it is built to make that unavoidable rather than optional.

```bash
axl adapt openapi ./openapi.yaml --out ./my-app
```

Supports OpenAPI 3.0 and 3.1.

---

## What it produces

The same shape `axl init` produces, so `axl compile` works immediately afterward:

```
my-app/
├── axl.config.json
└── flow/
    ├── app.flow
    ├── schema.flow
    ├── actions.flow
    └── auth.flow
```

It emits `.flow`, never `manifest.json`. Generated output still passes through the ordinary
compiler and validator, so an import that produces something invalid fails the same way
hand-written source would.

---

## Every imported action is `AUTH`

> **Never `PUBLIC`, under any inferred condition, and no `CONFIRM` gate is ever generated.**

This is the whole design of the adapter, and it is not negotiable:

- **`security: []` on an operation overrides the spec's global HTTP auth requirement.** It
  says nothing about whether that endpoint is safe to expose unauthenticated, and it is the
  most tempting thing in a spec to misread as "this one is public".
- **A spec's own auth documentation is routinely incomplete or stale.** Silence is not
  evidence of intent.
- **`CONFIRM` is a business-risk judgement.** `DELETE /sessions` and `DELETE /accounts` are
  the same verb. Inferring a gate from the method is guessing; inferring none while looking
  thorough is worse.

Every generated `PERMISSION` carries a `REVIEW REQUIRED` marker, and `auth.flow` opens with
a banner:

```flow
-- ============================================================
-- REVIEW REQUIRED
-- Imported permissions default to AUTH. Nothing here reflects a
-- judgement about what is safe to expose. Read every line.
-- ============================================================

PERMISSION list_products  : AUTH   -- REVIEW REQUIRED
PERMISSION create_order   : AUTH   -- REVIEW REQUIRED
```

**Generated output requires human review before it is trustworthy to serve.** That is a
property of the design, not a limitation to engineer around.

---

## What it will not guess

Unmappable constructs are marked `TODO` rather than silently approximated:

| Construct | Why it cannot be mapped |
|---|---|
| `oneOf` / `anyOf` / `allOf` | AXL types are closed; a union has no representation |
| Free-form objects | No field list to generate an `ENTITY` from |
| Missing 2xx response | Nothing to derive `OUTPUT` from, and `OUTPUT` is mandatory |
| Non-semver `info.version` | `VERSION` requires semver |
| Relative or absent `servers[0].url` | `BASE_URL` must be absolute |

A `TODO` is a compile error waiting to happen, which is the intent — it surfaces at
`axl compile` rather than at runtime.

---

## Review checklist

1. **Read every `PERMISSION` line.** Decide `PUBLIC`, `AUTH`, `ROLE` or `OWNER` per action.
   Delete the `REVIEW REQUIRED` marker as you go so the remaining ones mean something.
2. **Add `CONFIRM` to anything destructive.** Nothing was generated.
3. **Add `RATE_LIMIT` to everything you marked `PUBLIC`.**
4. **Add `IRREVERSIBLE`, `EFFECTS` and `SIDE_EFFECTS`** to actions an agent might call —
   see [Consequence metadata](language.md#consequence-metadata).
5. **Write real `DESC` text** on actions and inputs. Imported descriptions come from the
   spec's `summary`, which is written for humans reading docs, not for a model deciding
   whether to call something.
6. **Split `actions.flow`** if the import is large. Nothing requires one file.
7. Run `axl inspect ./build` and read the "reachable without a session" count.

---

## Related

- [Permissions and rate limiting](permissions.md) — what to set each action to
- [The `.flow` language](language.md) — what you are editing
- [CLI reference](cli.md) — other commands
