# QuoteFlow demo guide

The current project is the main QuoteFlow repository. For a fresh source download,
use [JUDGE_SETUP.md](JUDGE_SETUP.md). For the presenter’s saved paid example on
port 5180, use [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md).

## Verified November 11, 2026

- Customer request → business approval → customer acceptance → actual PayPal
  Sandbox capture → In progress → Ready for pickup → Completed.
- $300.00 test payment for 12 fictional shirts; capture 28909158BV5205426.
- Both roles see the receipt, dates, job state, and in-app notifications.
- Customer downloaded a receipt containing completed job status and payment.
- 46 automated tests, lint, and production build passed.

The saved demonstration database is private and excluded from Git. Fresh installs
create their own accounts and requests; they do not contain this paid receipt.
Earlier port-5178 copies are historical and are not the submission build.

## Current limits

A live business AI review passed on November 11; see AI_VERIFICATION.md.
The ordinary customer guide remains rule-based; optional customer AI follow-up
was not separately tested live.
Email remains preview-only. PayPal supports a single configured sandbox merchant;
no real payments, refunds, or production merchant onboarding are claimed. Downloads
are HTML documents that can be printed to PDF. The app is not production hosting.

## Submission preparation

See [SUBMISSION.md](SUBMISSION.md) for copy and remaining requirements. Public repository access,
the public video, judge test access, eligibility, and final entry confirmation
must be verified before claiming that the submission is complete.
