> 历史归档：2026-10-18 整理自 `output/production-ux-verification.md`。以下状态、价格、测试和部署结论均属于原报告观察时点，本次未重新实测。个人/内部标识已移除；截图、媒体、日志和原始数据库结果未随档案上传。无日期的原报告不推断执行日期。

# Production release verification — 2026-10-17

Commit: 46a9be5b5f1948b98b256466811c6179a418dbd7 (origin/main)
Cloudflare version: [内部标识已移除]
Origin: https://smalltownboyai.video

Production build and deployment: pnpm cf:build, then pnpm cf:deploy after commit/push. Deployment script re-ran security audit, SEO gate, dance and conversion tests, typecheck and production build.
Production artifact: stripe-live, kie, D1, preview=false; no temporary proxy fixture markers found. output/ fixtures remained ignored. No database migration pending. Working tree clean.

Passed: targeted payment review/draft/journey 5; dance tests 51 + submission 9; conversion 59; SEO gate 7; tsc; dependency audit (no known vulnerabilities); worktree and staged security scan.
Idempotency coverage: duplicate signed payment confirmations plus three concurrent payment reviews grant credits once; generation request/recovery tests preserve single deduction and refund. Payment review now rate-limited to 5s per request identity within a Worker isolate, no new polling or scheduled jobs.

Live checks:

- settings: simulation=false, acceptance=false.
- anonymous checkout and generation POST return 401.
- anonymous payment review returns login; invalid receipt returns 303 to localized recovery page with no-store and cleared secure HttpOnly cookie.
- 390x844: two public sample photos selected, 3-pack default; changed to 5-pack then refreshed: both photos and collection selection retained, consent=false; no generation submitted.
- payment=review without authenticated receipt: pending guidance, purchases hidden, generation disabled; login dialog retains payment recovery callback.
- 390/768/1440: no horizontal overflow; readable login dialog; no captured console errors.
- live SEO gate: 28 URLs passed; template metadata/discovery/retired routes passed. IndexNow 200 is receipt only, not indexing proof.

Limitations: No real payment, live credit deduction or paid Kie generation performed. Paid-success/balance/concurrency cases validated in isolated tests and earlier local UI walkthrough, not represented as a new real purchase.
Screenshots: production-mobile-packs.png, production-mobile-payment-review.png.
