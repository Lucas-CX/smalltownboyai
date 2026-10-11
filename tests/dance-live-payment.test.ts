import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createClient } from '@libsql/client';
import Stripe from 'stripe';

import {
  assertLiveDancePayment,
  cloudDanceBalance,
  fulfillCloudCheckout,
  queueCloudDance,
  restoreCloudDance,
} from '../src/core/cloudflare/dance-ledger';
import { verifyDanceEvent } from '../src/core/payment/dance-event';
import { isDanceStripeKey } from '../src/core/payment/dance-mode';
import {
  createDanceCheckout,
  danceStripe,
} from '../src/modules/payment/dance-checkout';

process.env.DANCE_PAYMENT_MODE = 'stripe-live';
process.env.DATABASE_PROVIDER = 'd1';
process.env.DANCE_CLOUD_ENABLED = 'true';
const db = createClient({ url: ':memory:' });
await db.executeMultiple(
  readFileSync('migrations/cloudflare/0001_initial.sql', 'utf8')
);
function statement(sql: string, args: any[] = []): any {
  return {
    sql,
    args,
    bind: (...values: any[]) => statement(sql, values),
    first: async () => (await db.execute({ sql, args })).rows[0],
    all: async () => ({ results: (await db.execute({ sql, args })).rows }),
  };
}
(globalThis as any).__CF_ENV__ = {
  DB: {
    prepare: statement,
    batch: async (items: any[]) =>
      (
        await db.batch(
          items.map(({ sql, args }) => ({ sql, args })),
          'write'
        )
      ).map((r) => ({ meta: { changes: r.rowsAffected } })),
  },
};

test('live payment signatures reject test events, invalid signatures and unpaid sessions', async () => {
  const stripe = new Stripe('sk_test_LOCAL_FIXTURE_ONLY');
  const secret = 'whsec_LOCAL_FIXTURE_ONLY';
  const event = {
    id: 'evt_fixture',
    type: 'checkout.session.completed',
    livemode: true,
    data: {
      object: {
        id: 'cs_live_fixture',
        livemode: true,
        mode: 'payment',
        payment_status: 'paid',
        currency: 'usd',
      },
    },
  };
  const verify = async (value: any, bad = false) => {
    const raw = JSON.stringify(value);
    return verifyDanceEvent(
      raw,
      bad
        ? 'bad'
        : stripe.webhooks.generateTestHeaderString({ payload: raw, secret }),
      secret
    );
  };
  assert.equal((await verify(event))?.id, 'cs_live_fixture');
  await assert.rejects(verify(event, true));
  await assert.rejects(verify({ ...event, livemode: false }));
  await assert.rejects(
    verify({
      ...event,
      data: { object: { ...event.data.object, livemode: false } },
    })
  );
  await assert.rejects(
    verify({
      ...event,
      data: { object: { ...event.data.object, payment_status: 'unpaid' } },
    })
  );
  assert.throws(() => danceStripe('sk_test_LOCAL_FIXTURE_ONLY'));
  assert.equal(isDanceStripeKey('rk_live_LOCAL_FIXTURE_ONLY'), true);
  assert.equal(isDanceStripeKey('sk_live_LOCAL_FIXTURE_ONLY'), true);
  assert.equal(isDanceStripeKey('pk_live_LOCAL_FIXTURE_ONLY'), false);
  assert.equal(isDanceStripeKey('rk_test_LOCAL_FIXTURE_ONLY'), false);
  assert.doesNotThrow(() => danceStripe('rk_live_LOCAL_FIXTURE_ONLY'));
  await assert.rejects(
    createDanceCheckout({
      key: 'sk_live_LOCAL_FIXTURE_ONLY',
      userId: 'a',
      email: 'a@example.test',
      packId: 'single',
      requestKey: crypto.randomUUID(),
      origin: 'https://example.test',
    })
  );
});

