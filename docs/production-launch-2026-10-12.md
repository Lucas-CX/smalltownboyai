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
