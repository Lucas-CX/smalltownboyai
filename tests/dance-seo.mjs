import assert from 'node:assert/strict';

const base = process.env.SEO_TEST_URL || 'http://localhost:3000';
const indexable = process.env.SEO_TEST_INDEXABLE === 'true';
const oldContent =
  /gas.?station.?dance|加油站|gas-station-dance|support@gasstationdance/i;
const paths = [
  '/',
  '/pricing',
  '/about',
  '/contact',
  '/privacy-policy',
  '/terms-of-service',
  '/refund-policy',
];
function decodeHtml(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
const discovery = await (await fetch(base + '/llms-full.txt')).text();
for (const locale of ['en', 'zh']) {
  const prefix = locale === 'en' ? '' : '/' + locale;
  for (const path of paths) {
    const url = base + prefix + (path === '/' ? '' : path);
    const response = await fetch(url);
    assert.equal(response.status, 200, url);
    const html = await response.text();
    assert.doesNotMatch(html, oldContent, url);
    assert.match(html, /rel="canonical"/, url);
    assert.equal(/name="robots" content="noindex/.test(html), !indexable, url);
    assert.doesNotMatch(
      html,
      /"@type":"VideoObject"/,
      'No historical sample claims'
    );
    if (path === '/') {
      assert.equal([...html.matchAll(/<h1\b/g)].length, 1, 'One homepage H1');
      assert.match(html, /<title>[^<]*Smalltown Boy/, 'Trend-specific title');
      assert.match(
        html,
        /id="dance-trend-heading"/,
        'Trend explanation is server rendered'
      );
      const faq = html.match(
        /<section id="faq"[^>]*>([\s\S]*?)<\/section>/
      )?.[1];
      assert.ok(faq, 'FAQ is present without JavaScript');
      const visible = [
        ...faq.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g),
      ].map((match) => ({
        question: decodeHtml(match[1]),
        answer: decodeHtml(match[2]),
      }));
      const schemas = [
        ...html.matchAll(
          /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
        ),
      ].map((match) => JSON.parse(match[1]));
      const faqSchema = schemas.find((schema) => schema['@type'] === 'FAQPage');
      assert.ok(faqSchema, 'FAQ structured data exists');
      assert.ok(
        visible.length >= 12,
        'FAQ covers the researched user decisions'
      );
      assert.deepEqual(
        faqSchema.mainEntity.map((entry) => ({
          question: entry.name,
          answer: entry.acceptedAnswer.text,
        })),
        visible,
        'Visible FAQ and structured data must agree'
      );
      if (locale === 'en') {
        for (const entry of visible) {
          assert.ok(
            discovery.includes(entry.question),
            'Discovery includes each question'
          );
          assert.ok(
            discovery.includes(entry.answer),
            'Discovery uses the same answer'
          );
        }
      }
    }
  }
}
for (const path of [
  '/gas-station-dance',
  '/gas-station-dance-example',
  '/what-is-gas-station-dance',
  '/how-to-make-gas-station-dance-ai-video',
  '/gas-station-dance-ai',
  '/gas-station-dance-template',
  '/gas-station-dance-photo-guide',
  '/gas-station-dance-prompt',
  '/best-gas-station-dance-ai-generator',
  '/guides',
]) {
  for (const prefix of ['', '/zh'])
    assert.equal(
      (await fetch(base + prefix + path, { redirect: 'manual' })).status,
      404,
      prefix + path
    );
}
for (const path of ['/sitemap.xml', '/llms.txt', '/llms-full.txt']) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  assert.doesNotMatch(await response.text(), oldContent, path);
}
console.log(
  'Template pages, metadata, discovery and retired-route checks passed.'
);
