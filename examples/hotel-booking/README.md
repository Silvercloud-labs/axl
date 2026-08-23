# Hotel Booking

The reference example. It exercises every permission level, both primitives, the
confirmation gate, and each workflow control-flow construct — in one project that
compiles.

Read this one first if you want to see what a complete `.flow` project looks like.

```bash
cd examples/hotel-booking
axl compile
axl inspect ./build
```

---

## What it demonstrates

| Feature | Where |
|---|---|
| `PUBLIC` capabilities | `search_hotels`, `list_rooms`, `register`, `featured_hotels` |
| `AUTH` capabilities | `create_booking`, `cancel_booking`, `my_bookings` |
| `ROLE` permissions | `refund_booking : ROLE staff`, `close_hotel : ROLE admin` |
| `OWNER` permissions | `update_profile : OWNER user_id` |
| `RESOURCE` (read-only) | `featured_hotels`, `my_bookings` |
| `CONFIRM : OTP` gates | `cancel_booking`, `refund_booking`, `close_hotel` |
| `RATE_LIMIT` | Every `PUBLIC` capability, plus `refund_booking : 10/day` |
| `IRREVERSIBLE` / `EFFECTS` / `SIDE_EFFECTS` | `cancel_booking`, `refund_booking`, `close_hotel` |
| Named domain `EVENT`s | `GuestRegistered`, `BookingCreated`, `PaymentCaptured`, `BookingCancelled` |
| Per-input `DESC` | Every `INPUT` line |
| `PARALLEL` | `BookingCheckout` |
| `RETRY` / `TIMEOUT` | `BookingCheckout`, `BookingCancellation` |
| `IF` / `ELSE` | `BookingCancellation` |
| `SWITCH` / `CASE` / `DEFAULT` / `WAIT` | `PostStayFollowUp` |

## Project structure

```
hotel-booking/
├── axl.config.json          paths; its presence plus flow/ is what marks a project
└── flow/
    ├── app.flow             metadata, backend BASE_URL, generator outputs
    ├── schema.flow          User, Hotel, Room, Booking, Payment, Refund
    ├── actions.flow         11 mutating capabilities
    ├── resources.flow       2 read-only views
    ├── workflows.flow       3 workflows
    └── auth.flow            permissions, confirm gates, rate limits
```

## What compiling produces

```
11 action(s), 2 resource(s), 3 workflow(s)
4 reachable without a session (PUBLIC)
3 declared IRREVERSIBLE
```

That first count is the line worth reading before any deploy. Every `PUBLIC`
capability is an unauthenticated proxy to the backend behind `BASE_URL`.

---

## Three things this example is built to show

### 1. `ACTION` and `RESOURCE` are different primitives

`featured_hotels` is a `RESOURCE`, not a zero-argument action. It compiles to
`GET /resources/featured_hotels` and registers through MCP's `registerResource`,
so it appears in `resources/list` and stays out of the tool menu a model picks
from. A resource takes no `INPUT`, allows no `{placeholders}` in its path, and
cannot carry a `CONFIRM` — there is nothing to approve on a read.

### 2. `PARALLEL` restricts what it accepts, on purpose

```flow
PARALLEL
  STEP charge_booking    USING booking_id = create_booking.id RETRY 3 TIMEOUT 5000
  STEP reserve_inventory USING booking_id = create_booking.id TIMEOUT 3000
END
```

Both members depend only on `create_booking`, never on each other — a member
cannot bind from a sibling, because members are dispatched together and a
sibling's output does not exist yet.

No `CONFIRM` is allowed inside the block. That is the load-bearing restriction: a
pause writes one record keyed by one token, so two members pausing would need
two, and members that already finished have committed side effects that cannot be
replayed.

**A failure does not roll back siblings.** If `reserve_inventory` fails after
`charge_booking` succeeded, the guest has really been charged. The thrown error
names what committed. AXL has no compensation mechanism, and this example does
not pretend otherwise.

### 3. `ROLE` and `OWNER` deny everything by default

`refund_booking` and `close_hotel` are `ROLE`-gated, and they will reject **every**
request unless the server runs with `--trust-identity-headers`:

```bash
axl serve --trust-identity-headers
```

Only set that flag behind a gateway that authenticates the caller and
**overwrites** `X-AXL-Subject` and `X-AXL-Roles` on every request. AXL never
validates the bearer token, so without such a gateway any caller could simply send
`X-AXL-Roles: staff`. Denying by default is the correct behaviour, not a
configuration bug.

`update_profile : OWNER user_id` asserts the caller's subject equals the `user_id`
*argument*. It cannot assert the caller owns some other record — that needs a
backend lookup, which is a backend concern.

---

## Running it against a backend

The manifest points at `http://localhost:3000/api`. AXL proxies to that backend;
it does not implement it. To see the routing without writing one, start the
server and read the discovery documents:

```bash
axl serve
curl -s http://127.0.0.1:3939/.well-known/axl
curl -s http://127.0.0.1:3939/manifest.json
```

Calls to actions will return `BACKEND_ERROR` until something is listening on
`BASE_URL` — that is AXL working correctly, not a failure of the example.
