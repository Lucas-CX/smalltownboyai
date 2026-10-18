> Historical observation: 2026-10-12. Archived 2026-10-18 from `output/seo-audit-2026-10-12/gsc-robots-version-investigation.md`. Not re-tested during archival. Request identifiers, IP addresses and internal deployment identifiers removed; raw logs and HTML remain local.

# Google robots version investigation

Date: 2026-10-12, Asia/Shanghai. No production changes.

## Current evidence

- Direct GSC robots report for sc-domain:smalltownboyai.video loads successfully but displays No robots.txt files. No file contents, versions, or recrawl action are available.
- Homepage indexed-state inspection says URL is on Google, indexed despite being blocked by robots.txt. This is not proof of successful current crawling or sitemap ingestion.
- Homepage live inspection at 13:13:28 fails: crawl not allowed, blocked by robots.txt.
- robots.txt live URL inspection at 13:14:47 also fails: blocked by robots.txt. This checks the URL as a resource, not proof of a refresh of Google's internal robots policy cache. No indexing request was made for robots.txt.
- GSC sitemap list rechecked: sitemap.xml remains Could not fetch, unknown type, 0 discovered pages.
- Current robots responses with Google-InspectionTool and mobile Googlebot user-agent strings: HTTP 200, text/plain UTF-8, Cache-Control public/max-age=300/must-revalidate, Allow: /, correct sitemap, private-path exclusions only. These are synthetic tests, not real Google requests.
- Source review: robots rules depend on build-time site_indexable, not user-agent. Current wrangler configuration enables indexing and disables preview mode. No matching rule blocks homepage, robots.txt, or sitemap.xml.
- Worker logs for Google-InspectionTool in the latest hour contain 13:06:37.854 and 13:13:58.863 requests corresponding to our synthetic checks. No request corresponding to the 13:13:28 homepage or 13:14:47 robots live test is visible in the queried results. Log sampling/completeness limitations apply.
- Expanded older 05:16:45.114 request is also synthetic: non-Google ASN, no verified bot category, HTTP 200. User-agent alone must not be used to identify Google.
- Earlier verified Googlebot request at 03:01:59.749 returned 200 from current Worker version (see 2026-10-12-gsc-followup.md). Do not conflate Googlebot with Google-InspectionTool cache state.

## Assessment

Google-side stale policy or propagation is consistent with the evidence, but exact cached rules/version cannot be established because the report exposes none. No newly confirmed application defect or current Google-specific firewall block was found. No unsupported workaround, security weakening, repeated deployment, or sitemap resubmission was performed.

Google documents the robots report as the way to inspect fetched versions and request a recrawl. That control is currently unavailable for this property. No claim of recovery is justified until a successful GSC sitemap read is observed.

Sources:

- https://support.google.com/webmasters/answer/6062598?hl=en
- https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec

## Suggested Google feedback text (not sent)

For sc-domain:smalltownboyai.video, the robots report displays no robots.txt files, while live URL Inspection reports blocked by robots.txt for both the homepage (2026-10-12 13:13:28 GMT+8) and robots.txt (13:14:47 GMT+8). The public robots file currently returns HTTP 200 and allows both URLs. The sitemap remains Could not fetch. Please investigate the inconsistent robots policy/report state and make the fetched robots version or recrawl control available. No private request logs are included in this draft.
