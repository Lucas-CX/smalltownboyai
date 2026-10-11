# Smalltown Boy duo — 2026-10-11

## Implemented

- Homepage uses the approved fictional cat/dog clip: 720 × 1280, 14 seconds, original soundtrack restored in postproduction. Web copy is H.264/AAC fast-start MP4, 2,716,553 bytes; original master remains in ignored local test assets.
- Both photo slots are required. A replaces the opening foreground reaction; B replaces the background dancer. Swap preserves photo/error/warning ordering and resets the submission key. No default performers are inserted.
- Wan model `wan/3-0-video` receives two ordered image references and the checked-in red-fence video. Output duration is 14 seconds, aspect ratio 9:16, default quality 720P. Existing optional 480P/1080P settings remain supported.
- Generic prompt preserves subject identity/species and transfers the reference performance. It does not force subjects to become cats, dogs or humans.
- Reference bytes are pinned by SHA-256 and length. Legacy three-slot drafts are rejected; new drafts use a separate namespace/version.
- Existing credit, payment, recovery, private storage and deletion mechanisms remain in place. No production schema migration.

## Current boundaries

- Generated deliveries still use native Wan audio. The approved homepage sample has original audio added afterward. Automatic original-audio replacement is not implemented in the Workers pipeline; the page and FAQ disclose the difference.
- Prices are unchanged: 100 credits/$9.90, 400/$32.90, 1000/$74.90. 720P costs 150 credits, so the existing single-purchase recommendation for a zero-balance visitor is the 400-credit pack. The tool shows the actual required pack price, not $9.90 as the price for one 720P result.
- Local preview uses its own SQLite database and mock configuration. No production deployment, live checkout or additional paid Kie generation was performed. Production provider/payment/storage configuration must be completed before enabling live mode. The original local operator-test permit remains restricted; it is not a customer-generation authorization path.

## Verification

- `pnpm dance:test`: 38 passed, including simulated paid Workers submission with two ordered images + reference, 14-second 720P payload, signature/idempotency/refund/recovery checks.
- `pnpm dance:funnel:test`: 33 passed, including draft ownership/expiry and mobile sample size/fast-start checks.
- Locale cache and duo validation: 3 passed (duo cases overlap the main suite).
- `pnpm exec tsc --noEmit`: passed.
- `pnpm build`: passed with Windows build environment `RUST_MIN_STACK=8388608`, `RAYON_NUM_THREADS=2`.
- Browser: desktop and 390px mobile, English/Chinese, sample playback metadata, one-photo block, two-photo consent gate, role swap, draft save and login dialog. No paid browser submission.

Other pre-existing language and email changes in this checkout are outside this feature's scope and were preserved.
