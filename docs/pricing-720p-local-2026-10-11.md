# 720p video packs — local verification, 2026-10-11

## Pricing

| Pack       |   USD | 720p videos | Internal credits |
| ---------- | ----: | ----------: | ---------------: |
| single     |  7.90 |           1 |              150 |
| friends    | 19.90 |           3 |              450 |
| collection | 29.90 |           5 |              750 |

Each advertised video is 14 seconds, 720p, vertical 9:16. The three-video pack is recommended. Prices, per-video amounts, savings, purchase confirmation, English/Chinese copy, metadata and structured offers use the updated catalog. Credits remain the internal ledger unit.

Existing 480p/1080p options and their 100/250-credit deductions remain available. Public pack counts explicitly refer to 720p (150 credits); other resolutions change capacity. No generation model, media retention, refund policy, or service guarantee changed.

## Payment behavior

- A zero-balance 720p visitor is offered the $7.90 single pack.
- Checkout amounts and grants are resolved by the server catalog, never by client-supplied prices.
- Stripe line items identify the video count and 720p format. Purchase restoration uses a new browser-storage namespace so old saved selections are not silently reused.
- Pending checkout intents whose saved amount/credits differ from the new catalog are rejected before contacting Stripe. Existing paid order fulfillment continues to use its recorded amount and credit quantity.
- Duplicate simulated purchase responses report the original order's granted credits.

## Verification

- `pnpm dance:test`: 40 passed on the final recheck (38 on the initial pass; two tests were added by concurrent workspace work). Includes isolated SQLite, mocked Stripe transport, signed callbacks, all three pack prices/grants, retries, stale pending price rejection, generation deductions, failure restoration, and legacy order fulfillment.
- `pnpm dance:funnel:test`: 33 passed.
- `pnpm exec tsx --test tests/dance-conversion-evening.test.ts`: 10 passed, including login selection restoration, expiry and ownership.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm build`: passed with `RUST_MIN_STACK=8388608`, `RAYON_NUM_THREADS=1`, and a bounded Node heap after a local memory-exhaustion interruption.
- Built-app browser check: English and Chinese pricing, 390px mobile with no horizontal overflow, and 1440px desktop.
- Browser simulation: anonymous single-pack selection navigates to sign-in; intercepted local session response restores `1 × 720p video / $7.90`; intercepted checkout response returns to the studio. Chinese three-pack dialog shows `3 条 720p 视频 / $19.90`.
- Browser auth/checkout interception is UI evidence only. Server payment/grant behavior is verified separately by the isolated integration tests. No real Stripe Checkout or Kie generation was invoked.

Screenshots: `output/playwright/pricing-zh-mobile.png` and `output/playwright/pricing-en-desktop.png` (ignored local artifacts).

## Boundaries

No deployment, commit, paid generation, production database write, or real payment. Existing unrelated worktree changes were preserved. The local QA build used a process-only `VITE_PREVIEW_ONLY=false` override to exercise purchase controls; committed preview/release settings were not changed. The local server uses mock payment/generation settings and is not a production checkout environment.
