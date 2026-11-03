# Website widget, private links, and notifications

This feature is implemented in the main project at `/Users/davidapout/quoteflow-ai`.
The existing account-based form, services, quote review, and customer conversations
remain available. Existing databases migrate additively at startup.

## Try the local demo

The separate fictional Studio North demo uses:

- Business workspace: http://127.0.0.1:5180
- Embedded website demonstration: http://127.0.0.1:5182
- Business login: `owner@quoteflow.test`
- Password: `QuoteFlow local demo 2026!`

These accounts and requests are in `/private/tmp/quoteflow-widget-demo.sqlite`,
not your main database. No real emails were sent. The demo website source is
`/Users/davidapout/Documents/ChatGPT/Paypal/output/widget-demo/index.html`.

To restart the isolated app demo:

```sh
cd /Users/davidapout/quoteflow-ai
PORT=5180 APP_ORIGIN=http://127.0.0.1:5180 DATABASE_PATH=/private/tmp/quoteflow-widget-demo.sqlite MAIL_MODE=preview npm run dev
```

To restart the fictional website in another terminal:

```sh
python3 -m http.server 5182 --bind 127.0.0.1 --directory /Users/davidapout/Documents/ChatGPT/Paypal/output/widget-demo
```

The sample site's iframe currently points to the existing demo business ID. If you
reset the demo database, replace that URL with the new one from Website widget.

## Enable it for your own business

1. Restart the main Node server after these changes (`npm run dev` for local use).
2. Sign in as a business owner and open **Website widget**.
3. Enable **Accept website requests**. Add the exact origins of your website,
   e.g. `https://yourbusiness.com` and `https://www.yourbusiness.com`.
4. Save. Copy the shareable request-page link or the supplied iframe HTML.
5. Paste the HTML into your website's custom HTML/embed area. The standalone
   page works without an embedding origin. A production site must use HTTPS.

Only `/widget/:businessId` can be embedded. Business accounts, private tracking,
and email-confirmation pages cannot be framed. Origins are limited to five exact
entries; no wildcards, paths, credentials, or trailing slashes are accepted.
The iframe does not require customer login or third-party cookies. The parent
website must itself allow the iframe's origin in its own Content Security Policy.

## Guest journey

1. Customer describes a project through the guided assistant or the basic form.
2. Customer reviews the catalog estimate (or custom-pricing placeholder), enters
   name and email, and explicitly submits.
3. The server saves the request using trusted catalog prices and queues email.
   A repeated submission with the same key does not create another request.
4. The customer receives a private link by email. It is **not** returned to the
   public submission caller. Clicking Confirm email on that page enables access.
5. The customer can view status, read and send messages, and accept or decline an
   approved quote. No password, account signup, or payment is required.
6. The widget's recovery form emails a fresh link to the newest matching request.
   Its public response does not reveal whether an email address exists.

Tracking tokens contain 32 random bytes, are stored as hashes in the access table,
are scoped to one request, and expire after 30 days. Tokens travel in URL fragments
and request headers rather than URL query parameters. Pages use no-referrer.
Treat a link like a password: anyone with it can act on that request. Emails queued
for delivery temporarily contain the link; the message body is removed after the
provider accepts it. Local preview bodies remain available to the relevant owner.
Renewal does not revoke older unexpired links. Self-service revocation and email
address correction are not yet implemented.

Guest identity is separate from an existing account with the same email; supplying
someone's email does not sign into that account or reveal its requests. The
production email link is proof of mailbox access, not proof of a person's identity.
Preview-mode confirmation only simulates this check.

## Notifications

| Trigger | Business | Customer |
| --- | --- | --- |
| New request | Unread alert + email when verified | Confirmation and private link |
| Business message | Message saved | Unread update + email |
| Customer reply | Unread alert + email | Reply shown on private page |
| Approval/rejection | Status updated | Unread update + email |
| Acceptance/decline | Unread alert + email | Confirmation + saved status |

Signed-in users use **Notifications** to verify email, open a request, mark updates
read, and inspect email status. Guest customers see unread updates on their private
page. The app polls at 15-second intervals; there is no push connection or SMS.
Messages and AI suggestions never automatically change pricing or approval.

