import assert from 'node:assert/strict';
import { test } from 'node:test';

import { installBrowserLocaleCache } from '../src/core/i18n/locale-cache';
import { getLocale, overwriteGetLocale } from '../src/paraglide/runtime.js';

test('locale cache stays browser-only and invalidates on URL/cookie changes', () => {
  const original = getLocale;
  let calls = 0;
  let selected: 'en' | 'zh' | 'ru' = 'en';
  overwriteGetLocale(() => {
    calls++;
    return selected;
  });
  installBrowserLocaleCache();
  getLocale();
  getLocale();
  assert.equal(calls, 2, 'Server resolution must never be cached globally');
  const location = { href: 'https://example.test/' };
  const document = { cookie: 'PARAGLIDE_LOCALE=en' };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
  });
  try {
    installBrowserLocaleCache();
    for (let i = 0; i < 100; i++) assert.equal(getLocale(), 'en');
    assert.equal(calls, 3);
    location.href = 'https://example.test/zh';
    selected = 'zh';
    assert.equal(getLocale(), 'zh');
    assert.equal(calls, 4);
    document.cookie = 'PARAGLIDE_LOCALE=ru';
    selected = 'ru';
    assert.equal(getLocale(), 'ru');
    assert.equal(calls, 5);
    installBrowserLocaleCache();
    assert.equal(getLocale(), 'ru');
    assert.equal(calls, 5, 'Install is idempotent');
  } finally {
    overwriteGetLocale(original);
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
  }
});
