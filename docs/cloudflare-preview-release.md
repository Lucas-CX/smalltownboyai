# Cloudflare display-only release

Requested on 2026-10-11. The user explicitly chose to publish the display pages without initializing the database.

- Worker: `smalltownboyai`
- Canonical domain: `https://smalltownboyai.video`
- `www.smalltownboyai.video` redirects to the canonical domain.
- `VITE_PREVIEW_ONLY=true`, `VITE_SITE_INDEXABLE=false`.
- No D1, R2, mail or scheduled-task bindings in this release. No provider secrets or paid generation are required.
- Homepage photos remain in browser memory. Login links are hidden, purchase/generation buttons disabled, and server APIs refuse mutations with HTTP 503. Anonymous session and public configuration reads work without a database.
- Existing full generation code remains available for a later configured release. Removing the preview flag alone is not a complete live launch: database migration, provider/payment configuration and delivery validation are still required.

`wrangler.preview.example.jsonc` is the committed deployment template; the actual `wrangler.jsonc` and `.env.production` are ignored. Deploy through `pnpm cf:deploy`, which builds with production variables before Wrangler publishes.

Provisioning had already created `smalltownboyai-db` and `smalltownboyai-private` before the user chose display-only mode. They remain empty, unbound and unused. Neither `migrations/cloudflare/0001_initial.sql` nor `0002_dance_funnel.sql` was applied remotely.

## Preflight evidence

- Security scanner and manual review cover the release diff; no provider/customer credentials are included.
- Cloudflare production build and TypeScript check passed.
- Preview access controls, duo/reference submission, draft recovery, payment journey, language scope and analytics tests: 17 passed.
- SEO checks passed for 14 public English/Chinese pages, retired routes and discovery endpoints. Noindex is intentional while the product is a display preview.
- Responsive checks at 390, 768 and 1440 pixels found no horizontal overflow; public actions remain disabled. Marketing uses its intentional dark palette under both OS themes.
- Browser API checks confirmed anonymous session is null and purchase/generation POSTs are refused without database access.

Live URL, video delivery, redirects and access controls must also be checked after publishing. Local checks alone are not proof of a successful deployment.
