# PayPal Sandbox checkout

The app now supports server-side PayPal order creation and capture for accepted
quotes, including verified guest private links. It is **sandbox only**, uses USD,
and supports totals from $0.01 to $10,000. No real money is collected.

## Setup

1. Sign into the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
   Create/select a **Sandbox** REST app tied to a sandbox business account. Use a
   separate sandbox **personal** account as the demo buyer.
2. Add these values to your local `.env` (never paste the secret into chat, Git,
   browser code, or a `VITE_` variable):

   ```dotenv
   PAYPAL_SANDBOX_CLIENT_ID=your-sandbox-app-client-id
   PAYPAL_SANDBOX_CLIENT_SECRET=your-sandbox-app-secret
   PAYPAL_SANDBOX_MERCHANT_ID=your-sandbox-business-merchant-id
   PAYPAL_DEMO_BUSINESS_ID=your-quoteflow-business-id
   ```

   The merchant ID belongs to that sandbox seller account. The QuoteFlow business
   ID is the ID in the business's Website widget URL (`/widget/BUSINESS-ID`).
   A fresh database has a new owner ID. Use its actual ID; never copy an ID from an old demo.
3. Restart `npm run dev`. Keep `APP_ORIGIN` equal to the exact browser origin.
   A custom domain is not needed for this same-computer demo. If PayPal requires
   an HTTPS return URL in your account/setup, use an HTTPS development URL and
   update APP_ORIGIN. Do not expose the demo database publicly.
4. The business approves a request and its unit price. The customer accepts it.
5. On the accepted request, select **Prepare PayPal Sandbox checkout**, then
   **Open PayPal Sandbox**. Sign in with the sandbox buyer and approve.
6. Return to the original QuoteFlow tab and select **Complete sandbox payment**.
   QuoteFlow queries PayPal, captures the stored order, and verifies the completed
   capture. Both sides see a sandbox receipt and receive in-app notifications.
   Email receipts/alerts use the existing email queue; local preview does not
   deliver a real email. The confirmation message links back to the request.

The return page is informational. Its URL and query parameters never prove that
payment succeeded. If the original tab was closed, reopen the customer's private
email link or sign in again. No private-link token is sent to PayPal.

## What is verified

- Server derives price and quantity from the accepted quote; browser totals and
  order IDs are ignored. One durable payment record per quote.
- Only its customer (account session or verified guest token) can create/capture.
  Its business can inspect the receipt and check provider status.
- PayPal order ID, intent, quote reference, invoice ID, merchant, USD currency,
  total, completed capture status, final-capture flag, and capture amount must match.
- Stable create/capture request IDs survive restart. Database leases serialize
  checkout calls, and lookup recovers a completed capture after a lost response.
- Ambiguous create/capture retries stop after one hour instead of creating a new
  payment. Existing order status can still be checked. No automatic replacement
  orders; unresolved or expired orders need manual review in the sandbox dashboard.
- A non-completed capture is shown as unresolved, never paid; no second capture
  is attempted. Notifications are deduplicated with the saved receipt.
- Server calls only api-m.sandbox.paypal.com; redirects only to the exact sandbox
  checkout host. Credentials stay on the server. No new dependencies required.

## Verification and remaining work

Automated tests use simulated PayPal responses. They cover account authorization,
private-link verification, pricing tampering, invalid provider details, duplicate
clicks, persistent receipts, concurrent calls, interrupted responses, and the
sandbox-only transport. A real PayPal Sandbox capture was verified on November 11, 2026: $300.00 USD, capture `28909158BV5205426`, request `361af87b-fd07-4ad6-9cbb-8122e3c11e3c`. Both accounts saw the receipt; the owner completed all job stages and the customer downloaded the final receipt. See [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md). The private presentation database and credentials are excluded from the public source.

This is a single-merchant demo integration, not a marketplace. Other QuoteFlow
businesses cannot take payments through the configured merchant. Refunds,
disputes, verified PayPal webhooks, automatic background reconciliation, shipping,
taxes, merchant onboarding, live payments, and production compliance/security
review remain outside this demo. A customer or business must explicitly check
status if capture is delayed. Dashboard “accepted value” remains quoted value,
not real collected revenue. Do not fulfill real orders based on sandbox receipts.

References: [Orders create](https://developer.paypal.com/api/orders/v2/orders-create),
[Orders capture](https://developer.paypal.com/api/orders/v2/orders-capture),
[PayPal request idempotency](https://developer.paypal.com/api/rest/reference/idempotency/).

Latest local verification: **46 tests passed**, ESLint and production build passed.
The November 11 browser flow also verified actual PayPal Sandbox payment and
customer-visible job completion. No real money or outbound email was involved.
For a fresh installation use [JUDGE_SETUP.md](JUDGE_SETUP.md).
