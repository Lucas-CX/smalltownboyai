import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = process.env.SEO_TEST_URL || 'http://localhost:3000';
const indexable = process.env.SEO_TEST_INDEXABLE === 'true';
const origin = 'https://gasstationdance.video';
const sitemap = await (await fetch(base + '/sitemap.xml')).text();
for (const locale of ['de', 'pl', 'tr', 'ro']) {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
  const paths = ['de', 'pl'].includes(locale)
    ? ['', '/pricing', '/sign-in']
    : [''];
  for (const path of paths) {
    const response = await fetch(base + '/' + locale + path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`<html lang="${locale}"`));
    if (path !== '/sign-in')
      assert.equal((html.match(/<h1[ >]/g) || []).length, 1, locale + path);
    if (path === '/sign-in') {
      assert.match(html, /noindex/);
      assert.ok(html.includes(messages['common.sign.sign_in_title']));
      continue;
    }
    assert.ok(
      html.includes(`rel="canonical" href="${origin}/${locale}${path}"`)
    );
    assert.equal(/name="robots" content="noindex/.test(html), !indexable);
    assert.equal(
      sitemap.includes(`<loc>${origin}/${locale}${path}</loc>`),
      indexable
    );
    if (!path) {
      assert.ok(
        html.includes(
          messages[
            ['tr', 'ro'].includes(locale) ? 'market.title' : 'dance.generator'
          ]
        )
      );
      assert.ok(
        html.includes('hrefLang="en"') || html.includes('hreflang="en"')
      );
      if (['tr', 'ro'].includes(locale)) {
        assert.ok(html.includes('href="/?market_entry=1#studio"'));
        assert.ok(
          !html.includes('"@type":"FAQPage"'),
          'no hidden English FAQ schema'
        );
        assert.ok(
          !html.includes('type="file"'),
          'entry pilot does not imply a localized generator'
        );
      } else {
        assert.match(
          html,
          /href="\/refund-policy"[^>]*href[Ll]ang="en"|href[Ll]ang="en"[^>]*href="\/refund-policy"/
        );
      }
    }
  }
  for (const path of [
    '/guides',
    '/about',
    '/privacy-policy',
    '/gas-station-dance-example',
  ]) {
    const response = await fetch(base + '/' + locale + path + '?ref=test', {
      redirect: 'manual',
    });
    assert.equal(response.status, 302);
    assert.equal(
      new URL(response.headers.get('location'), base).pathname,
      path
    );
    assert.equal(
      new URL(response.headers.get('location'), base).search,
      '?ref=test'
    );
    assert.ok(!sitemap.includes(`<loc>${origin}/${locale}${path}</loc>`));
  }
}
console.log(
  'Market HTTP PASS: localized pages/auth, canonicals, hreflang, sitemap scope and English article redirects.'
);
