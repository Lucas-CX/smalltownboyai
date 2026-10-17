import assert from 'node:assert/strict';
import test from 'node:test';

import {
  funnelBatchSchema,
  funnelParamsSchema,
} from '../src/lib/dance-funnel-contract';
import { danceCreditCost } from '../src/lib/dance-plans';
import {
  dancePurchaseOffer,
  danceUpfrontQuote,
} from '../src/lib/dance-purchase-offer';

test('recommendation covers the selected quality and uses existing credits before a new pack', () => {
  for (const [quality, balance, expected] of [
    ['480P', 0, 'single'],
    ['720P', 0, 'single'],
    ['1080P', 0, 'friends'],
    ['720P', 49, 'single'],
    ['720P', 50, 'single'],
    ['1080P', 149, 'single'],
    ['1080P', 150, 'single'],
    ['1080P', 250, undefined],
    ['480P', 100, undefined],
  ] as const) {
    const offer = dancePurchaseOffer(danceCreditCost(quality), balance);
    assert.equal(offer.plan?.id, expected);
    if (offer.plan)
      assert.ok(offer.plan.credits + balance >= danceCreditCost(quality));
    else assert.equal(offer.canContinue, true);
  }
  assert.equal(dancePurchaseOffer(100, NaN).plan?.id, 'single');
  assert.equal(dancePurchaseOffer(100, -100).plan?.id, 'single');
  assert.equal(dancePurchaseOffer(150, 50).plan?.cents, 890);
  assert.equal(dancePurchaseOffer(150).plan?.cents, 890);
  assert.equal(dancePurchaseOffer(2000).plan, undefined);
  assert.equal(dancePurchaseOffer(2000).canContinue, false);
  assert.throws(() => dancePurchaseOffer(NaN));
});

test('purchase and runtime diagnostics retain fixed categories and strip private data', () => {
  const parsed = funnelParamsSchema.parse({
    reason: 'credits_unavailable',
    stage: 'purchase',
    pack_id: 'friends',
    resolution: '720P',
    conversion_version: 'conversion_20261009',
    email: 'private',
    filename: 'private',
    message: 'provider secret',
    url: 'private',
  });
  assert.deepEqual(Object.keys(parsed).sort(), [
    'conversion_version',
    'pack_id',
    'reason',
    'resolution',
    'stage',
  ]);
  assert.deepEqual(
    funnelParamsSchema.parse({ stage: 'runtime', reason: 'uncaught_error' }),
    { stage: 'runtime', reason: 'uncaught_error' }
  );
  assert.equal(
    funnelParamsSchema.safeParse({ reason: 'private arbitrary error' }).success,
    false
  );
  assert.equal(
    funnelBatchSchema.safeParse({
      flowId: crypto.randomUUID(),
      events: [
        {
          id: crypto.randomUUID(),
          event: 'dance_purchase_cta_viewed',
          params: parsed,
        },
      ],
    }).success,
    true
  );
  assert.equal(
    funnelBatchSchema.safeParse({
      flowId: crypto.randomUUID(),
      events: [
        {
          id: crypto.randomUUID(),
          event: 'server_payment_verified',
          params: {},
        },
      ],
    }).success,
    false
  );
});

test('upfront quote distinguishes unknown balance, pack total and covered generation', () => {
  assert.equal(danceUpfrontQuote(150, null), null);
  assert.equal(danceUpfrontQuote(150, 0)?.cents, 890);
  assert.equal(danceUpfrontQuote(150, 0)?.remaining, 0);
  assert.equal(danceUpfrontQuote(150, 50)?.cents, 890);
  assert.equal(danceUpfrontQuote(250, 250)?.cents, 0);
  assert.equal(danceUpfrontQuote(250, 300)?.remaining, 50);
  assert.equal(
    funnelParamsSchema.parse({ quote_cents: 890, photo_decoder: 'image' })
      .quote_cents,
    890
  );
});
