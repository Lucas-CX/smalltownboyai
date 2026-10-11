import assert from 'node:assert/strict';
import test from 'node:test';

import { envConfigs } from '../src/config';
import { trackDancePaymentReceipt } from '../src/lib/dance-analytics';
import { danceCheckoutPresentation } from '../src/lib/dance-checkout-presentation';
import { funnelBatchSchema } from '../src/lib/dance-funnel-contract';
import {
  paymentFunnelEventId,
  readDancePaymentReceipt,
} from '../src/lib/dance-payment-receipt';
import { respData } from '../src/lib/resp';

const paid = {
  transaction_id: '0123456789abcdef0123456789abcdef',
  value: 8.9,
  currency: 'USD',
  pack_id: 'single',
  payment_mode: 'stripe-live',
};

test('checkout identifies this app and returns to the selected language', () => {
  for (const locale of ['en', 'zh', 'it', 'ru', 'pt-BR']) {
    const options = danceCheckoutPresentation('https://example.test', locale);
    assert.equal(options.branding_settings.display_name, envConfigs.app_name);
    assert.equal(options.locale, locale);
    assert.ok(options.success_url.includes(`locale=${locale}&session_id=`));
    assert.equal(
      new URL(options.cancel_url).pathname,
      locale === 'en' ? '/' : `/${locale}`
    );
    assert.equal(
      new URL(options.cancel_url).searchParams.get('checkout'),
      'canceled'
    );
  }
  assert.equal(
    danceCheckoutPresentation('https://example.test', '//evil.example').locale,
    'en'
  );
});

test('empty and malformed receipts never become purchases', async () => {
  const empty = await respData({ receipt: null }).json();
  assert.equal(empty.data.receipt, null);
  for (const value of [
    undefined,
    null,
    [],
    {},
    { receipt: null },
    { receipt: [] },
    { receipt: { ...paid, transaction_id: undefined } },
    { receipt: { ...paid, payment_mode: 'mock' } },
    { receipt: { ...paid, value: -1 } },
  ]) {
    assert.equal(readDancePaymentReceipt(value), null);
  }
  assert.deepEqual(readDancePaymentReceipt({ receipt: paid }), paid);
});

test('the same paid order has one ingestion ID across refreshes and tabs', () => {
  const id = paymentFunnelEventId(paid.transaction_id);
  assert.equal(id, paymentFunnelEventId(paid.transaction_id));
  assert.notEqual(id, paymentFunnelEventId('abcdef0123456789abcdef0123456789'));
  assert.equal(paymentFunnelEventId(undefined), undefined);
  assert.equal(paymentFunnelEventId('cs_live_private'), undefined);
  assert.ok(
    funnelBatchSchema.safeParse({
      flowId: '01234567-89ab-4def-8123-456789abcdef',
      events: [{ id, event: 'purchase', params: {} }],
    }).success
  );
});

test('a stored payment is not resent to GA and invalid receipts emit nothing', () => {
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const calls: unknown[][] = [];
  const saved = new Map<string, string>();
  saved.set(`dance-analytics:payment:${paid.transaction_id}`, '1');
  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { origin: 'https://example.test', pathname: '/' },
        gtag: (...args: unknown[]) => calls.push(args),
      },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => saved.get(k),
        setItem: (k: string, v: string) => saved.set(k, v),
      },
    });
    trackDancePaymentReceipt([]);
    trackDancePaymentReceipt({ receipt: null });
    trackDancePaymentReceipt({ receipt: paid });
    assert.equal(calls.length, 0);
    const fresh = {
      ...paid,
      transaction_id: 'abcdef0123456789abcdef0123456789',
    };
    trackDancePaymentReceipt({ receipt: fresh });
    trackDancePaymentReceipt({ receipt: fresh });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], 'purchase');
  } finally {
    for (const key of ['window', 'localStorage']) {
      Reflect.deleteProperty(globalThis, key);
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
    }
  }
});