test('checkout uses the resolved admin Kie key and requires storage and image bindings', async () => {
  const bindings = (globalThis as any).__CF_ENV__;
  const previousMode = process.env.DANCE_GENERATION_MODE;
  const previousKey = process.env.KIE_API_KEY;
  delete process.env.KIE_API_KEY;
  process.env.DANCE_GENERATION_MODE = 'kie';
  const args = {
    key: 'rk_live_LOCAL_FIXTURE_ONLY',
    signingSecret: 'whsec_LOCAL_FIXTURE_ONLY',
    kieKey: 'LOCAL_KIE_FIXTURE',
    userId: 'a',
    email: 'a@example.test',
    packId: 'invalid-pack',
    requestKey: crypto.randomUUID(),
    origin: 'https://example.test',
  };
  try {
    await assert.rejects(
      createDanceCheckout(args),
      /configuration must be completed/
    );
    bindings.DANCE_FILES = {};
    bindings.IMAGES = {};
    // Passing preflight reaches pack validation without creating a checkout.
    await assert.rejects(createDanceCheckout(args), /Invalid purchase/);
    await assert.rejects(
      createDanceCheckout({ ...args, kieKey: '' }),
      /configuration must be completed/
    );
  } finally {
    delete bindings.DANCE_FILES;
    delete bindings.IMAGES;
    if (previousMode === undefined) delete process.env.DANCE_GENERATION_MODE;
    else process.env.DANCE_GENERATION_MODE = previousMode;
    if (previousKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = previousKey;
  }
});

test('live grants are idempotent, isolated from test credits, and required before provider submission', async () => {
  await db.execute(
    "INSERT INTO user(id,name,email) VALUES ('a','A','a@example.test')"
  );
  await db.execute(`INSERT INTO "order"(id,order_no,user_id,status,amount,currency,payment_provider,payment_session_id,checkout_info,credits_amount)
    VALUES ('o','dance-live:a:1','a','pending',890,'usd','stripe-live','cs_live_fixture','{}',100),
    ('test','dance-test:a:1','a','paid',890,'usd','stripe-test','cs_test_fixture','{}',100)`);
  await db.execute(
    "INSERT INTO credit(id,user_id,order_no,transaction_no,transaction_type,credits,remaining_credits,status) VALUES ('test','a','dance-test:a:1','test','grant',100,100,'active')"
  );
  const now = Math.floor(Date.now() / 1000);
  for (const id of ['j1', 'j2'])
    await db.execute({
      sql: "INSERT INTO dance_job(id,user_id,request_key,photos,created_at,expires_at,next_run_at,generation_mode) VALUES (?,'a',?,'[]',?,?,?,'kie')",
      args: [id, id, now, now + 3600, now],
    });
  assert.equal(await cloudDanceBalance('a'), 0);
  await assert.rejects(queueCloudDance('a', 'j1'));
  await assert.rejects(assertLiveDancePayment('j1', 'a'));
  const checkout = {
    id: 'cs_live_fixture',
    livemode: true,
    mode: 'payment',
    payment_status: 'paid',
    currency: 'usd',
    amount_total: 890,
    metadata: { danceCreditOrder: 'dance-live:a:1', userId: 'a' },
  };
  for (const override of [
    { livemode: false },
    { amount_total: 1 },
    { payment_status: 'unpaid' },
    { id: 'cs_live_other' },
    { metadata: { danceCreditOrder: 'dance-live:a:1', userId: 'other' } },
  ])
    await assert.rejects(fulfillCloudCheckout({ ...checkout, ...override }));
  const paid = await Promise.all(
    Array.from({ length: 4 }, () => fulfillCloudCheckout(checkout))
  );
  assert.equal(paid.filter(Boolean).length, 1);
  assert.equal(await cloudDanceBalance('a'), 100);
  await queueCloudDance('a', 'j1');
  await queueCloudDance('a', 'j1');
  assert.equal(await cloudDanceBalance('a'), 0);
  await assert.rejects(queueCloudDance('a', 'j2'));
  await db.execute("UPDATE dance_job SET status='reconciling' WHERE id='j1'");
  await assertLiveDancePayment('j1', 'a');
  await assert.rejects(assertLiveDancePayment('j1', 'other'));
  await db.execute("UPDATE dance_job SET status='failed' WHERE id='j1'");
  await Promise.all([restoreCloudDance(), restoreCloudDance()]);
  assert.equal(await cloudDanceBalance('a'), 100);
  assert.equal(
    (await db.execute("SELECT remaining_credits FROM credit WHERE id='test'"))
      .rows[0].remaining_credits,
    100
  );
  await db.close();
});
