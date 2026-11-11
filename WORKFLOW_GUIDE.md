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
payment. These are demo fulfillment states. Refresh/reopen the page to see updates
made by the other side. Changes create notifications and use the email queue.

Download quote / receipt creates a standalone HTML document with prices, dates,
request details and, if confirmed, sandbox receipt information. Open the file
in a browser and use Print → Save as PDF. It is not a generated PDF attachment,
tax invoice or proof of real payment. Values are escaped, and the document has
no external images/scripts/private tracking tokens.

Email remains in preview mode by user choice. No real emails are sent. Live
email still needs a verified sender domain, provider credentials, and delivery
testing as documented in WIDGET_GUIDE.md. No live email test was performed.

The old /private/tmp/quoteflow-widget-demo.sqlite was missing on November 10.
The new local demo uses data/attachments-demo.sqlite and runs at port 5180.
It has fresh demo accounts and does not contain the earlier $300 sandbox receipt.
PayPal business binding is disabled for this fresh database until deliberately
configured for its new business ID. The original data/quoteflow.sqlite is untouched.

Start the fresh demo with:

```sh
PORT=5180 APP_ORIGIN=http://127.0.0.1:5180 DATABASE_PATH="$PWD/data/attachments-demo.sqlite" MAIL_MODE=preview PAYPAL_DEMO_BUSINESS_ID= npm run dev
```

Existing demo credentials: customer@quoteflow.test / owner@quoteflow.test;
password for both: QuoteFlow local demo 2026!

Browser verification: customer signed in, selected service, attached fictional
sample logo and previewed a $300 request successfully. Browser access failed at
submission; full browser submit/inbox/download checks remain unverified. API
tests cover account and guest atomic upload, ownership, guest retry consistency,
image decoding/limits, restart persistence, and paid job stage/date authorization.
