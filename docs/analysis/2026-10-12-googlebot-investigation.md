> Historical observation: 2026-10-12. Archived 2026-10-18 from `output/seo-audit-2026-10-12/googlebot-cloudflare-investigation.md`. Not re-tested during archival. Request identifiers, IP addresses and internal deployment identifiers removed; raw logs and HTML remain local.

# Googlebot / Cloudflare investigation - 2026-10-12

## Verified historical request

- Cloudflare Security Analytics, past 24 hours, verified bot category Search Engine Crawler: Googlebot requested https://smalltownboyai.video/robots.txt at 2026-10-11 21:01:31 GMT+8.
- Source IP: [crawler IP removed]; ASN 15169 Google LLC; mitigation: none; cache status: none.
- Forward/reverse DNS verified using Google public DNS: [crawler IP removed] -> [verified googlebot hostname] -> [crawler IP removed].
- Worker log at 2026-10-11 21:01:32.161 GMT+8 confirms HTTP 200, outcome ok, wall time 118 ms, CPU 15 ms.
- Ray ID: [request identifier removed]. Worker version: [internal version removed].
- Read-only `wrangler versions view` confirms this version was created 2026-10-11T12:57:54Z with VITE_SITE_INDEXABLE=false, VITE_PREVIEW_ONLY=true, and canonical production domain smalltownboyai.video.
- Existing preview release document confirms deliberate noindex preview; robots route returns Disallow: / when site_indexable is not true.

## Current Cloudflare configuration observed

- Security rules: no custom rules, no rate limiting rules, no managed rules listed.
- Past 24-hour Security Events: no firewall events listed.
- Bot Fight Mode: off. Browser Integrity Check: on (left unchanged; no evidence of a matching block).
- AI Crawl Control: Googlebot blocking switch off. Bot Preference Sync off.
- Cache Rules: zero active; cache response rules: zero active. Page Rules: none.
- Current production deployment a572a088 has 100% traffic; prior cache fix remains deployed.
- Origin release gate passed all 14 public URLs, robots, sitemap, canonical and indexability checks in this investigation.

## Evidence limits and interpretation

- Historical Googlebot definitely reached the Worker and received HTTP 200 from the noindex preview deployment. This establishes an actual release-workflow problem, not merely a hypothetical WAF block.
- Historical response body is not retained in these logs. Google's currently cached robots body is not available, so continued use of the old policy remains an inference, not directly proven.
- Security Analytics is sampled. Absence of a log is not proof no request occurred.
- Worker search for Google-InspectionTool plus Google ASN 15169 found no events in the selected 24-hour window. User-agent-only matches include synthetic testing and must not be counted as real Google crawls.
- AI Crawl Control aggregate counts likewise are not used as proof of verified Googlebot identity or indexing.
- No Cloudflare security settings were changed. No new deployment was needed to remove an observed edge block because none was found.

## Next acceptance check

Check for a fresh verified Googlebot robots request against the current deployment, then GSC live fetch showing crawl allowed and fetch successful. Only then resubmit sitemap if needed and request homepage indexing. Do not report success solely from public HTTP tests or a submission receipt.
