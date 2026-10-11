import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  funnelAudience,
  preferredBrowserLanguage,
} from '../src/lib/dance-audience';
import { danceCheckoutPresentation } from '../src/lib/dance-checkout-presentation';
import { danceDiscoveryText } from '../src/lib/dance-discovery';
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

test('translations preserve values and payment brands across all nine languages', () => {
  const source = readMessages('en');
  for (const locale of ['zh', 'it', 'ru', 'pt-BR', 'de', 'pl', 'tr', 'ro']) {
    for (const [key, value] of Object.entries(readMessages(locale))) {
      assert.ok(key in source, `${locale}: unknown ${key}`);
      assert.deepEqual(
        placeholders(value),
        placeholders(source[key]),
        `${locale}: ${key}`
      );
      if (/\bStripe\b/.test(source[key])) {
        assert.match(
          value,
          /\bStripe\b/,
          `${locale}: payment brand lost in ${key}`
        );
      }
    }
  }
});

test('pilot translates every studio message and auth message with intact dynamic values', () => {
  const english = readMessages('en');
  for (const locale of ['de', 'pl']) {
    const messages = readMessages(locale);
    for (const key of Object.keys(english).filter((key) =>
      /^(dance\.|common\.sign\.|common\.auth_callback\.)/.test(key)
    )) {
      assert.ok(key in messages, `${locale}: missing ${key}`);
      assert.ok(
        messages[key].trim() || !english[key].trim(),
        `${locale}: empty ${key}`
      );
      assert.deepEqual(
        placeholders(messages[key]),
        placeholders(english[key]),
        `${locale}: ${key}`
      );
    }
    for (const key of Object.keys(messages)) assert.ok(key in english, key);
  }
});

test('pilot exposes only translated public pages in hreflang and discovery', () => {
  for (const locale of ['tr', 'ro']) {
    assert.equal(danceLocaleHasIndexablePage('/', locale), true);
    assert.equal(danceLocaleHasIndexablePage('/pricing', locale), false);
    assert.equal(danceLocaleHasIndexablePage('/guides', locale), false);
    const source = readMessages('en');
    const translated = readMessages(locale);
    for (const key of Object.keys(source).filter((key) =>
      key.startsWith('market.')
    )) {
      assert.ok(translated[key], `${locale}: ${key}`);
      assert.deepEqual(
        placeholders(translated[key]),
        placeholders(source[key])
      );
    }
  }
  for (const locale of ['de', 'pl']) {
    assert.equal(danceLocaleHasIndexablePage('/', locale), true);
    assert.equal(danceLocaleHasIndexablePage('/pricing', locale), true);
    for (const path of [
      '/guides',
      '/about',
      '/privacy-policy',
      '/gas-station-dance-example',
    ]) {
      assert.equal(danceLocaleHasIndexablePage(path, locale), false);
      assert.ok(
        !danceLanguageAlternates('https://example.test', path).some(
          (link) => link.hrefLang === locale
        )
      );
    }
    assert.ok(
      danceLanguageAlternates('https://example.test', '/').some(
        (link) => link.hrefLang === locale
      )
    );
    const discovery = danceDiscoveryText();
    assert.ok(discovery.includes('/' + locale + ')'));
    assert.ok(!discovery.includes('/' + locale + '/what-is-gas-station-dance'));
  }
  assert.equal(
    danceLocaleHasIndexablePage('/gas-station-dance-example', 'it'),
    false
  );
});

test('German and Polish checkout preserve locale in payment, return and cancel URLs', () => {
  for (const locale of ['de', 'pl']) {
    const config = danceCheckoutPresentation('https://example.test', locale);
    assert.equal(config.locale, locale);
    assert.equal(
      config.cancel_url,
      `https://example.test/${locale}?checkout=canceled#studio`
    );
    assert.ok(config.success_url.includes(`?locale=${locale}&session_id=`));
    const batch = funnelBatchSchema.parse({
      flowId: crypto.randomUUID(),
      events: [
        {
          id: crypto.randomUUID(),
          event: 'begin_checkout',
          locale,
        },
      ],
    });
    assert.equal(batch.events[0].locale, locale);
  }
  assert.equal(
    danceCheckoutPresentation('https://example.test', 'invalid').locale,
    'en'
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
  assert.equal(funnelAudience(request, 'pl').geo_country, 'unknown');
  for (const country of ['XX', 'T1', '', 'Germany']) {
    request.headers.set('cf-ipcountry', country);
    assert.equal(funnelAudience(request, 'de', true).geo_country, 'unknown');
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
    ...funnelAudience(request, 'de', true),
  });
  assert.equal(persisted.geo_country, 'PL');
  assert.equal(persisted.page_locale, 'de');
  assert.equal(persisted.browser_language, 'de-DE');
});
