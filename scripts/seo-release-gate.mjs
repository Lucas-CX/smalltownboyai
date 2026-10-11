import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parse as parseJsonc } from 'jsonc-parser';
import { parse as parseHtml } from 'parse5';
import robotsParser from 'robots-parser';

const agents = ['Googlebot', 'Google-InspectionTool', 'OAI-SearchBot'];
const restricted = /\/(?:admin|settings|api|sign-in|sign-up)(?:\/|$)/;
const blockedIndex = /(?:^|[\s,:])(?:noindex|none)(?:$|[\s,;])/i;

export function readConfig(path) {
  const errors = [];
  const config = parseJsonc(readFileSync(path, 'utf8'), errors, {
    allowTrailingComma: true,
  });
  assert.equal(errors.length, 0, `Invalid deployment JSONC: ${path}`);
  return config;
}

export function productionEnv() {
  return parseEnv(readFileSync('.env.production', 'utf8'));
}

export function preflight(env, config, preview = false) {
  for (const key of ['VITE_APP_URL', 'VITE_SEO_URL', 'VITE_SITE_INDEXABLE']) {
    assert.ok(env[key], `Missing production ${key}`);
    assert.equal(
      env[key],
      config.vars?.[key],
      `Build/runtime mismatch: ${key}`
    );
  }
  assert.equal(
    env.VITE_PREVIEW_ONLY ?? 'false',
    config.vars?.VITE_PREVIEW_ONLY ?? 'false',
    'Build/runtime mismatch: VITE_PREVIEW_ONLY'
  );
  const origin = new URL(env.VITE_SEO_URL);
  assert.equal(origin.protocol, 'https:', 'Production origin must use HTTPS');
  assert.equal(
    origin.pathname,
    '/',
    'Production origin must not contain a path'
  );
  assert.ok(
    !origin.search && !origin.hash && !origin.username && !origin.password,
    'Invalid production origin'
  );
  assert.ok(
    !/(^|\.)(localhost|example\.com)$/.test(origin.hostname),
    'Replace placeholder production origin'
  );
  assert.equal(
    new URL(env.VITE_APP_URL).origin,
    origin.origin,
    'App and SEO origins differ'
  );
  const routes = config.routes ?? [];
  if (preview) {
    assert.ok(
      /-(preview|acceptance)$/.test(config.name ?? '') &&
        origin.hostname.startsWith(`${config.name}.`) &&
        origin.hostname.endsWith('.workers.dev'),
      'Preview requires a dedicated -preview or -acceptance Worker and its workers.dev origin'
    );
    assert.equal(
      env.VITE_SITE_INDEXABLE,
      'false',
      'Preview must not be indexable'
    );
    assert.equal(
      routes.length,
      0,
      'Preview must use an isolated Worker without production domain routes'
    );
  } else {
    assert.equal(
      env.VITE_SITE_INDEXABLE,
      'true',
      'Public deployment blocked: indexing is disabled'
    );
    assert.equal(
      env.VITE_PREVIEW_ONLY ?? 'false',
      'false',
      'Public deployment blocked: preview mode is enabled'
    );
    assert.ok(
      routes.some((route) => {
        const pattern = typeof route === 'string' ? route : route.pattern;
        return [
          origin.hostname,
          `${origin.hostname}/*`,
          `${origin.origin}/*`,
        ].includes(pattern);
      }),
      'Canonical domain is not present in Worker routes'
    );
  }
  return origin.origin;
}

async function get(url, agent, fetcher) {
  const response = await fetcher(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': agent, 'Cache-Control': 'no-cache' },
  });
  assert.equal(
    response.status,
    200,
    `${url}: HTTP ${response.status} (${agent})`
  );
  assert.ok(
    !blockedIndex.test(response.headers.get('x-robots-tag') ?? ''),
    `${url}: X-Robots-Tag blocks indexing`
  );
  return { headers: response.headers, body: await response.text() };
}

export function sitemapUrls(xml, origin) {
  assert.ok(
    !/<!DOCTYPE|<!ENTITY/i.test(xml),
    'Sitemap must not contain DTD/entities'
  );
  assert.equal(XMLValidator.validate(xml), true, 'Malformed sitemap XML');
  const root = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
  }).parse(xml).urlset;
  assert.equal(
    root?.['@_xmlns'],
    'http://www.sitemaps.org/schemas/sitemap/0.9',
    'Expected sitemap urlset namespace'
  );
  const entries = root.url
    ? Array.isArray(root.url)
      ? root.url
      : [root.url]
    : [];
  assert.ok(
    entries.length > 0 && entries.length <= 50000,
    'Sitemap must contain 1-50000 URLs'
  );
  const urls = entries.map((entry) => {
    assert.equal(typeof entry.loc, 'string', 'Sitemap entry must have one loc');
    const url = new URL(entry.loc);
    assert.equal(url.origin, origin, 'Sitemap contains another origin');
    assert.ok(
      !url.search && !url.hash && !url.username && !url.password,
      'Sitemap contains noncanonical URL'
    );
    assert.ok(
      !restricted.test(url.pathname),
      'Sitemap contains a private route'
    );
    return url.href;
  });
  assert.equal(new Set(urls).size, urls.length, 'Duplicate sitemap URLs');
  assert.ok(urls.includes(`${origin}/`), 'Sitemap is missing the homepage');
  return urls;
}

