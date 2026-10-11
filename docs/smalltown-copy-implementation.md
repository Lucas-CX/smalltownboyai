# Smalltown Boy SEO/GEO copy implementation

Date: 2026-10-11. Scope: English and Chinese homepage copy, pricing headings, homepage content sections and FAQ. Research basis: `smalltown-boy-seo-geo-copy-2026-10-11.md`.

## Changes

- A single, descriptive homepage H1 targets Smalltown Boy AI dance video generation. Title and description describe the actual two-photo workflow.
- Upload instructions distinguish the opening close-up from the background dancer. Pricing copy distinguishes pack payment from per-video credit consumption.
- Added visible trend explanation, version selection guidance, sample/audio disclosure and a closing link back to the generator.
- Expanded the FAQ to 16 answers: trend identification, creation steps, prompts, photos, pets, CapCut, free generation, pricing, duration, music, downloads/watermarks, identity consistency, duplicate photos, waiting, failures and file expiry.
- The visible FAQ, FAQPage JSON-LD and English discovery text continue to use `danceFaq` as one source. No fabricated reviews, performance statistics, original-audio guarantees or indexing promises were added.
- Existing indexability controls remain in place. Publishing and production readiness are separate from this local copy implementation.

## Verification

- `pnpm build`: passed after releasing local preview locks. Existing large-bundle warning remains.
- `pnpm exec tsc --noEmit`: passed.
- Prettier check on changed source files: passed.
- `pnpm seo:test`: passed for English and Chinese public routes, metadata, discovery text and retired routes. Added assertions for one H1, trend-specific title, server-rendered explanation, visible FAQ/JSON-LD equality and English discovery answer equality.
- Playwright: English desktop at 1440 px and English/Chinese mobile at 390 px; no horizontal page overflow. Chinese audio FAQ opens and displays the correct disclosure. Final pages contain all 16 FAQ entries.
- Development hot reload briefly retained the pre-compilation translation exports after a new FAQ key was added. A clean rebuild and server restart resolved this; final SEO checks passed.

No production deployment, indexing submission, paid generation or checkout was performed in this copy task. Other existing edits in the checkout were preserved.

## Publication follow-up

The deployment remains display-only as recorded in `cloudflare-preview-release.md`. Added a preview-status FAQ, a pricing notice and conditional removal of purchasable structured offers in preview mode. The 16 product FAQs remain, with a seventeenth status answer on preview deployments. IndexNow is skipped explicitly while indexing is disabled. No database initialization or payment activation is part of this copy release.

Release preflight: production Node build, TypeScript, eight focused preview/payment/video tests and bilingual SEO checks passed. Homepage and pricing at 390/768/1440 px under light/dark OS preferences have one H1 and no horizontal overflow. Marketing retains its intentional dark palette. Local mobile Lighthouse measured LCP about 7.8 seconds (video), CLS 0 and TBT 10 ms; this is a lab limitation, not production field performance or a claim that Core Web Vitals pass. The existing initial JavaScript bundle and video rendering remain performance follow-ups. Noindex is intentional.

## Evidence boundary

The code and sample now support designing around a two-role, 14-second template. The sample soundtrack is post-produced; customer delivery uses provider-generated audio. Watermark-free output and duplicate-subject performance are not guaranteed. Search rankings, AI citations, organic visits and purchases must be measured after launch; local correctness does not prove acquisition.
