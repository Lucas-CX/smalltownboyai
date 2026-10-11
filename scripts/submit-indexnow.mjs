import assert from 'node:assert/strict';

const origin = process.env.VITE_SEO_URL;
assert.ok(
  origin && new URL(origin).protocol === 'https:',
  'Set VITE_SEO_URL to your public HTTPS origin'
);
const key = process.env.INDEXNOW_KEY;
assert.ok(
  key && /^[a-zA-Z0-9-]{8,128}$/.test(key),
  'Set your own INDEXNOW_KEY'
);
const keyLocation = `${origin}/${key}.txt`;
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
  assert.equal(response.url, url, `${url}: unexpected redirect`);
  assert.ok(
    !/noindex/i.test(response.headers.get('x-robots-tag') || ''),
    `${url}: noindex header`
  );
  return response;
}

// Submit only after the public deployment is reachable and indexable.
assert.equal(
  (await (await get(keyLocation)).text()).trim(),
  key,
  'Public key file mismatch'
);
const sitemapResponse = await get(`${origin}/sitemap.xml`);
assert.match(sitemapResponse.headers.get('content-type') || '', /xml/);
const sitemap = await sitemapResponse.text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (match) => match[1]
);
assert.ok(
  urlList.length > 0 && urlList.length <= 10000,
  'Empty or oversized sitemap'
);
assert.equal(new Set(urlList).size, urlList.length, 'Duplicate URLs');
for (const url of urlList) {
  assert.equal(new URL(url).origin, origin, 'Unexpected sitemap host');
  const html = await (await get(url)).text();
  assert.ok(
    !/<meta\b[^>]*\bcontent=["'][^"']*noindex/i.test(html),
    `${url}: noindex meta`
  );
  assert.ok(
    html.includes(`rel="canonical" href="${url}"`),
    `${url}: canonical mismatch`
  );
}

if (process.argv.includes('--dry-run')) {
  console.log(
    `IndexNow preflight passed for ${urlList.length} live URLs; no submission made.`
  );
} else {
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(origin).host,
      key,
      keyLocation,
      urlList,
    }),
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(
    [200, 202].includes(response.status),
    `IndexNow rejected: HTTP ${response.status}`
  );
  console.log(
    `IndexNow HTTP ${response.status}: ${urlList.length} URLs received${response.status === 202 ? '; key validation pending' : ''}. This is not indexing confirmation.`
  );
}
