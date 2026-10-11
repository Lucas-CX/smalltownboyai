# SEO Release Gate

## Required release path

Use `pnpm cf:deploy` after security review and operator deployment approval. Do not bypass the checks with direct `wrangler deploy`.

Commit and push the reviewed release first. The script requires a clean Git checkout before building and before upload, and records the full Git SHA in the Cloudflare version message (with a short SHA tag). Ignored local production configuration is validated separately; it is not included in Git. After deployment, verify the active Cloudflare version message against GitHub main.

1. Before building, `.env.production` and `wrangler.jsonc` must agree on public app/SEO URLs, indexing and preview flags. Public releases require indexing enabled, preview disabled, HTTPS, a non-placeholder origin, and a matching Worker route.
2. Run gate regression tests, build, then validate the generated `.output/server/wrangler.json` again before publishing.
3. After publishing, fetch robots using Googlebot, Google-InspectionTool and OAI-SearchBot user agents. Verify public access, private-path crawl restrictions, correct sitemap declaration, and a robots cache lifetime of at most 300 seconds.
4. Parse sitemap XML and validate namespace, nonempty unique same-origin canonical URLs, no private routes, no DTD. Fetch every listed page and verify HTTP 200, HTML, canonical and no index-blocking headers/meta. Redirects, challenges and HTTP errors fail the gate. Retry the live gate at most three times for edge propagation.
5. Run the project's full `seo:test` against production to catch missing public pages, locale metadata and template regressions. Submit IndexNow only after both checks pass.

A post-deploy failure means the Worker IS already deployed, but release verification FAILED. Do not report success, automatically roll back, or resubmit repeatedly. Investigate the specific error.

## Isolated previews

Use `pnpm cf:deploy --preview` only with an isolated Worker whose name ends in `-preview` or `-acceptance`, its matching workers.dev origin, no domain routes, and indexing explicitly disabled. Never publish a noindex/Disallow-all preview on the intended public domain. Production examples intentionally remain fail-closed; complete product acceptance before enabling indexing. This is a deliberate stricter rule than historical preview releases.

## Google acceptance is separate

User-agent simulation does not prove a request came from Google. The CLI always reports Google status as UNVERIFIED. After launch or crawl-policy changes:

- Select the exact GSC domain property and inspect `/sitemap.xml` with a live test. Record time, Crawl allowed, and Page fetch result.
- Check the sitemap report for successful reading, last read and discovered URL count. Submission receipt is not successful reading; reading is not indexing.
- If robots blocks fetching, inspect Google's robots report and request a recrawl when available. Compare real verified Googlebot requests against edge logs. If the report is not ready, record the limitation and schedule an explicitly authorized follow-up.
- A new Cache-Control header only affects subsequent retrieval; it does not purge an existing Google cache. Do not treat five minutes as a promised recovery time.
- If a follow-up remains blocked, investigate actual responses, DNS, redirects, edge controls and the deployed version rather than assuming cache indefinitely.

## Commands

`pnpm seo:preflight` validates local production configuration without publishing.

`pnpm seo:gate:test` runs offline failure-case tests.

`pnpm seo:live https://your-domain` checks public origin responses without publishing or submitting URLs.

## Incident comparison (2026-10-12)

Both repositories, Smalltown Boy AI and Lucas-CX/Rumpelstiltskinaivideo, use the same `VITE_SITE_INDEXABLE` robots switch and nearly identical build-then-Wrangler deployment sequence. Neither previous script enforced a production crawl-policy preflight or post-deploy SEO test before search submission.

Smalltown's `cloudflare-preview-release.md` records a deliberate preview on its canonical production domain with indexing disabled. The later launch enabled indexing. GSC live tests subsequently reported robots blocking; the observed Googlebot robots request predated launch. Cached preview policy is plausible, but the exact Google-cached response body was unavailable.

Rumpelstiltskin's GitHub `docs/DEPLOYMENT-STATUS.md` records an initial 522 during Worker route propagation, later successful origin SEO tests, and an inherited IndexNow script that initially submitted the former product's domain. The recorded correction used the new site's environment origin. Those facts do NOT establish the cause of its GSC sitemap failure, and no historical GSC response body was available for comparison.

Conclusion: shared template/workflow risk is confirmed; identical incident root cause is not. These guards prevent accidental public noindex releases and catch origin-side regressions, but cannot guarantee Google cache timing or indexing.

## Follow-up evidence and validation

At 2026-10-12 01:40:12 Asia/Shanghai, GSC live inspection of Rumpelstiltskin's sitemap reported Crawl allowed = Yes and Page fetch = Successful. Its sitemap list still showed Couldn't fetch with zero discovered URLs immediately before the live test. Smalltown's latest observed live test at 01:28:37 still reported blocked by robots. Current Google access therefore differs; a common XML parsing defect is not supported by this evidence. Sitemap list success and historical root cause remain unconfirmed.

Both projects passed the seven offline gate test groups, production builds and scoped worktree security scans. Smalltown also passed production-origin gate, full live SEO regression and generated Cloudflare config preflight. Rumpelstiltskin's current origin fails the new short-cache requirement (the local header fix is not deployed); its existing full SEO test also finds that English/Chinese FAQ answer seo.faq.12.a in live llms-full.txt differs from the checked-out source. These failures must remain visible rather than weakening the gate. No production deployment or Google indexing request was performed for this workflow change.
