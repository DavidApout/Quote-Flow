# Request images, job progress, dates and documents

Customers (account or website widget) can attach up to three PNG/JPEG reference
images before submitting. Files are resized to 1600 pixels, limited to 1 MB each,
validated/re-encoded by sharp, and saved with the request in one SQLite
transaction. PNG transparency is preserved. Images are not sent to AI. The
business and customer can expand Logo & reference images to preview/download.
Guest links must be verified and unexpired. SVG, PDF, animated images, originals,
replacement uploads after submission, and production storage quotas are not
included. Back up the database; this is demo storage, not an artwork archive.

After submitting, open Job progress & dates to set a requested date (customer)
or agreed date (business). The business advances Not started → In progress →
Ready for pickup → Completed, one step at a time, after a confirmed sandbox
payment. These are demo fulfillment states. Job details load when their section
opens and refresh on reopening, window focus, and every 15 seconds while open
and visible. Unsaved date/status edits are preserved during refresh. Use Reset
to saved details to discard those edits, or Refresh job details for an immediate
check. Changes create notifications and use the email queue.

Download quote / receipt creates a standalone HTML document with prices, dates,
request details, separate quote and human-readable job statuses, and, if confirmed,
sandbox receipt information. Open the file in a browser and use Print → Save as PDF. It is not a generated PDF attachment,
tax invoice or proof of real payment. Values are escaped, and the document has
no external images/scripts/private tracking tokens.

Email remains in preview mode by user choice. No real emails are sent. Live
email still needs a verified sender domain, provider credentials, and delivery
testing as documented in WIDGET_GUIDE.md. No live email test was performed.

The old /private/tmp/quoteflow-widget-demo.sqlite was missing on November 10.
The new local demo uses data/attachments-demo.sqlite and runs at port 5180.
It has fresh demo accounts and does not contain the earlier $300 sandbox receipt.
The demo launcher binds the existing PayPal sandbox configuration to this fresh
demo business without changing the main database or the .env business binding. The original data/quoteflow.sqlite is untouched.

Start the fresh demo with:

```sh
npm run demo:start
```

Existing demo credentials: customer@quoteflow.test / owner@quoteflow.test;
password for both: QuoteFlow local demo 2026!

## Completed final demo — November 11, 2026

The end-to-end browser workflow is verified for request
`361af87b-fd07-4ad6-9cbb-8122e3c11e3c`: 12 fictional shirts totaling $300.00,
requested date November 20, 2026, and agreed date November 19, 2026.
The customer accepted the business-approved quote, completed buyer approval in
PayPal Sandbox, and QuoteFlow confirmed the capture with PayPal. The capture is
`28909158BV5205426`, recorded November 11, 2026 at 1:37:02 PM America/Chicago.
This is a real sandbox-provider confirmation using test money; no real funds
were collected.

The business saved Not started → In progress → Ready for pickup → Completed,
one step at a time. Both dates remained unchanged. After signing back in, the
customer saw Completed, the payment notification, and three job-update
notifications. The downloaded receipt shows Job status: Completed, Quote status:
accepted, $300.00, both dates, the capture ID, and the test-money disclosure.
Quote acceptance and job completion are separate statuses.

Verified receipt download:
`/Users/davidapout/Downloads/quoteflow-361af87b (1).html`

Presentation copy:
`/Users/davidapout/Documents/ChatGPT/Paypal/output/widget-demo/quoteflow-final-demo-receipt.html`

A completed-demo backup is saved at `data/backups/final-demo-completed-2026-11-11.sqlite`, created with the SQLite backup API; its integrity check passed and it remains in the ignored data directory.

## Reopen and present the saved demo

1. Run `npm run demo:start` from `/Users/davidapout/quoteflow-ai` and open
   `http://127.0.0.1:5180/` on this computer.
2. Sign in as `customer@quoteflow.test` with `QuoteFlow local demo 2026!`.
   Open request `361af87b` and expand its details to show the paid test receipt,
   requested/agreed dates, and Completed job status. Download the quote/receipt.
3. Sign out and sign in as `owner@quoteflow.test` with the same demo password.
   Open Request inbox, find `361af87b`, and show the matching payment and job
   information. Notifications provide the saved update history.
4. For a new live walkthrough, submit a fresh fictional request, approve it as
   the business, accept it as the customer, and use the sandbox buyer account
   to approve a new test payment. Then advance each job stage as the business.
   A completed job cannot be moved backward; keep this finished example intact.

## Verification and remaining limits

- A fresh November 11 test run passed 46/46 tests, including payment ownership,
  paid-stage transitions, attachment access, and persistence checks. Lint,
  production build, and diff checks pass for the job-refresh/receipt changes.
- Browser testing confirmed that an unsaved requested date of November 21
  survives Refresh job details. Reset to saved details restores November 20
  without saving a change.
- A later November 11 live business AI review passed on separate pending request
  239e9ed3; see AI_VERIFICATION.md. It did not change the paid example. Email
  stays in preview mode; real email delivery and optional customer AI follow-up
  were not tested live. AI depends on provider configuration.
- Downloads are standalone HTML documents; use the browser's Print → Save as
  PDF when needed. They are not generated PDF attachments or tax invoices.
- This is a local demo, not secure public multi-business hosting or a live-money
  checkout. Public launch still needs the security, data-retention/deletion,
  email, business-policy, and legal work listed in the other project guides.

## Earlier request history

On November 10, the customer attached the fictional sample logo and submitted
request `1a181607-fa77-4572-8099-86fba3f25bd8` for $300.00. The business saw the
attachment and requested date, saved the agreed date, and approved the quote.
Customer acceptance and both dates survived a server restart, and the customer
successfully downloaded its quote HTML.

PayPal subsequently rejected that request's original checkout link. The old
request and payment record remain preserved and unpaid; they were not deleted
or silently marked paid. The completed November 11 walkthrough uses the new
request `361af87b-fd07-4ad6-9cbb-8122e3c11e3c` instead.
