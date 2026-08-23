# Payment-Link Checkout Example

This example demonstrates how to orchestrate a complex checkout flow that requires an asynchronous, external payment link using AXL workflows.

## Separation of Checkout Steps

Instead of a monolithic `checkout` action, this workflow divides the checkout process into three distinct steps:

1. **`checkout`** — Creates the initial order and returns an `orderId`.
2. **`create_payment_link`** — Takes the `orderId` and returns a `paymentUrl`, `paymentId`, and `expiresAt`.
3. **`verify_payment`** — Takes the `paymentId` and confirms the payment status.

## How it works with Thunderstrike

- Thunderstrike (or any other client) receives the `paymentUrl` from the AXL Server exactly like any other action output. There's nothing special about it being a URL within AXL's runtime.
- Thunderstrike opens that `paymentUrl` for the user in a browser or web view. The actual payment flow happens entirely outside of AXL.
- The backend verifies the payment (via webhook or polling, depending on the backend implementation) independently of AXL.
- The workflow's `verify_payment` step is how the client later confirms the result through AXL, once it has the `paymentId` to check.

This separation keeps AXL provider-agnostic, meaning the same AXL workflow structure works whether the backend uses Stripe, Razorpay, or any other payment gateway.
