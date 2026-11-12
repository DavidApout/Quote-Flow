# Run QuoteFlow AI from a fresh download

Requires Node.js 24 or later, npm, and a current desktop browser. This is a
local React/Vite + Node/SQLite app. No database subscription or domain is needed.
Use a fresh source folder for these steps; do not copy someone else's .env or data.

## 1. Install and start

From the downloaded repository folder:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173 (use 127.0.0.1 rather than localhost). The server starts
both the frontend and API and creates data/quoteflow.sqlite automatically.
Leave it running. In a second terminal in the same folder:

```sh
npm run demo:seed
```

The seeder creates fictional accounts, three services, and two pending requests.
It uses http://127.0.0.1:5173 by default. For a custom port, set DEMO_ORIGIN to
the exact running origin before invoking it. It is local-only and repeatable.
Do not seed a production database or expose these intentionally public accounts.

| Role | Email | Password |
|---|---|---|
| Business owner | owner@quoteflow.test | QuoteFlow local demo 2026! |
| Customer | customer@quoteflow.test | QuoteFlow local demo 2026! |

Paypal Sandbox email: sb-fj6u353463131@business.example.com
PayPal Sandbox Password:  pGR^g6'J
Tabs in the same browser share one login. Sign out to switch roles, or use
separate browser profiles. No paid receipt or fabricated AI result is seeded.

## 2. Try the core flow

1. As the customer, select Studio North and submit a shirt request with quantity 12.
2. As the owner, open Request inbox. Inspect the request and optional images;
   set an agreed completion date under Job progress & dates. Approve at $25/unit.
3. As the customer, accept the $300 quote. Reload: the request stays saved.
4. Download quote / receipt. The HTML opens in a browser; Print → Save as PDF
   creates a PDF. It truthfully says unpaid until an actual test capture succeeds.

AI and PayPal are real external integrations, configured separately below.
Without those credentials the manual quote flow works, but it is not a complete
demonstration of the hackathon's PayPal-plus-AI requirement.

## 3. Enable and verify AI

Copy .env.example to .env with your file manager. Set OPENAI_API_KEY privately;
OPENAI_MODEL defaults to gpt-4.1-mini. Stop and restart the server.
On a pending request, the owner can select Review with AI. It summarizes the
request, finds missing details, suggests questions and catalog matches, and
prepares an editable reply. Prices are computed from the catalog on the server.
The customer guide also offers an optional AI follow-up; its ordinary guided
steps use local rules and are not generative AI.

Live AI requests send the entered request text and catalog names/IDs to OpenAI.
Use fictional text only when evaluating the demo. Provider access/billing must
be available. No personal account details or catalog prices are added to the
AI payload; free text can still contain personal data, so review it first.
An API failure is shown honestly and leaves the request editable.

## 4. Enable PayPal Sandbox

Follow [PAYPAL_DEMO.md](PAYPAL_DEMO.md). Configure your own sandbox app's client
ID, secret, seller merchant ID, and this fresh QuoteFlow owner's ID in .env.
The owner ID appears in the Website widget URL and in the seeder's customer-page
URL. It is unique to this new database; do not reuse an ID from a screenshot.

Restart the server. On an accepted customer quote, prepare checkout and approve
using a separate PayPal Sandbox personal/buyer account. The buyer login is not
the QuoteFlow login. Return to QuoteFlow and complete the test payment. The
server verifies capture details before marking it paid. The owner can then save
In progress → Ready for pickup → Completed. The customer sees updates and can
download the confirmed sandbox receipt. No real money moves.

Never commit provider secrets. For judging access that should not require judges
to provision accounts, the entrant must arrange dedicated test access privately
through the submission's testing instructions and keep it available through
judging. This repository does not contain the entrant's credentials or private DB.

## 5. Check the build

```sh
npm test
npm run lint
npm run build
```

Tests use isolated temporary databases and mocked external providers. They do
not spend money or prove live provider access. npm run preview is frontend-only;
use npm run dev for the complete local application. To reset your own disposable
fresh demo, stop it and move its data directory aside; never overwrite the saved
presentation database. For the presenter's existing paid example at port 5180,
see [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md); npm run demo:start requires that saved
database and is not the fresh-download command.

## Limitations

Email stays in local preview mode. PayPal supports one configured demo merchant,
USD, and sandbox payments only. No production merchant onboarding, live payments,
refund workflow, or production security certification is claimed. The legal pages
are demo notices. See LEGAL_SETUP.md before a real launch.
