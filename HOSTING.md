# Public demonstration hosting

This repository includes a Render configuration for the existing React + Node
application, with one server and a persistent SQLite disk. It is a limited
fictional-data demo, not a production launch for real customers.

## Deployment status — November 12, 2026

Public URL: https://quoteflow-ai-demo.onrender.com

Render service: `srv-dbqssdm7bikc73b1pkog`, Oregon. Initial deployed commit:
`cebe85b`. Render reported Live, and the public sign-in page rendered.
The homepage, unauthenticated session API, and privacy page returned HTTP 200.
The selected server is $7/month plus a 1 GB disk at $0.25/month, before taxes
or additional usage. Automatic deployments are off.

This deployment starts with a fresh database. Local demo accounts and records
were not uploaded. Hosted accounts/catalog setup and a hosted end-to-end
transaction remain to be completed. AI and PayPal credentials are not yet
configured here; email is disabled. The local demo's verified provider results
must not be presented as verification of the hosted integrations.

## Deployment

Use a Render Web Service, not a Static Site. Connect the public repository,
select Node 24, and build with `npm ci --include=dev && npm run build`.
Start with `APP_ORIGIN="${APP_ORIGIN:-$RENDER_EXTERNAL_URL}" npm start`.
Render supplies its HTTPS URL; for a custom domain explicitly set APP_ORIGIN
to its exact HTTPS origin without a trailing slash.

Set HOST=0.0.0.0, NODE_ENV=production, MAIL_MODE=disabled, and
DATABASE_PATH=/var/data/quoteflow.sqlite. Attach a 1 GB persistent disk at
/var/data. Review the paid service and disk price in Render before deploying.
Use /api/auth/session for the health check. Keep automatic deployment off
until changes have been tested. The render.yaml file records these settings.

Do not upload .env, local databases, backups, or local demo accounts.
Create separate hosted business and customer accounts with unique passwords.
Keep judge credentials in private submission instructions. Add fictional
services and requests through the app. Do not run the local demo seeder here.

## External integrations

The initial hosted app supports account sign-in, services, requests, approval,
acceptance, conversations, in-app notifications, dates, and downloads.
AI and PayPal need separate server environment configuration; uploading the
source does not copy local credentials. Set OPENAI_API_KEY and OPENAI_MODEL
only after approving hosted provider usage. Set PayPal sandbox client ID,
secret, merchant ID and PAYPAL_DEMO_BUSINESS_ID to the NEW hosted business ID.
Keep keys out of frontend variables and the repository. Only test money is
supported. A paid receipt exists only after verified capture.

MAIL_MODE=disabled means no real emails and no local email previews. The
no-account widget remains unavailable without verified email delivery;
account-based requests are available. Follow WIDGET_GUIDE.md to configure
verified email later. Do not disable this check to expose preview links.

## Before sharing a try-it-out link

Verify HTTPS, sign-in/sign-out, both participant roles, request submission,
approval and acceptance, then restart the service and confirm persistence.
Configure and test AI and PayPal separately before describing them as working
on the hosted version. Verify private request access. Share only the actual
Render-provided URL after successful deployment, not a guessed URL.

This uses a single-process rate limiter behind a proxy and one demo merchant.
Real-customer launch still requires the operational, abuse-control, email,
backup, deletion, merchant-onboarding and legal work described in README.md.

References: https://render.com/docs/disks and
https://render.com/docs/blueprint-spec
