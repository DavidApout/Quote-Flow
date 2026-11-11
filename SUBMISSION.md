# QuoteFlow AI — submission copy and completion checklist

Status: prepared locally; not submitted. Verify all unchecked items before entry.
Event: [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).
Deadline: November 12, 2026, 2:00 p.m. America/Chicago (12:00 p.m. PST).

## Project name

QuoteFlow AI

## Tagline

Turn a custom-service request into an approved quote, PayPal checkout, and a tracked job.

## Inspiration

A custom printing business needs more than a customer's first message to price
a job. Quantities, sizes, artwork, timing, and pickup details often arrive across
separate conversations. We wanted one place to collect the request, clarify the
details, approve a price, collect a payment, and keep the customer informed.

## What it does

QuoteFlow gives small service businesses a request inbox, service catalog, and
customer workspace. Customers can describe a job, attach reference images, and
request a date. Businesses review the details and control the final price.

The implemented AI assistant identifies missing information, suggests follow-up
questions, summarizes the request, and suggests relevant catalog services. The
owner reviews the result and decides what to send. The server calculates prices;
the AI cannot approve a quote, send a message, or collect a payment itself.

After the customer accepts, PayPal Sandbox handles buyer approval and payment.
QuoteFlow verifies the captured amount and merchant, stores the receipt, and
lets the business advance the job from In progress to Ready for pickup to
Completed. Both sides can see dates, messages, notifications, and a downloadable
quote or sandbox receipt. A website widget supports requests from a business's
own site, with private tracking links and local email previews in this demo.

## How we built it

React and Vite power the responsive interface. A Node.js server uses SQLite for
accounts, services, quotes, messages, dates, attachments, and receipts. The OpenAI
Responses API uses structured outputs for request analysis; the configured model
is gpt-4.1-mini. PayPal Orders v2 creates and captures sandbox orders on the server.
Secrets remain server-side. The app checks ownership and saved prices before
allowing changes, and repeated payment actions use stable request IDs.

Development assistance: ChatGPT/Codex helped plan, implement, review, and test
the project. That assistance is separate from the application's AI functionality.
The ordinary customer wizard is rule-based; only the optional AI follow-up and
business AI review use the model.

## Challenges

We separated quote acceptance, payment confirmation, and job completion so none
can stand in for another. We also kept AI suggestions separate from the business's
pricing decision and protected unsaved date edits while job updates refresh.

## What is verified

On November 11, a fictional 12-shirt order completed a $300 PayPal Sandbox payment,
then all three fulfillment stages. The customer saw Completed and notifications,
and downloaded a receipt with the capture and dates. The automated suite passed
46 tests. Detailed evidence is in WORKFLOW_GUIDE.md.

A live gpt-4.1-mini business review passed on November 11. It identified missing
shirt-order details and suggested a matching service; the saved result was
verified in the business browser. No AI message was sent and no price, quote
status, or payment changed automatically. See AI_VERIFICATION.md. The optional
customer AI follow-up was not separately live-tested.

## Progress during the hackathon

The existing React components were retained and expanded into the dashboard,
request inbox, account/guest request flows, persistent business approval,
request analysis integration, messages, PayPal sandbox checkout, job tracking,
dates, attachments, and downloadable documents. The latest work adds minimalist
styling, demo legal notices, reliable job refresh, and submission setup material.
The entrant should confirm the project timeline and describe which parts existed
before October 1, 2026; do not invent a start date or claim all code was new.

## What's next

Verify real email delivery, deploy with persistent storage and HTTPS, complete
production security and legal review, and build merchant onboarding before
offering live payments to multiple businesses.

## Required links and access — complete before submitting

- Public repository: https://github.com/DavidApout/Quote-Flow (public access not yet verified).
- Public YouTube demonstration under 3 minutes: NOT YET RECORDED/UPLOADED.
- Functional demo access: JUDGE_SETUP.md; arrange any necessary dedicated test
  access in the submission's testing instructions, without publishing secrets.
- Completed Devpost project URL / submission confirmation: NOT YET SUBMITTED.

## Final checklist

- [x] PayPal Sandbox create/capture demonstrated with a persisted receipt.
- [x] Source includes an MIT license file.
- [x] Successful live business AI review verified in the application.
- [ ] Latest source committed/pushed and repository accessible while signed out.
- [x] Fresh source install, seeding, quote workflow, 46 tests, lint, and build verified.
- [ ] Judge-specific external provider access arranged and documented.
- [ ] Video recorded, public on YouTube, under 3 minutes, and linked on Devpost.
- [ ] Text and tools/model disclosure pasted into Devpost.
- [ ] Entrant confirms age/residence eligibility, original ownership, authorized
  assets, applicable third-party licenses, and no disqualifying conflicts.
- [ ] All team members registered; significant existing-project changes explained.
- [ ] Devpost submission completed before the deadline, confirmation saved.

Requirements source: [official rules](https://paypalaihackathon.devpost.com/rules).
The organizer decides eligibility. This checklist records preparation, not entry
acceptance. A purchased domain, real-money checkout, and real email are not listed
submission requirements; judges still need a working build and truthful claims.
