# QuoteFlow AI

React/Vite frontend with a Node.js account and quote backend, using SQLite. Requires Node 24 or later. No external account service or database subscription is needed for local development.

## Start locally

```sh
npm install
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
- Recovery uses a one-time private code shown on signup. A successful reset revokes all sessions and replaces the code. There is no email sender, email verification, or email reset link yet. Email is a login identifier, not proof of a verified address. Losing both the password and recovery code requires a separate operator recovery process; none is exposed publicly.
- API checks enforce account roles and ownership, price validation, and allowed quote status changes. Customer totals and ownership claims are never trusted.
- Mutations require the configured origin and a custom request header. Cross-origin access is not enabled. Rate limiting applies to authentication attempts; hashing concurrency is bounded.
- Data lives in `data/quoteflow.sqlite` by default and persists across restarts. Database files are excluded from Git. Back up the database using SQLite's backup mechanism or stop the server before copying its database files.
- The previous localStorage demo values are left intact. Services can be imported explicitly into a business account. Old unowned demo quotes are not assigned to real accounts automatically. New quotes and services are saved in the database; only the theme remains browser-local.
- AI pricing and PayPal payments are not connected.

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

## AI quote drafts

Set `OPENAI_API_KEY` in your local `.env` (never commit it); optionally set
`OPENAI_MODEL` to a Responses API model supporting structured outputs. Restart
`npm run dev`. The default is `gpt-4.1-mini`. API billing/access is required.

As a customer, choose a business, describe one catalog service and its quantity,
and click **Draft with AI**. Review the proposed service and quantity, then submit
for business approval. Ambiguous descriptions receive a clarifying question;
edit the description and try again. Manual previews remain available.

Only the request text and selected business's service IDs/names go to OpenAI.
The server calculates prices from its catalog. Drafting does not save, approve,
or pay a quote. Submission reloads the current catalog price. The endpoint
requires a customer session and allows 10 attempts per 15 minutes per account
(per server process). PayPal checkout is still pending.

Validation: `npm test`, `npm run lint`, `npm run build`. AI tests mock the provider;
a live smoke test requires an API key: request a known service with quantity,
check its total, submit, and approve from the business account.
