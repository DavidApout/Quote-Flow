# Today's working MVP — November 1, 2026

## Open it

The main project is `/Users/davidapout/quoteflow-ai`.
The tested MVP changes have been applied here. Existing secrets, accounts, and
database were preserved. Sample accounts were not added to the main database. ServiceEditor, QuoteForm,
QuoteCard, account recovery, AI integration code, and backend authorization remain.

The separate demo copy runs at http://127.0.0.1:5178. To start this main project:

```sh
cd /Users/davidapout/quoteflow-ai
npm run dev
```

Optional: with the separate demo server running on port 5178, this command creates sample accounts there. It does not seed the main server on port 5173:

```sh
node scripts/demo.mjs
```

Created in the separate demo copy only (not in this main database):

- Business: `owner@quoteflow.test`
- Customer: `customer@quoteflow.test`
- Password for both: `QuoteFlow local demo 2026!`

These intentionally public credentials are for this local demo only. Never deploy
this demo database. The setup can be rerun without duplicating the sample catalog
or requests. If you move the source to another computer, run `npm ci` first
(Node 24+ required).

## Five-minute walkthrough

1. Sign in as the owner. Overview shows real counts and accepted quote value, not revenue.
2. Open Services. Add or edit a service and its unit price.
3. Copy the customer link from Overview. Sign out and open that link, or use a separate browser profile. Tabs in the same browser share one login.
4. Sign in as the customer. Choose a service, enter quantity and details, preview manually, and submit for approval. Custom requests work without a catalog price.
5. Sign in as the owner. Open Request inbox, search by customer/service/details, and filter by Pending review. Change the final unit price and approve, or reject.
6. Sign in as the customer, accept or decline the approved quote, and reload. Status and prices remain saved.

The browser test already completed a concrete example: three social media designs
at $65 each ($195), owner approval at $70 each ($210), then customer acceptance.
That request remains in the demo as proof. Two other sample requests await review.

## What changed, in plain language

- `src/App.jsx`: three business views; actual activity counts; inbox search and
  filters; customer links that remember the business; final-total preview while
  the owner edits the unit price; short request references.
- `src/App.css`: responsive dashboard, summary cards, clearer request cards, and
  small-screen layouts. Existing light/dark mode is preserved.
- `scripts/demo.mjs`: explicit local sample-data setup using the existing API.
- `tests/accounts.test.mjs`: added restart-persistence coverage for the full
  quote workflow, including preservation of the requested price after catalog edits.

The backend already uses SQLite, so replacing it with browser-only storage would
lose functionality. Services, requests, approvals, accounts, and sessions are saved
in `data/quoteflow.sqlite`. Keep that folder if you want to keep the demo history.

## Verification

- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: 15 tests passed, including access restrictions, trusted pricing,
  status transitions, account recovery, mocked AI, and server-restart persistence.
- Browser: customer submission → owner inbox → edited approval → customer
  acceptance → refresh persistence passed. Search and approved-status filter passed.
- Browser: added a service and changed its price from $40 to $45 successfully.
- Responsive checks: customer and business screens checked at phone width;
  desktop dashboard checked at wide width. No horizontal page overflow in checked views.

## Deliberate limits and next steps

1. **AI:** existing draft integration and mocked tests are retained. No live AI
   call was made; this copy has no API key. Configure a key privately and validate
   one catalog-based draft before demonstrating AI. Manual quoting works now.
2. **PayPal:** no checkout, payment capture, refunds, or verified payment webhook.
   Accepted quote value is not paid revenue. Next: sandbox create/capture flow
   on the server, with verified and idempotent payment updates.
3. **Customer entry:** `/request?business=...` is an account-based request-page
   foundation. It is not an anonymous form or cross-site embedded widget.
   Production security headers currently block iframe embedding.
4. **Hosting:** local only; links do not work from another device. Existing
   role/ownership checks are tested, but this is not production-certified
   multi-business hosting. Before public use: HTTPS, persistent storage/backups,
   verified email and recovery delivery, operational monitoring, abuse controls,
   and a security review. Use fresh accounts, not this demo database.
5. **Editing:** owners edit the final unit price before approval. Changing quantity,
   line items, or already-approved quotes requires a future revision workflow.
6. **Notifications:** inbox refresh is manual, on focus, or every 15 seconds;
   there is no email or real-time push notification.
7. **Development:** another local Vite app is using the default live-update socket
   port. Normal pages/API work; reload after source changes if automatic updates
   do not appear. This does not affect a production build.

Recommended next milestone: demonstrate this manual workflow, then finish and test
PayPal Sandbox end-to-end before expanding features.
