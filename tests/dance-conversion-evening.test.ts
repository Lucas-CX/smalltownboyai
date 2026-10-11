import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import {
  analyticsLocation,
  analyticsPageAllowed,
  analyticsReferrer,
  googleAnalyticsBootstrap,
} from '../src/lib/analytics-policy';
import {
  authFailureReason,
  runtimeDiagnostic,
} from '../src/lib/dance-diagnostics';
import {
  DANCE_CONVERSION_VERSION,
  funnelBatchSchema,
  funnelParamsSchema,
} from '../src/lib/dance-funnel-contract';
import { danceProgress } from '../src/lib/dance-progress';
import {
  clearPurchaseIntent,
  readPurchaseIntent,
  savePurchaseIntent,
} from '../src/lib/dance-purchase-intent';
import {
  loadDanceResolution,
  saveDanceResolution,
} from '../src/lib/dance-settings';

function storage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}
const intent = {
  packId: 'friends' as const,
  resolution: '720P' as const,
  requestKey: crypto.randomUUID(),
};
test('blocked browser preference storage never breaks rendering or resolution selection', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('SecurityError');
      },
    });
    assert.equal(loadDanceResolution(), undefined);
    assert.doesNotThrow(() => saveDanceResolution('720P'));
    const store = storage();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: store,
    });
    saveDanceResolution('1080P');
    assert.equal(loadDanceResolution(), '1080P');
    store.setItem('dance-resolution', 'invalid');
    assert.equal(loadDanceResolution(), undefined);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
