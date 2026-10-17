import assert from 'node:assert/strict';

const base = process.env.SEO_TEST_URL || 'http://localhost:3000';
const indexable = process.env.SEO_TEST_INDEXABLE === 'true';
const previewOnly = process.env.SEO_TEST_PREVIEW === 'true';
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
  '/guides',
  '/how-to-make-smalltown-boy-ai-video',
  '/smalltown-boy-cat-dance',
  '/smalltown-boy-photo-guide',
  '/smalltown-boy-video-options',
  '/smalltown-boy-sample',
  '/smalltown-boy-generator-comparison',
];
const guidePaths = paths.slice(paths.indexOf('/guides'));
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
    assert.match(
      html,
      /property="og:image" content="https?:[^\"]+poster.webp"/,
      url
    );
    assert.match(html, /name="twitter:image"/, url);
    assert.doesNotMatch(
      html,
      /ShipAny|development sample|开发样例|demo or test checkout|演示或测试结账/,
      url
    );
    if (path === '/contact') {
      assert.match(html, /href="mailto:support@smalltownboyai.video"/, url);
    }
    assert.equal(/name="robots" content="noindex/.test(html), !indexable, url);
    if (guidePaths.includes(path)) {
      assert.equal([...html.matchAll(/<h1\b/g)].length, 1, url + ': one H1');
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      assert.equal(
        new URL(canonical).pathname,
        prefix + path,
        url + ': canonical locale'
      );
      for (const language of ['en', 'zh', 'x-default'])
        assert.ok(
          html.includes(`hrefLang="${language}"`) ||
            html.includes(`hreflang="${language}"`),
          url + ': language alternate'
        );
      assert.match(
        html,
        path === '/guides' ? /"@type":"CollectionPage"/ : /"@type":"Article"/,
        url
      );
      const reviewedAt = [
        '/guides',
        '/smalltown-boy-sample',
        '/smalltown-boy-generator-comparison',
      ].includes(path)
        ? '2026-10-17'
        : '2026-10-13';
      assert.ok(
        html.includes(`"dateModified":"${reviewedAt}"`),
        url + ': content review date'
      );
      assert.ok(discovery.includes(path), url + ': AI discovery');
      if (path === '/guides') {
        for (const guide of guidePaths.filter((item) => item !== '/guides'))
          assert.ok(
            html.includes(`href="${prefix + guide}"`),
            url + ': localized guide link'
          );
      }
      if (path === '/smalltown-boy-sample') {
        for (const asset of ['input-1.webp', 'input-2.webp', 'example.mp4'])
          assert.ok(
            html.includes('/media/smalltown-duo-v1/' + asset),
            url + ': sample evidence'
          );
        assert.match(html, /preload="none"/, url + ': no eager video download');
        assert.match(
          html,
          locale === 'en' ? /added after generation/ : /生成后添加/,
          url + ': audio disclosure'
        );
      }
    }
    if (previewOnly) {
      assert.doesNotMatch(
        html,
        /"@type":"Offer(?:Catalog)?"/,
        'Preview must not advertise purchasable structured offers'
      );
      if (path === '/') {
        assert.match(
          html,
          locale === 'en'
            ? /Can I purchase or generate a video on this site yet/
            : /现在可以在网站购买或生成视频吗/
        );
      }
    }
    const videoSchemas = [
      ...html.matchAll(
        /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
      ),
    ]
      .map((match) => JSON.parse(match[1]))
      .filter((schema) => schema['@type'] === 'VideoObject');
    assert.equal(
      videoSchemas.length,
      path === '/smalltown-boy-sample' ? 1 : 0,
      url + ': only the actual sample page describes a video'
    );
    if (videoSchemas.length) {
      const video = videoSchemas[0];
      assert.equal(
        new URL(video.contentUrl).pathname,
        '/media/smalltown-duo-v1/example.mp4'
      );
      assert.equal(
        new URL(video.thumbnailUrl).pathname,
        '/media/smalltown-duo-v1/poster.webp'
      );
      assert.equal(video.duration, 'PT14S');
      assert.equal(video.uploadDate, '2026-10-11');
      assert.match(
        video.description,
        locale === 'en' ? /added after generation/ : /生成后添加/
      );
      assert.ok(
        html.includes('2026') && html.includes('11'),
        'Publication information is visible'
      );
    }
    if (path === '/smalltown-boy-generator-comparison') {
      assert.doesNotMatch(
        html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)?.[1] ?? '',
        /\*\*/,
        url + ': emphasis renders without Markdown delimiters'
      );
      assert.match(
        html,
        /https:\/\/viggle.ai\/tools\/ai-dance\//,
        url + ': comparison sources'
      );
      assert.match(
        html,
        locale === 'en' ? /not an independent ranking/ : /不是独立排行榜/,
        url + ': comparison disclosure'
      );
    }
    if (path === '/') {
      assert.equal([...html.matchAll(/<h1\b/g)].length, 1, 'One homepage H1');
      assert.match(
        html,
        /href="(?:\/zh)?\/about"/,
        'About is linked from homepage'
      );
      assert.ok(
        html.includes(`href="${prefix}/guides"`),
        'Guides linked from homepage'
      );
      assert.match(
        html,
        locale === 'zh' ? />关于我们<\/a>/ : />About<\/a>/,
        'About link uses the active locale'
      );
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
  const body = await response.text();
  assert.doesNotMatch(body, oldContent, path);
  if (path === '/sitemap.xml' && indexable) {
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => new URL(match[1]).pathname
    );
    assert.equal(urls.length, paths.length * 2, 'Both locales in sitemap');
    assert.equal(new Set(urls).size, urls.length, 'No duplicate sitemap URLs');
    for (const guide of guidePaths)
      for (const prefix of ['', '/zh'])
        assert.ok(urls.includes(prefix + guide), 'Guide discoverability');
  }
}
console.log(
  'Template pages, metadata, discovery and retired-route checks passed.'
);
