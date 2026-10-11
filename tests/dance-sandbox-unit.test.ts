import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';

import { verifyDanceEvent } from '../src/core/payment/dance-event';
import { isDanceStripeKey } from '../src/core/payment/dance-mode';
import { danceCreditCost } from '../src/lib/dance-plans';
import { dancePurchaseOffer } from '../src/lib/dance-purchase-offer';

// Offline signature fixtures only: no Stripe network, database or AI calls.
test('sandbox payment validation rejects incorrect modes, signatures and unpaid events', async () => {
  const previous = process.env.DANCE_PAYMENT_MODE;
  process.env.DANCE_PAYMENT_MODE = 'stripe-test';
  const stripe = new Stripe('sk_test_UNIT_FIXTURE_ONLY');
  const secret = 'whsec_UNIT_FIXTURE_ONLY';
  const checkout = {
    id: 'cs_test_unit',
    livemode: false,
    mode: 'payment',
    payment_status: 'paid',
    currency: 'usd',
  };
  const verify = (overrides = {}, eventOverrides = {}, timestamp?: number) => {
    const payload = JSON.stringify({
      id: 'evt_unit',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: { ...checkout, ...overrides } },
      ...eventOverrides,
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
      timestamp,
    });
    return verifyDanceEvent(payload, signature, secret);
  };
  try {
    assert.equal(isDanceStripeKey('rk_test_UNIT_FIXTURE'), true);
    assert.equal(isDanceStripeKey('sk_test_UNIT_FIXTURE'), true);
    for (const key of [
      'sk_live_UNIT_FIXTURE',
      'rk_live_UNIT_FIXTURE',
      'pk_test_UNIT_FIXTURE',
      '',
    ])
      assert.equal(isDanceStripeKey(key), false);
    assert.deepEqual(await verify(), checkout);
    assert.deepEqual(
      await verify({}, { type: 'checkout.session.async_payment_succeeded' }),
      checkout
    );
    for (const overrides of [
      { payment_status: 'unpaid' },
      { payment_status: 'no_payment_required' },
      { livemode: true },
      { mode: 'subscription' },
      { currency: 'eur' },
    ])
      await assert.rejects(verify(overrides));
    await assert.rejects(verify({}, { livemode: true }));
    await assert.rejects(verify({}, {}, Math.floor(Date.now() / 1000) - 600));
    await assert.rejects(verifyDanceEvent('{}', 'invalid', secret));
    const raw = JSON.stringify({
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: checkout },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret,
    });
    await assert.rejects(verifyDanceEvent(raw + ' ', signature, secret));
    await assert.rejects(
      verifyDanceEvent(raw, signature, 'whsec_DIFFERENT_FIXTURE')
    );
    assert.equal(
      await verify({}, { type: 'checkout.session.async_payment_failed' }),
      null
    );
    assert.equal(await verify({}, { type: 'checkout.session.expired' }), null);
  } finally {
    if (previous === undefined) delete process.env.DANCE_PAYMENT_MODE;
    else process.env.DANCE_PAYMENT_MODE = previous;
  }
});

test('existing credits allow continuation without checkout at each quality threshold', () => {
  for (const quality of ['480P', '720P', '1080P']) {
    const cost = danceCreditCost(quality);
    for (const balance of [cost, cost + 1, 1000]) {
      const offer = dancePurchaseOffer(cost, balance);
      assert.equal(offer.canContinue, true);
      assert.equal(offer.plan, undefined);
    }
    assert.equal(dancePurchaseOffer(cost, cost - 1).canContinue, false);
  }
  assert.throws(() => danceCreditCost('4K'));
});
