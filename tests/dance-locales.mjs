import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const markets = ['zh'];
const read = (path) =>
  readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const english = JSON.parse(read('messages/en.json'));
const placeholders = (value) =>
  [...value.matchAll(/\{[^{}]+\}/g)].map(([v]) => v).sort();
const assets = (value) =>
  [...value.matchAll(/(?:src|poster)="([^"]+)"/g)].map(([, v]) => v).sort();
const links = (value) =>
  [...value.matchAll(/\]\(([^)]+)\)/g)].map(([, v]) => v).sort();
const slugs = readdirSync(new URL('../src/content/pages/', import.meta.url))
  .filter((name) => name.endsWith('.en.mdx'))
  .map((name) => name.slice(0, -7));
const translatedSlugs = (locale) =>
  readdirSync(new URL('../src/content/pages/', import.meta.url))
    .filter((name) => name.endsWith(`.${locale}.mdx`))
    .map((name) => name.slice(0, -(locale.length + 5)))
    .filter((slug) => slugs.includes(slug));
for (const locale of markets) {
  const messages = JSON.parse(read('messages/' + locale + '.json'));
  assert.deepEqual(
    Object.keys(messages)
      .filter(
        (key) => !key.startsWith('market.') && !key.startsWith('admin.metrics.')
      )
      .sort(),
    Object.keys(english)
      .filter(
        (key) => !key.startsWith('market.') && !key.startsWith('admin.metrics.')
      )
      .sort(),
    locale
  );
  for (const [key, value] of Object.entries(messages)) {
    assert.ok(value.trim() || !english[key].trim(), locale + ': ' + key);
    assert.deepEqual(
      placeholders(value),
      placeholders(english[key]),
      locale + ': ' + key
    );
    assert.ok(!/ZXQ\d+QXZ|\[\[\d+\]\]/.test(value), locale + ': ' + key);
  }
  for (const slug of translatedSlugs(locale)) {
    const source = read('src/content/pages/' + slug + '.en.mdx');
    const localized = read('src/content/pages/' + slug + '.' + locale + '.mdx');
    assert.deepEqual(
      assets(localized),
      assets(source),
      locale + ': ' + slug + ' assets'
    );
    assert.deepEqual(
      links(localized),
      links(source),
      locale + ': ' + slug + ' links'
    );
  }
}
console.log(
  'Translation keys, placeholders, MDX assets and links passed for English and Chinese.'
);

if (process.env.I18N_TEST_URL) {
  const base = process.env.I18N_TEST_URL;
  const origin = process.env.I18N_TEST_ORIGIN || 'http://localhost:3000';
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  const indexable = process.env.I18N_TEST_INDEXABLE === 'true';
  for (const locale of markets) {
    for (const path of [
      '/',
      '/pricing',
      ...translatedSlugs(locale).map((slug) => '/' + slug),
    ]) {
      const localizedPath = '/' + locale + (path === '/' ? '' : path);
      const response = await fetch(base + localizedPath);
      assert.equal(response.status, 200, localizedPath);
      const html = await response.text();
      assert.ok(html.includes('<html lang="' + locale + '"'), localizedPath);
      assert.ok(
        html.includes('rel="canonical" href="' + origin + localizedPath + '"'),
        localizedPath
      );
      assert.equal(
        /name="robots" content="noindex/.test(html),
        !indexable,
        localizedPath
      );
      assert.equal(
        sitemap.includes('<loc>' + origin + localizedPath + '</loc>'),
        indexable,
        localizedPath
      );
      for (const alternate of ['en', 'zh', ...markets, 'x-default']) {
        assert.ok(
          html.includes('hrefLang="' + alternate + '"') ||
            html.includes('hreflang="' + alternate + '"'),
          localizedPath + ': ' + alternate
        );
      }
      if (path === '/') {
        const messages = JSON.parse(read('messages/' + locale + '.json'));
        assert.ok(
          html.includes(messages['dance.generator']),
          localizedPath + ' translated H1'
        );
      }
    }
    const signIn = await (await fetch(base + '/' + locale + '/sign-in')).text();
    assert.ok(signIn.includes('<html lang="' + locale + '"'));
    assert.ok(/name="robots" content="noindex/.test(signIn));
  }
  console.log(
    'All 33 localized public routes, SEO alternates, sitemap, H1 and private login indexing passed.'
  );
}
