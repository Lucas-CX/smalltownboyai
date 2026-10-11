# Production launch — 2026-10-12

## Release scope

- Open public purchasing and generation: `VITE_PREVIEW_ONLY=false`, `DANCE_PAYMENT_MODE=stripe-live`, `DANCE_GENERATION_MODE=kie`.
- Open the 14 English/Chinese marketing pages to indexing: `VITE_SITE_INDEXABLE=true`. Account, administration and private API/media routes remain restricted and excluded from discovery.
- Include the reviewed 720p catalog ($7.90 / $19.90 / $29.90 for 1 / 3 / 5 videos), selected local video examples, encrypted provider settings integration, and async callback/on-demand generation changes.
- Correct both languages' terms/privacy from obsolete 1–3/default-role language to two required role photos. Clarify that saved confirmed drafts can resume after verified payment.
- Preserve the retired scheduler migration and empty Cron schedule. No new business schema migration.

## Pre-release verification

- 130 tests passed, including production-mode payment validation, D1-compatible atomic credits, callback authentication, concurrency, result streaming/download permissions, and preview gates. Provider requests in these tests are simulated.
- TypeScript passed. Cloudflare production build passed after stopping a stale local preview that locked the native SQLite binary.
- Security scan passed (no findings); manual review covered payment catalog/amount/session/user matching, signature verification, idempotency, ownership, callback capability and authoritative Kie lookup, restricted media hosts, and bounded uploads.
- Live read-only provider verification: configured encrypted Stripe key is live; Checkout read API HTTP 200; signing secret configured; Kie credit API HTTP 200 (8501 credits); Google login, GA4 and Clarity configured. No credentials are included in this report.
- Existing production performance trace before release: LCP 1689ms, CLS 0, no throttling. This is one laboratory observation, not a field guarantee.

## Verification boundary

This release does not charge a card or submit a paid Kie generation. The final real payment → delivery acceptance remains to be performed by the user. Test success and valid provider credentials do not prove settlement or real callback delivery. Indexability and an IndexNow receipt do not prove search-engine indexing.

Release logs and live verification evidence are stored under ignored `output/setup/launch-*`. Production flags and credential files remain gitignored.

## Final production evidence

- Production Worker version: `ad4a1cc0-46b5-4ab8-a106-aeecb1d730eb` (100% traffic). Source release commit: `94e3b2c`.
- Read back Cloudflare runtime flags: preview false, indexing true, payment stripe-live, generation kie; D1/R2/Images bindings present; schedules empty and no Durable Object binding.
- Online SEO test passed for public template pages, metadata, discovery, and retired routes. IndexNow returned HTTP 200 for 14 URLs after the final release; receipt only, not indexing proof.
- Anonymous purchase/generation/file/refresh APIs return 401; forged Kie callback returns 401; invalid Stripe webhook returns 400; anonymous admin health returns 403. Public generation settings report simulation false.
- Browser checks: enabled $7.90/$19.90/$29.90 offers; anonymous purchase goes to sign-in with the purchase-resume destination. Google OAuth reaches Google's account chooser. Home at 390/768/1440 and Chinese pricing at 390 have no horizontal overflow; light/dark system preferences retain the intentional dark product theme. Final Chinese pricing laboratory trace: LCP 2000ms, CLS 0, no throttling; no field-performance claim.

## Email registration follow-up

The user requested email registration without verification. Set both DB admin settings and runtime fallbacks to `email_auth_enabled=true` / `EMAIL_AUTH_ENABLED=true` and `email_verification_enabled=false` / `EMAIL_VERIFICATION_ENABLED=false`. Google login remains enabled. No application logic change was needed.

Live API verification with a temporary QA account:

- Email signup HTTP 200, `emailVerified=false`, immediately authenticated.
- Sign-out and password sign-in HTTP 200, without a verification email.
- Authenticated balance is zero, payment mode stripe-live, simulation false.
- Site checkout API created a real live Stripe Checkout session: 790 USD cents, 150 account credits, pending/unpaid. No card was entered and no payment was completed.
- Expired that exact unpaid Checkout session through Stripe, then removed only the temporary QA user's events/account and cascading pending records. No paid orders or customer records were changed.

The final paid generation, real Kie completion callback and delivered-video acceptance are still unperformed in this release review. The user intends to run that real flow next.
