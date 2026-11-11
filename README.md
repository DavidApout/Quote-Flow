# QuoteFlow AI

QuoteFlow connects customer requests, AI-assisted clarification, business-controlled
quotes, PayPal Sandbox checkout, and job updates for small service businesses.

**Judges: start with [JUDGE_SETUP.md](JUDGE_SETUP.md)** for a fresh installation,
fictional accounts, and provider configuration. See [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md)
for the November 11 verified $300 test payment and completed job. Submission copy
and the recording plan are in [SUBMISSION.md](SUBMISSION.md) and [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md).
Browser evidence: [live AI review](docs/images/live-ai-review.jpg),
[completed test payment and job](docs/images/customer-job-completed.jpg).
Source is available under the [MIT license](LICENSE). Dependencies keep their own licenses.
The app is a local demo; email previews send nothing and PayPal uses test money.

React/Vite frontend with a Node.js account and quote backend, using SQLite. Requires Node 24 or later. No external account service or database subscription is needed for local development.

## Start locally

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. This one command starts both the API and Vite. Stop any older Vite server using port 5173 first. `npm run preview` previews frontend assets only and cannot run accounts; use `npm run dev` for the complete local app.

1. Create a **Business owner** account with your business name. Save the recovery code shown once after registration.
2. Add services and prices, or use **Import my earlier services** if you have a catalog from the earlier browser-only demo.
3. Sign out and create a **Customer** account (use another browser/profile to stay signed in as both roles).
4. Select the business and submit a listed or custom quote request.
5. Sign in as the business to review the request and approve or reject it. Customers can accept or decline approved quotes.

The workspace refreshes every 15 seconds, when focused, or using the Refresh button. Each browser shares one account session across its tabs. A person's role is set at account creation; changing a browser view cannot grant business permissions.

## Accounts and data

- Passwords are salted and hashed using asynchronous scrypt. Plaintext passwords are never stored.
- Random session tokens use HttpOnly, SameSite cookies. Only hashed tokens are stored in the database. Sessions expire after seven days and are revoked on logout or account recovery.
- Recovery uses a one-time private code shown on signup. A successful reset revokes all sessions and replaces the code. Email verification and notification delivery support local previews or a configured email provider; account password recovery uses the recovery code, not an email reset link. An unverified email login is not proof of address ownership. Losing both the password and recovery code requires a separate operator recovery process; none is exposed publicly.
- API checks enforce account roles and ownership, price validation, and allowed quote status changes. Customer totals and ownership claims are never trusted.
- Mutations require the configured origin and a custom request header. Cross-origin access is not enabled. Rate limiting applies to authentication attempts; hashing concurrency is bounded.
- Data lives in `data/quoteflow.sqlite` by default and persists across restarts. Database files are excluded from Git. Back up the database using SQLite's backup mechanism or stop the server before copying its database files.
- The previous localStorage demo values are left intact. Services can be imported explicitly into a business account. Old unowned demo quotes are not assigned to real accounts automatically. New quotes and services are saved in the database; only the theme remains browser-local.
- Business AI review has a server integration (see below); live validation requires an API key. PayPal Sandbox checkout is implemented; a real sandbox capture was verified on November 11. Setup and remaining limitations are in [PAYPAL_DEMO.md](PAYPAL_DEMO.md).

## Tests

```sh
npm test
npm run lint
npm run build
```

Tests use temporary databases and local ephemeral HTTP ports. They cover role isolation, quote ownership and transitions, trusted pricing, CSRF protections, session revocation/expiry, persistence, recovery codes, rate limits, and legacy storage validation.

## Hosting later

This is a working local account system, not a deployed service. To use it across devices, deploy the app on a Node 24+ host with a persistent disk and HTTPS. A static-only host or ephemeral filesystem will not support this backend.

```sh
npm run build
APP_ORIGIN=https://your-domain.example HOST=0.0.0.0 PORT=5173 npm start
```

`npm start` serves the built frontend and API together and requires an HTTPS APP_ORIGIN. Terminate TLS at a trusted reverse proxy; production cookies are Secure. APP_ORIGIN must exactly match the public URL, with no trailing slash. Configure DATABASE_PATH to a persistent location. Keep the API behind the same origin. The rate limiter is in process and currently keys on the direct peer address; behind a proxy it applies shared limits rather than trusting spoofable forwarding headers. Before opening public registration at scale, configure verified email/recovery delivery, durable distributed rate limits if running multiple processes, backups, monitoring, and an account deletion/support process.

