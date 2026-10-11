import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  funnelAudience,
  preferredBrowserLanguage,
} from '../src/lib/dance-audience';
import { danceCheckoutPresentation } from '../src/lib/dance-checkout-presentation';
import {
  danceDiscoveryText,
  dancePublicPaths,
} from '../src/lib/dance-discovery';
import {
  funnelBatchSchema,
  funnelParamsSchema,
} from '../src/lib/dance-funnel-contract';
import {
  danceLanguageAlternates,
  danceLocaleHasIndexablePage,
} from '../src/lib/dance-locales';

const readMessages = (locale: string): Record<string, string> =>
  JSON.parse(
    readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')
  );
const placeholders = (text: string) =>
  [...text.matchAll(/\{[^{}]+\}/g)].map(([value]) => value).sort();

test('English and Chinese translations preserve keys and parameters', () => {
  const en = readMessages('en'),
    zh = readMessages('zh');
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en))
    assert.deepEqual(placeholders(zh[key]), placeholders(en[key]), key);
});
test('both locales expose all public pages without market routing', () => {
  for (const path of dancePublicPaths) {
    for (const locale of ['en', 'zh'])
      assert.equal(danceLocaleHasIndexablePage(path, locale), true);
    assert.deepEqual(
      danceLanguageAlternates('https://example.test', path).map(
        (x) => x.hrefLang
      ),
      ['en', 'zh', 'x-default']
    );
    for (const locale of ['it', 'ru', 'pt-BR', 'de', 'pl', 'tr', 'ro'])
      assert.equal(danceLocaleHasIndexablePage(path, locale), false);
  }
  assert.ok(danceDiscoveryText().includes('/zh)'));
});
test('checkout keeps supported languages and falls back for retired ones', () => {
  for (const locale of ['en', 'zh']) {
    const config = danceCheckoutPresentation('https://example.test', locale);
    assert.equal(config.locale, locale);
    assert.ok(
      config.success_url.includes('?locale=' + locale + '&session_id=')
    );
    assert.equal(
      config.cancel_url,
      'https://example.test' +
        (locale === 'en' ? '/' : '/zh') +
        '?checkout=canceled#studio'
    );
  }
  for (const locale of ['it', 'ru', 'pt-BR', 'de', 'pl', 'tr', 'ro', 'invalid'])
    assert.equal(
      danceCheckoutPresentation('https://example.test', locale).locale,
      'en'
    );
  assert.equal(
    funnelBatchSchema.safeParse({
      flowId: crypto.randomUUID(),
      events: [
        { id: crypto.randomUUID(), event: 'begin_checkout', locale: 'de' },
      ],
    }).success,
    false
  );
});
test('browser preference preserves region, handles quality and does not require a page locale', () => {
  assert.equal(preferredBrowserLanguage('pt-br,pt;q=0.9,en;q=0.5'), 'pt-BR');
  assert.equal(preferredBrowserLanguage('en;q=0.3,ro-RO;q=0.9'), 'ro-RO');
  assert.equal(preferredBrowserLanguage('de;q=0,pl-PL;q=0.8'), 'pl-PL');
  assert.equal(preferredBrowserLanguage('fr-CA;q=0.9,de-DE;q=0.9'), 'fr-CA');
  for (const value of [null, '', '*', '<script>', 'en;q=NaN', 'en;q=2'])
    assert.equal(preferredBrowserLanguage(value), 'unknown');
});

test('page language, browser language and country stay separate and unavailable country stays unknown', () => {
  const request = new Request('https://example.test/api/dance/events', {
    headers: { 'accept-language': 'de-DE,de;q=0.9', 'cf-ipcountry': 'BR' },
  });
  assert.deepEqual(funnelAudience(request, 'en', true), {
    audience_version: 'market_20261011',
    browser_language: 'de-DE',
    page_locale: 'en',
    geo_country: 'BR',
    geo_source: 'cloudflare',
  });
  assert.equal(funnelAudience(request, 'zh').geo_country, 'unknown');
  for (const country of ['XX', 'T1', '', 'Germany']) {
    request.headers.set('cf-ipcountry', country);
    assert.equal(funnelAudience(request, 'zh', true).geo_country, 'unknown');
  }
  request.headers.delete('cf-ipcountry');
  Object.defineProperty(request, 'cf', { value: { country: 'PL' } });
  assert.equal(funnelAudience(request, 'en', true).geo_country, 'PL');
  const forged = {
    geo_country: 'US',
    page_locale: 'ru',
    browser_language: 'en-US',
  };
  const persisted = funnelParamsSchema.parse({
    ...forged,
    ...funnelAudience(request, 'zh', true),
  });
  assert.equal(persisted.geo_country, 'PL');
  assert.equal(persisted.page_locale, 'zh');
  assert.equal(persisted.browser_language, 'de-DE');
});