## Local email previews

Development defaults to `MAIL_MODE=preview`: no provider requests or external
emails occur. Open **Notifications → Email status & previews → Preview email**.
A business can preview its own mail and guest mail for its requests. This is a
local test capability, not real customer privacy or email ownership verification.
The server rejects preview mode when started with `--production`.

## Connect real email

Use Resend with a verified sending domain. Keep these values server-side in your
private environment, never in a `VITE_` variable or committed file:

```dotenv
MAIL_MODE=resend
RESEND_API_KEY=your-private-provider-key
MAIL_FROM=QuoteFlow <quotes@your-verified-domain.example>
RESEND_WEBHOOK_SECRET=your-private-webhook-signing-secret
```

Configure a provider webhook for `email.delivered`, `email.bounced`, and
`email.complained`, pointing to `https://your-app-domain/api/mail/webhook`.
The server checks the signature and timestamp using the Svix library before
accepting a status update. Duplicate callbacks are ignored and late delivery
callbacks cannot hide a bounce or complaint.

Restart the server, sign in, and use **Send verification email**. Open its link and
confirm before enabling a production widget. Email verification links expire after
24 hours and are single-use. Production without configured mail keeps the widget
disabled. Existing preview/disabled outbox entries are not retroactively sent when
you change modes; create new test events after configuring the provider.

Only set `MAIL_MODE=resend` when ready to send: the worker begins processing eligible
queued messages every five seconds. No live provider credentials were configured
or real recipient deliveries tested during this implementation.

## Delivery reliability

- Requests/messages/status changes and their notifications are saved in the same
  database transaction. Provider outages cannot erase a request.
- SQLite holds the durable outbox. A worker processes it after the business action.
- Failed provider calls retry up to five times with exponential backoff. Each email
  reuses one idempotency key. Interrupted sends can resume after restart.
- Automatic retries stop before the provider's 24-hour idempotency window expires;
  uncertain old sends require operator inspection instead of risking duplicates.
- Unverified recipients wait. Previously bounced/complained recipients are suppressed.
- `sent` means provider accepted, `delivered` means a signed delivery callback was
  received, and neither means read. `bounced`, `complained`, and `failed` need attention.
- Invalid or unauthenticated callbacks cannot set delivery status.

Email may land in spam. Configure sender-domain DNS correctly, monitor failures,
and confirm real delivery before using this with customers. There is no UI for
manual retry, clearing suppression, or changing a recipient address yet.

## Verification and current boundaries

Final validation: **28 automated tests passed; lint and production build passed.**

Automated coverage includes guest access, exact website-origin settings, trusted
pricing, duplicate submission protection, existing-account isolation, private-link
confirmation/expiry, message/status flow, unread notifications, restart persistence,
email retry/exhaustion, production preview denial, and signed webhook handling.
All provider calls in automated tests are mocks; no external mail is sent.

Browser checks confirmed the widget renders inside a separate local website,
accepts text there, and completes the standalone guest guided flow through a
$300 preview and submission. The business inbox then showed the guest request
and an unread notification. Cross-frame button automation could not complete;
private-link/email-preview browser checks were later interrupted by the browser
service's usage-limit error. Those paths passed API tests, not completed visual tests.

For public hosting, configure HTTPS, a durable SQLite volume, backups, domain
email, and monitoring. Rate limiting is currently per process/direct peer IP;
shared proxy-aware abuse controls and CAPTCHA are still deployment work. Guest
AI follow-ups are intentionally disabled; the guided questions work locally.
Account-based AI still requires working provider access. PayPal Sandbox checkout
is implemented; see [PAYPAL_DEMO.md](PAYPAL_DEMO.md) for setup and limits. SMS, attachments,
custom branding controls, multi-server queues, token revocation UI, retention
cleanup, and an independent production security review are not included.

Dependency audit found six moderate findings in the existing ESLint/minimatch
**development-tool chain**, not the new webhook library. A compatible tooling
upgrade remains separate work; no forced major upgrades were applied.

References: [Resend email API](https://resend.com/docs/api-reference/emails/send-email),
[idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys),
[signed webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests).