export function checkPage(html, url) {
  const metas = [],
    canonicals = [];
  function walk(node) {
    const attrs = Object.fromEntries(
      (node.attrs ?? []).map(({ name, value }) => [name, value])
    );
    if (
      node.tagName === 'meta' &&
      ['robots', 'googlebot'].includes(attrs.name?.toLowerCase())
    )
      metas.push(attrs.content ?? '');
    if (
      node.tagName === 'link' &&
      attrs.rel?.toLowerCase().split(/\s+/).includes('canonical')
    )
      canonicals.push(attrs.href);
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(parseHtml(html));
  assert.ok(
    !metas.some((value) => blockedIndex.test(value)),
    `${url}: meta robots blocks indexing`
  );
  assert.equal(canonicals.length, 1, `${url}: expected one canonical`);
  assert.equal(
    new URL(canonicals[0], url).href,
    url,
    `${url}: canonical differs from sitemap`
  );
}

export async function liveCheck(origin, fetcher = fetch) {
  origin = new URL(origin).origin;
  assert.equal(
    new URL(origin).protocol,
    'https:',
    'Live SEO check requires HTTPS'
  );
  const policies = [];
  for (const agent of agents) {
    const robots = await get(`${origin}/robots.txt`, agent, fetcher);
    assert.match(
      robots.headers.get('content-type') ?? '',
      /^text\/plain\b/i,
      'robots.txt must be plain text'
    );
    const ttl = /(?:^|,)\s*max-age=(\d+)/i.exec(
      robots.headers.get('cache-control') ?? ''
    );
    assert.ok(
      ttl && Number(ttl[1]) <= 300,
      'robots.txt needs an explicit cache lifetime <= 300 seconds'
    );
    const policy = robotsParser(`${origin}/robots.txt`, robots.body);
    assert.ok(
      policy.getSitemaps().includes(`${origin}/sitemap.xml`),
      'robots.txt declares the wrong sitemap'
    );
    for (const path of ['/', '/sitemap.xml'])
      assert.equal(
        policy.isAllowed(origin + path, agent),
        true,
        `${agent} blocked: ${path}`
      );
    for (const path of ['/admin', '/settings', '/api/private'])
      assert.equal(
        policy.isAllowed(origin + path, agent),
        false,
        `${agent}: private robots restriction missing: ${path}`
      );
    policies.push([agent, policy]);
  }
  const sitemap = await get(`${origin}/sitemap.xml`, 'Googlebot', fetcher);
  assert.match(
    sitemap.headers.get('content-type') ?? '',
    /^(application|text)\/xml\b/i,
    'Sitemap must return XML, not an HTML challenge'
  );
  const urls = sitemapUrls(sitemap.body, origin);
  for (const url of urls) {
    for (const [agent, policy] of policies)
      assert.equal(
        policy.isAllowed(url, agent),
        true,
        `${agent} blocked: ${url}`
      );
    const page = await get(url, 'Googlebot', fetcher);
    assert.match(
      page.headers.get('content-type') ?? '',
      /^text\/html\b/i,
      `${url}: expected HTML`
    );
    checkPage(page.body, url);
  }
  return { origin, urls: urls.length, googleReadStatus: 'UNVERIFIED' };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const mode = process.argv[2];
    if (mode === 'preflight') {
      const origin = preflight(
        productionEnv(),
        readConfig('wrangler.jsonc'),
        process.argv.includes('--preview')
      );
      console.log(`SEO deployment preflight passed: ${origin}`);
    } else if (mode === 'live') {
      console.log(
        JSON.stringify(
          await liveCheck(process.argv[3] ?? productionEnv().VITE_SEO_URL)
        )
      );
      console.log(
        'Origin checks passed. Google fetching and indexing remain UNVERIFIED; check GSC live fetch and sitemap status separately.'
      );
    } else
      throw new Error(
        'Usage: seo-release-gate.mjs preflight [--preview] | live [https://origin]'
      );
  } catch (error) {
    console.error(`SEO release gate FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
