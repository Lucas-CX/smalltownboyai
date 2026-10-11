import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deLocalizeUrl, localizeUrl } from '../src/core/i18n/urls';
import {
  locales,
  deLocalizeUrl as originalDeLocalize,
  localizeUrl as originalLocalize,
} from '../src/paraglide/runtime.js';

test('fast router URL rules match Paraglide for public, private and API routes', () => {
  const paths = [
    '/',
    '/pricing',
    '/pricing/',
    '/sign-in',
    '/settings/credits',
    '/api',
    '/api/auth/session',
    '/italy',
    '/ruins',
    '/foo//bar',
    '/%D0%B2%D0%B8%D0%B4%D0%B5%D0%BE',
  ];
  for (const prefix of [
    '',
    ...locales
      .filter((locale) => locale !== 'en')
      .map((locale) => '/' + locale),
  ]) {
    for (const path of paths) {
      const source = new URL(
        'https://example.test:8443' +
          prefix +
          path +
          '?resume=1&next=%2Fpricing#studio'
      );
      const before = source.href;
      assert.equal(
        deLocalizeUrl(source).href,
        originalDeLocalize(source).href,
        before
      );
      for (const locale of locales) {
        assert.equal(
          localizeUrl(source, { locale }).href,
          originalLocalize(source, { locale }).href,
          before + ' -> ' + locale
        );
      }
      assert.equal(
        source.href,
        before,
        'Router callers retain their URL object'
      );
    }
    if (prefix) {
      for (const locale of locales)
        assert.equal(
          localizeUrl('https://example.test' + prefix, { locale }).href,
          originalLocalize('https://example.test' + prefix, { locale }).href
        );
    }
  }
});
