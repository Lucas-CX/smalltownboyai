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
for (const locale of ['en', 'zh', 'it', 'ru', 'pt-BR']) {
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
