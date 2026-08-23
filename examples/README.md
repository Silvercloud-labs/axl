# Examples

Every project here compiles with the CLI in this repository. If one does not, that
is a bug — please open an issue.

```bash
cd examples/<name>
axl compile
axl inspect ./build
```

| Example | Start here if you want to see | Size |
|---|---|---|
| [hotel-booking](hotel-booking) | Everything, in one project — all four permission levels, both primitives, confirm gates, and every control-flow construct | 11 actions, 2 resources, 3 workflows |
| [taskdeck](taskdeck) | A small, realistic project — the shape most codebases actually start at | 6 actions, 3 workflows |
| [bananazon](bananazon) | An e-commerce surface with a broad action catalogue | Storefront actions |
| [payment-checkout](payment-checkout) | Splitting an asynchronous, externally-completed payment across workflow steps | Checkout workflow |

**Read [hotel-booking](hotel-booking) first.** It is the only one built to exercise
the whole feature set, and its README explains why several of the restrictions
exist rather than only that they do.

---

## What an example is not

None of these ship a backend. AXL compiles a specification and proxies to the
backend at `BASE_URL`; it does not implement one. Invoking an action against a
project with nothing listening returns `BACKEND_ERROR`, which is AXL behaving
correctly.

To watch the routing without writing a backend, read the discovery documents:

```bash
axl serve
curl -s http://127.0.0.1:3939/.well-known/axl
```

## Adding an example

An example earns its place by showing something the others do not. If you add
one:

- It must compile with the CLI in this repository, from a clean checkout.
- Its README must describe what is actually in the `.flow` files. A README
  describing capabilities the project does not have is worse than no README —
  it is the first thing a newcomer trusts.
- Add a row to the table above saying what it is for.