test('login restores chosen pack/quality and same request key; refresh cannot create a new key', () => {
  const store = storage();
  savePurchaseIntent(store, intent, 1000);
  const first = readPurchaseIntent(store, 'account-a', 2000)!;
  assert.equal(first.packId, 'friends');
  assert.equal(first.resolution, '720P');
  assert.equal(first.requestKey, intent.requestKey);
  assert.deepEqual(readPurchaseIntent(store, 'account-a', 3000), first);
  assert.equal(readPurchaseIntent(store, 'account-b', 3000), undefined);
  assert.equal(readPurchaseIntent(store, 'account-a', 3000), undefined);
});
test('expired, malformed and canceled intentions cannot be restored', () => {
  const store = storage();
  savePurchaseIntent(store, intent, 1000);
  assert.equal(readPurchaseIntent(store, 'a', 1000 + 30 * 60_000), undefined);
  savePurchaseIntent(store, intent, 1000);
  clearPurchaseIntent(store);
  assert.equal(readPurchaseIntent(store, 'a', 2000), undefined);
  store.setItem('dance-purchase-intent-v1', '{bad');
  assert.equal(readPurchaseIntent(store, 'a', 2000), undefined);
  assert.equal(store.map.size, 0);
  assert.throws(() =>
    savePurchaseIntent(store, { ...intent, packId: 'fake' as 'friends' })
  );
  assert.throws(
    () =>
      savePurchaseIntent(
        {
          ...store,
          setItem: () => {
            throw new Error('quota');
          },
        },
        intent
      ),
    /quota/
  );
});
test('waiting time distinguishes stages and does not invent a completion estimate', () => {
  const job = { status: 'queued', createdAt: 1000, expired: false };
  assert.deepEqual(danceProgress(job, 1899_000), {
    stage: 'queued',
    minutes: 14,
    delayed: false,
  });
  assert.deepEqual(danceProgress(job, 1900_000), {
    stage: 'queued',
    minutes: 15,
    delayed: true,
  });
  assert.equal(
    danceProgress({ ...job, status: 'generating' }, 1900_000)?.stage,
    'generating'
  );
  assert.equal(
    danceProgress({ ...job, status: 'reconciling' }, 1900_000)?.stage,
    'reconciling'
  );
  assert.equal(danceProgress(job, 0)?.minutes, 0);
  for (const status of ['succeeded', 'failed', 'deleted', 'unpaid'])
    assert.equal(danceProgress({ ...job, status }), null);
  assert.equal(danceProgress({ ...job, expired: true }), null);
});
test('authentication reasons are actionable without disclosing credentials', () => {
  for (const code of [
    'USER_NOT_FOUND',
    'INVALID_PASSWORD',
    'INVALID_EMAIL_OR_PASSWORD',
  ])
    assert.equal(authFailureReason({ code }), 'invalid_credentials');
  assert.equal(
    authFailureReason({ code: 'EMAIL_NOT_VERIFIED' }),
    'email_not_verified'
  );
  assert.equal(authFailureReason({ status: 429 }), 'rate_limited');
  assert.equal(authFailureReason({ status: 503 }), 'auth_service_unavailable');
  assert.equal(
    authFailureReason(new TypeError('secret URL')),
    'network_or_client'
  );
  assert.equal(
    authFailureReason({ message: 'customer@example.com' }),
    'auth_failed'
  );
});
test('runtime diagnostics never retain exception text, stack, URL or raw user agent', () => {
  const diagnostic = runtimeDiagnostic(
    new TypeError('private photo and email'),
    'https://site.test/assets/app.js?token=secret',
    22,
    'https://site.test',
    'Version/18 Safari/private'
  );
  assert.equal(diagnostic.error_source, 'first_party');
  assert.equal(diagnostic.browser_family, 'safari');
  assert.equal(diagnostic.error_kind, 'TypeError');
  assert.match(diagnostic.error_fingerprint, /^[a-f0-9]{8}$/);
  assert.doesNotMatch(
    JSON.stringify(diagnostic),
    /private|secret|photo|https|Safari\//
  );
  assert.equal(
    runtimeDiagnostic({}, '', -5, 'https://site.test', '').error_source,
    'opaque'
  );
  assert.equal(
    runtimeDiagnostic({}, 'https://third.test/a', 2, 'https://site.test', '')
      .error_source,
    'third_party'
  );
  assert.ok(funnelParamsSchema.safeParse(diagnostic).success);
});
test('telemetry supports new actions and old cached clients, rejects unsafe diagnostic dimensions', () => {
  for (const version of ['conversion_20261009', DANCE_CONVERSION_VERSION])
    assert.ok(
      funnelParamsSchema.safeParse({ conversion_version: version }).success
    );
  for (const event of [
    'dance_photo_picker_opened',
    'dance_photo_picker_canceled',
    'dance_purchase_restored',
    'dance_article_studio_clicked',
  ]) {
    assert.ok(
      funnelBatchSchema.safeParse({
        flowId: crypto.randomUUID(),
        events: [{ id: crypto.randomUUID(), event, params: { stage: 'hero' } }],
      }).success
    );
  }
  assert.equal(
    funnelParamsSchema.safeParse({ error_fingerprint: 'customer@example.com' })
      .success,
    false
  );
  assert.equal(
    funnelParamsSchema.safeParse({ entry_article: 'https://private.test' })
      .success,
    false
  );
  assert.deepEqual(
    funnelParamsSchema.parse({ message: 'secret', stack: 'secret' }),
    {}
  );
});
test('public acquisition survives while private paths and auth/payment referrals are excluded', () => {
  for (const path of [
    '/admin',
    '/zh/admin/users',
    '/zh/settings',
    '/sign-in',
    '/api/dance',
  ])
    assert.equal(analyticsPageAllowed(path), false);
  assert.equal(analyticsPageAllowed('/what-is-gas-station-dance'), true);
  assert.equal(
    analyticsLocation(
      'https://site.test/?utm_source=chatgpt.com&code=secret&email=user@example.com#orders'
    ),
    'https://site.test/?utm_source=chatgpt.com'
  );
  for (const ref of [
    'https://accounts.google.com/a',
    'https://checkout.stripe.com/c/pay/secret',
    'https://site.test/sign-in',
  ])
    assert.equal(
      analyticsReferrer(ref, 'https://site.test').ignore_referrer,
      true
    );
  assert.deepEqual(
    analyticsReferrer(
      'https://www.google.com/search?q=secret',
      'https://site.test'
    ),
    { page_referrer: 'https://www.google.com', ignore_referrer: false }
  );
});
test('the actual GA bootstrap executes independently and never configures private/diagnostic visits', () => {
  for (const [path, diagnostic, expected] of [
    ['/', false, 1],
    ['/zh/admin', false, 0],
    ['/', true, 0],
  ] as const) {
    const context: Record<string, any> = {
      URL,
      URLSearchParams,
      location: new URL(
        'https://site.test' + path + '?utm_source=chatgpt.com&token=secret'
      ),
      document: { referrer: 'https://checkout.stripe.com/private' },
      sessionStorage: { getItem: () => (diagnostic ? '1' : null) },
    };
    context.window = context;
    vm.runInNewContext(googleAnalyticsBootstrap('G-TEST'), context);
    const configs = context.dataLayer.filter(
      (args: any) => args[0] === 'config'
    );
    assert.equal(configs.length, expected);
    assert.equal(context['ga-disable-G-TEST'], !expected);
    if (expected) {
      assert.equal(configs[0][2].ignore_referrer, true);
      assert.doesNotMatch(configs[0][2].page_location, /secret|token/);
    }
  }
  assert.doesNotMatch(googleAnalyticsBootstrap('</script>'), /<\/script>/);
});
test('UI copy matches each language support scope and preserves placeholders', () => {
  const locales = JSON.parse(
    readFileSync('project.inlang/settings.json', 'utf8')
  ).locales;
  const en = JSON.parse(readFileSync('messages/en.json', 'utf8'));
  const keys = Object.keys(en).filter((key) =>
    /^(dance\.(entry|progress)\.|dance\.article\.action_|dance\.purchase\.(restored|restore_error)$|dance\.examples\.play$)/.test(
      key
    )
  );
  const failures: string[] = [];
  const placeholders = (value: string) =>
    (value.match(/\{\w+\}/g) ?? []).sort();
  for (const locale of locales) {
    const messages = JSON.parse(
      readFileSync(`messages/${locale}.json`, 'utf8')
    );
    const requiredKeys = keys;
    for (const key of requiredKeys) {
      const value = messages[key];
      if (typeof value !== 'string' || !value.trim()) {
        failures.push(`${locale}: missing ${key}`);
      } else if (
        JSON.stringify(placeholders(value)) !==
        JSON.stringify(placeholders(en[key]))
      ) {
        failures.push(`${locale}: placeholder mismatch in ${key}`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});