Implementation references: [Node crypto](https://nodejs.org/api/crypto.html), [Node SQLite](https://nodejs.org/api/sqlite.html), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Business AI review assistant

Customers can use the guided request assistant or the existing form. In the business inbox, use **Review with AI** on a
pending request to get:

- A brief summary of what the customer asked for.
- Missing details and suggested follow-up questions.
- Up to three possible matches from this business's catalog. Prices and totals
  are calculated on the server from saved rates and the request quantity.
- An editable reply draft with **Save reply draft** and **Copy reply**.

Reviews and saved reply edits persist in SQLite (`quote_reviews`). Repeated clicks
reuse the saved review rather than calling the provider again. Suggestions do not
change the service, price, or quote status; the owner still edits and approves.
Saving or copying a draft sends nothing. **Send reply to customer** explicitly
delivers the edited text to the request conversation. Unsaved reply edits are labeled and
must be saved before navigating away. Matches are alternatives, not combined
line items, and show catalog prices at review time.

Set `OPENAI_API_KEY` in your private `.env` (never commit it). The existing
`OPENAI_MODEL` setting is retained, defaulting to `gpt-4.1-mini`. Restart the Node
server after server-code or configuration changes; a browser refresh alone does
not reload backend code. API access and billing are required.

The provider receives the stored request's service name, quantity and description,
and the owning business's catalog IDs/names. Account names, emails, session tokens,
and catalog prices are not added to the payload. Free-text descriptions can still
contain personal information; the UI discloses the transfer. The Responses API
request uses `store: false`. AI text can be wrong; check it before using it.

Access is owner-only, including reading or editing saved reviews. The server looks
up the quote and catalog itself, applies a limit of 10 new review attempts per
15 minutes per owner (per process), and prevents concurrent review calls for the
same request. Errors, refusals, incomplete results, unknown service IDs, and
malformed outputs produce a readable error without changing the quote. Empty
catalogs are supported for custom work. No automatic retries or messages occur.

`npm test` covers provider validation with mocked responses, ownership and CSRF
checks, saved reply persistence, price integrity, rate limits, and failure recovery.
A live provider test requires explicit approval to send the chosen test data.

Implementation reference: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

A live fictional-data business review passed on November 11, 2026 using
gpt-4.1-mini, and the saved result was verified in the business browser. It
identified missing details and matched the shirt service while the server
calculated $300. No message, approval, or payment was sent by AI. See
[AI_VERIFICATION.md](AI_VERIFICATION.md). Earlier credential errors are historical.
Fresh-source installation, the quote workflow, 46 tests, lint, and build also
passed. See WIDGET_GUIDE.md for separate widget/notification verification.

## Customer assistant and request conversations

The customer workspace starts with **Help me describe it**. The guide collects an
idea, chosen catalog service (or custom work), quantity, timing, and job details.
Its detail question adapts to categories such as shirts, catering, design,
photography, cleaning, or custom work. These steps are local rules, not generative
AI, and work without an API key. It preserves the customer's wording in an editable
summary. **Use this request** fills the existing QuoteForm; the customer must still
preview and explicitly submit. Catalog estimates use stored unit prices; custom
requests wait for business pricing. Guide drafts are held in memory and are lost
on refresh or switching modes/businesses; submitted requests persist in SQLite.

The optional **Get an AI follow-up** sends the current summary, quantity, selected
service and that business's catalog names/IDs to the existing provider integration.
It returns one suggested question without saving a request, inventing a price,
or approving anything. Customers can answer and explicitly add it to their summary.
There are 10 attempts per 15 minutes per customer, per server process. Provider
errors leave the editable summary usable. No new live provider calls were made
for this feature; previous credential/access rejection remains unresolved.

Both parties can open **Messages & questions** on a submitted request. Business
owners can write a question or send their edited AI reply. Customers can reply from
the same request card. Only the request's customer and business owner can read or
write messages. Names, roles, quote ownership, and timestamps are server assigned;
the client cannot impersonate another sender. Messages persist in `quote_messages`.
Each message is limited to 3,000 characters, each conversation to 100 messages,
and sending to 30 messages per 15 minutes per account (per process). Messages
never change the approved price or status. A scope change needs owner review.

Open conversations refresh every 15 seconds, on window focus, or via Refresh
messages. Email notifications and unread updates are now available through the notification
center and private guest pages; attachments and message editing/deletion are not. Conversation text is not automatically included in a saved
AI review; the business should read it before approving. The existing AI review is
a snapshot, not an ongoing autonomous agent.

Validation: 22 automated tests passed, including conversation isolation, sender
identity, empty/oversized message rejection, persistence after restart, assistant
catalog scoping, and no automatic quote creation. Browser testing confirmed the
guided shirt request, $300 preview, submission, and appearance in the owner inbox;
phone width had no horizontal overflow. The browser's message send/reply check
was interrupted by the automation service and remains unverified visually;
its API workflow passed the automated tests.
