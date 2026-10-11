import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkPage,
  liveCheck,
  preflight,
  sitemapUrls,
} from '../scripts/seo-release-gate.mjs';

const origin = 'https://product.test';
const env = {
  VITE_APP_URL: origin,
  VITE_SEO_URL: origin,
  VITE_SITE_INDEXABLE: 'true',
  VITE_PREVIEW_ONLY: 'false',
};
const config = () => ({
  vars: { ...env },
  routes: [{ pattern: 'product.test', custom_domain: true }],
});
const xml = (urls = [origin + '/']) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;
const html = (url) =>
  `<html><head><meta name="robots" content="index, follow"><link rel="canonical" href="${url}"></head><body>Product</body></html>`;
const robots = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /settings\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`;

test('public build and runtime must match, including generated Wrangler vars', () => {
  assert.equal(preflight(env, config()), origin);
  for (const key of Object.keys(env)) {
    const wrong = config();
    wrong.vars[key] = 'wrong';
    assert.throws(() => preflight(env, wrong), /mismatch/);
  }
});
test('default release rejects preview, noindex, missing variables and wrong routes', () => {
  for (const changes of [
    { VITE_SITE_INDEXABLE: 'false' },
    { VITE_PREVIEW_ONLY: 'true' },
    { VITE_PREVIEW_ONLY: 'invalid' },
  ]) {
    const values = { ...env, ...changes };
    assert.throws(
      () => preflight(values, { ...config(), vars: values }),
      /blocked/
    );
  }
  assert.throws(() => preflight({}, config()), /Missing/);
  assert.throws(() => preflight(env, { ...config(), routes: [] }), /routes/);
  for (const url of [
    'http://product.test',
    'https://example.com',
    origin + '/path',
  ]) {
    const values = { ...env, VITE_APP_URL: url, VITE_SEO_URL: url };
    assert.throws(() => preflight(values, { ...config(), vars: values }));
  }
});
test('preview opt-in cannot target a custom production domain', () => {
  const previewOrigin = 'https://product-preview.account.workers.dev';
  const values = {
    ...env,
    VITE_APP_URL: previewOrigin,
    VITE_SEO_URL: previewOrigin,
    VITE_SITE_INDEXABLE: 'false',
    VITE_PREVIEW_ONLY: 'true',
  };
  assert.throws(
    () =>
      preflight(
        values,
        { ...config(), name: 'product-preview', vars: values },
        true
      ),
    /isolated/
  );
  assert.equal(
    preflight(
      values,
      { name: 'product-preview', vars: values, routes: [] },
      true
    ),
    previewOrigin
  );
  assert.throws(
    () =>
      preflight(values, { name: 'product', vars: values, routes: [] }, true),
    /dedicated/
  );
  assert.throws(
    () =>
      preflight(
        { ...values, VITE_APP_URL: origin, VITE_SEO_URL: origin },
        {
          name: 'product-preview',
          vars: { ...values, VITE_APP_URL: origin, VITE_SEO_URL: origin },
          routes: [],
        },
        true
      ),
    /dedicated/
  );
});
test('XML validation rejects broken, empty, old-domain, private and duplicate URLs', () => {
  assert.deepEqual(sitemapUrls(xml(), origin), [origin + '/']);
  for (const value of [
    '<urlset>',
    xml([]),
    xml(['https://old.test/']),
    xml([origin + '/', origin + '/admin']),
    xml([origin + '/', origin + '/']),
    '<!DOCTYPE urlset>' + xml(),
  ]) {
    assert.throws(() => sitemapUrls(value, origin));
  }
});
test('HTML parsing rejects noindex and bad canonicals regardless of attribute order', () => {
  checkPage(html(origin + '/'), origin + '/');
  assert.throws(
    () =>
      checkPage(
        html(origin + '/').replace('index, follow', 'noindex'),
        origin + '/'
      ),
    /blocks/
  );
  assert.throws(
    () =>
      checkPage(
        `<meta content='none' name='googlebot'><link href='${origin}/' rel='canonical'>`,
        origin + '/'
      ),
    /blocks/
  );
  assert.throws(
    () => checkPage(html('https://old.test/'), origin + '/'),
    /differs/
  );
  assert.throws(
    () => checkPage('<html>Challenge</html>', origin + '/'),
    /canonical/
  );
});

function fixture(override = () => null) {
  return async (url, options) => {
    assert.equal(options.redirect, 'manual');
    const modified = override(url, options);
    if (modified) return modified;
    if (url.endsWith('/robots.txt'))
      return new Response(robots, {
        headers: {
          'content-type': 'text/plain',
          'cache-control': 'public, max-age=300',
        },
      });
    if (url.endsWith('/sitemap.xml'))
      return new Response(xml(), {
        headers: { 'content-type': 'application/xml' },
      });
    return new Response(html(url), {
      headers: { 'content-type': 'text/html' },
    });
  };
}
test('live check covers bot policies and every sitemap page without claiming Google success', async () => {
  assert.deepEqual(await liveCheck(origin, fixture()), {
    origin,
    urls: 1,
    googleReadStatus: 'UNVERIFIED',
  });
});
test('live failures block redirects, challenges, stale policies and index headers', async () => {
  for (const status of [301, 403, 429, 500, 522]) {
    await assert.rejects(
      liveCheck(
        origin,
        fixture(() => new Response('', { status }))
      ),
      /HTTP/
    );
  }
  await assert.rejects(
    liveCheck(
      origin,
      fixture(
        () => new Response('', { headers: { 'x-robots-tag': 'noindex' } })
      )
    ),
    /X-Robots/
  );
  for (const body of [
    robots.replace('Allow: /', 'Disallow: /'),
    robots + '\nUser-agent: Googlebot\nDisallow: /\n',
    robots.replace(origin, 'https://old.test'),
  ]) {
    await assert.rejects(
      liveCheck(
        origin,
        fixture(
          (url) =>
            url.endsWith('/robots.txt') &&
            new Response(body, {
              headers: {
                'content-type': 'text/plain',
                'cache-control': 'max-age=300',
              },
            })
        )
      )
    );
  }
  await assert.rejects(
    liveCheck(
      origin,
      fixture(
        (url) =>
          url.endsWith('/robots.txt') &&
          new Response(robots, {
            headers: {
              'content-type': 'text/plain',
              'cache-control': 'max-age=86400',
            },
          })
      )
    ),
    /cache lifetime/
  );
  await assert.rejects(
    liveCheck(
      origin,
      fixture(
        (url) =>
          url.endsWith('/sitemap.xml') &&
          new Response('<html>Challenge</html>', {
            headers: { 'content-type': 'text/html' },
          })
      )
    ),
    /XML/
  );
});
