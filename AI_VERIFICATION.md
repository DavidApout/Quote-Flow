# Live AI verification — November 11, 2026

Result: PASS through the running QuoteFlow application, using the existing
OpenAI Responses API integration and configured gpt-4.1-mini model.
One provider call was made; no diagnostic retry was needed.

The explicitly approved fictional input was:

> 12 navy shirts with a cream logo; 4 small, 4 medium, 4 large

The provider received the request's service name, quantity and text, plus the
fictional demo catalog IDs/names. No account/contact details, artwork, private
tokens, or catalog prices were added. The test was authorized for fictional data.

QuoteFlow saved the live review on pending request
239e9ed3-8f65-4cac-a8c2-0c2a7f61a4b7. In the business browser, the saved review
displayed the actual result: a summary, six missing details and follow-up
questions, and the Custom printed T-shirt catalog match. Missing details included
deadline, artwork specifications, shirt style, print placement, delivery/pickup,
and packaging. The server computed $25 × 12 = $300 from its own saved catalog.

The business could inspect an editable reply. No message was sent, no price or
status was changed by AI, and no payment was created for this request. It remains
pending for the presentation; the separate paid example is request 361af87b.
Do not present those two requests as the same transaction in edited footage.

The successful result does not prove every future provider call will succeed.
API credentials/access/billing must remain available, and AI can be wrong. The
optional customer AI follow-up was not separately exercised in this live check.
Ordinary guided questions use local rules, not generative AI.

Fresh-source verification on the same date: npm ci succeeded with no copied
.env or data directory; seeding produced three services and the two demo accounts.
A new 12-shirt request was submitted, approved at $25, accepted, and read back
as $300. No external provider calls were made in that fresh-copy check. All 46
automated tests, ESLint, and the production build passed from the clean copy.

The saved private presentation DB includes the review; public source does not.
Judges must configure provider access or receive dedicated testing access through
the submission instructions. See JUDGE_SETUP.md.

Actual browser evidence: [saved live AI review](docs/images/live-ai-review.jpg) and
[completed paid customer job](docs/images/customer-job-completed.jpg).
