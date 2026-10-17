import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { createClient } from '@libsql/client';
import sharp from 'sharp';
import Stripe from 'stripe';

import { reviewDancePayment } from '../src/lib/dance-payment-review';

// Isolated application integration: real services/SQLite/signatures, fake Stripe
// transport and simulated video worker. No production keys, account or network.
mkdirSync('data/tests', { recursive: true });
process.env.DATABASE_PROVIDER = 'sqlite';
process.env.DATABASE_URL = `file:data/tests/payment-journey-${crypto.randomUUID()}.db`;
process.env.DANCE_SANDBOX = 'true';
process.env.DANCE_CLOUD_ENABLED = 'false';
process.env.DANCE_PAYMENT_MODE = 'stripe-test';
process.env.DANCE_GENERATION_MODE = 'mock';
const sql = createClient({ url: process.env.DATABASE_URL });
await sql.executeMultiple(
  readFileSync('migrations/cloudflare/0001_initial.sql', 'utf8')
);
await sql.executeMultiple(
  readFileSync('migrations/cloudflare/0002_dance_funnel.sql', 'utf8')
);
const { createDanceCheckout, fulfillDanceCheckout } =
  await import('../src/modules/payment/dance-checkout');
const { verifyDanceEvent } = await import('../src/core/payment/dance-event');
const { queueDanceWithCredits, restoreFailedDanceCredits } =
  await import('../src/modules/ai-tasks/service');
const service = await import('../src/modules/dance/service');
const { dancePurchaseOffer } = await import('../src/lib/dance-purchase-offer');
const signingSecret = 'whsec_LOCAL_JOURNEY_FIXTURE_ONLY';
const stripe = new Stripe('sk_test_LOCAL_JOURNEY_FIXTURE_ONLY');
const sessions = new Map<string, Stripe.Checkout.Session>();
const photo = await sharp({
  create: { width: 400, height: 500, channels: 3, background: '#647c59' },
})
  .jpeg()
  .toBuffer();

async function balance(userId: string) {
  return Number(
    (
      await sql.execute({
        sql: "SELECT coalesce(sum(remaining_credits),0) AS balance FROM credit WHERE user_id=? AND transaction_type='grant' AND status='active'",
        args: [userId],
      })
    ).rows[0].balance
  );
}
async function deliver(
  session: Stripe.Checkout.Session,
  type = 'checkout.session.completed'
) {
  const payload = JSON.stringify({
    id: crypto.randomUUID(),
    object: 'event',
    livemode: false,
    type,
    data: { object: session },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: signingSecret,
  });
  const verified = await verifyDanceEvent(payload, signature, signingSecret);
  return verified ? fulfillDanceCheckout(verified) : false;
}

test('isolated purchase → signed confirmation → credit grant → generation, including retries and failure recovery', async (t) => {
  let creations = 0,
    failTransport = false;
  const prototype = Object.getPrototypeOf(stripe.checkout.sessions);
  t.mock.method(
    prototype,
    'create',
    async (
      params: Stripe.Checkout.SessionCreateParams,
      options: Stripe.RequestOptions
    ) => {
      if (failTransport) throw new Error('Injected checkout network failure');
      assert.equal(params.mode, 'payment');
      assert.equal(params.payment_method_types, undefined);
      assert.match(options.idempotencyKey || '', /^dance-test:/);
      const existing = [...sessions.values()].find(
        (s) => s.metadata?.danceCreditOrder === options.idempotencyKey
      );
      if (existing) return existing;
      creations++;
      const session = {
        id: `cs_test_local_${creations}`,
        url: 'https://checkout.example.test/session',
        livemode: false,
        mode: 'payment',
        payment_status: 'unpaid',
        currency: 'usd',
        amount_total: params.line_items?.[0].price_data?.unit_amount,
        metadata: params.metadata,
      } as Stripe.Checkout.Session;
      sessions.set(session.id, session);
      return session;
    }
  );
  t.mock.method(prototype, 'retrieve', async (id: string) => sessions.get(id));
  try {
    for (const [userId, resolution, seed, pack, remaining] of [
      ['buyer480', '480P', 0, 'single', 50],
      ['buyer720', '720P', 0, 'single', 0],
      ['buyer720partial', '720P', 50, 'single', 50],
      ['buyerThree', '720P', 0, 'friends', 300],
      ['buyerFive', '720P', 0, 'collection', 600],
    ] as const) {
      await sql.execute({
        sql: 'INSERT INTO user(id,name,email) VALUES (?,?,?)',
        args: [userId, 'Local QA', `${userId}@example.test`],
      });
      if (seed)
        await sql.execute({
          sql: "INSERT INTO credit(id,user_id,transaction_no,transaction_type,credits,remaining_credits,status) VALUES (?, ?, ?, 'grant', ?, ?, 'active')",
          args: [crypto.randomUUID(), userId, crypto.randomUUID(), seed, seed],
        });
      const offer = dancePurchaseOffer(resolution === '480P' ? 100 : 150, seed);
      assert.equal(offer.plan?.id, 'single');
      const requestKey = crypto.randomUUID();
      const args = {
        key: 'sk_test_LOCAL_JOURNEY_FIXTURE_ONLY',
        userId,
        email: `${userId}@example.test`,
        packId: pack,
        requestKey,
        origin: 'http://localhost:3000',
        flowId: crypto.randomUUID(),
      };
      failTransport = true;
      await assert.rejects(createDanceCheckout(args));
      assert.equal(await balance(userId), seed);
      failTransport = false;
      if (userId === 'buyer720') {
        await sql.execute({
          sql: 'UPDATE "order" SET amount=990,credits_amount=100 WHERE user_id=?',
          args: [userId],
        });
        await assert.rejects(createDanceCheckout(args), /Pricing changed/);
        await sql.execute({
          sql: 'UPDATE "order" SET amount=890,credits_amount=150 WHERE user_id=?',
          args: [userId],
        });
      }
      await createDanceCheckout(args);
      await createDanceCheckout(args);
      const intent = (
        await sql.execute({
          sql: 'SELECT * FROM "order" WHERE user_id=?',
          args: [userId],
        })
      ).rows;
      assert.equal(
        intent.length,
        1,
        'network retry must reuse the saved order'
      );
      assert.equal(intent[0].status, 'pending');
      assert.equal(
        Number(intent[0].amount),
        { single: 890, friends: 2390, collection: 3690 }[pack]
      );
      assert.match(String(intent[0].product_name), /720p video/);
      const session = sessions.get(String(intent[0].payment_session_id))!;
      assert.equal(session.amount_total, Number(intent[0].amount));
      assert.equal(
        await balance(userId),
        seed,
        'canceling checkout must not grant credits'
      );
      await assert.rejects(deliver(session));
      assert.equal(
        await deliver(session, 'checkout.session.async_payment_failed'),
        false
      );
      assert.equal(
        await balance(userId),
        seed,
        'failed/unpaid events must not grant credits'
      );
      const paid: Stripe.Checkout.Session = {
        ...session,
        payment_status: 'paid',
      };
      const results = await Promise.all([
        deliver(paid),
        deliver(paid, 'checkout.session.async_payment_succeeded'),
        deliver(paid),
      ]);
      assert.equal(results.filter(Boolean).length, 1);
      const reviews = await Promise.all(
        Array.from({ length: 3 }, () =>
          reviewDancePayment({
            userId,
            sessionId: paid.id,
            live: false,
            retrieve: async () => paid,
            fulfill: fulfillDanceCheckout,
          })
        )
      );
      assert.deepEqual(reviews, ['confirmed', 'confirmed', 'confirmed']);
      assert.equal(
        await balance(userId),
        seed + { single: 150, friends: 450, collection: 750 }[pack]
      );
      const created = await service.create(
        userId,
        crypto.randomUUID(),
        [photo, photo],
        'success',
        resolution
      );
      await assert.rejects(service.owned('someone-else', created.id));
      await Promise.all([
        queueDanceWithCredits(userId, created.id),
        queueDanceWithCredits(userId, created.id),
      ]);
      assert.equal(await balance(userId), remaining);
      for (let i = 0; i < 2; i++) {
        await sql.execute({
          sql: 'UPDATE dance_job SET next_run_at=0 WHERE id=?',
          args: [created.id],
        });
        await service.tick();
      }
      assert.equal(
        (await service.owned(userId, created.id)).status,
        'succeeded'
      );
      assert.equal(
        (
          await sql.execute({
            sql: "SELECT count(*) AS total FROM credit WHERE user_id=? AND transaction_type='consume'",
            args: [userId],
          })
        ).rows[0].total,
        1
      );
      await service.erase(userId, created.id);
    }
    assert.equal(creations, 5);
    const failed = await service.create(
      'buyerThree',
      crypto.randomUUID(),
      [photo, photo],
      'failure',
      '720P'
    );
    const before = await balance('buyerThree');
    await queueDanceWithCredits('buyerThree', failed.id);
    for (let i = 0; i < 2; i++) {
      await sql.execute({
        sql: 'UPDATE dance_job SET next_run_at=0 WHERE id=?',
        args: [failed.id],
      });
      await service.tick();
    }
    assert.equal(
      (await service.owned('buyerThree', failed.id)).status,
      'failed'
    );
    await Promise.all([
      restoreFailedDanceCredits(),
      restoreFailedDanceCredits(),
    ]);
    assert.equal(
      await balance('buyerThree'),
      before,
      'confirmed generation failure restores once'
    );
    await service.erase('buyerThree', failed.id);
    assert.equal(
      (
        await sql.execute(
          'SELECT count(*) AS total FROM "order" WHERE status=\'paid\''
        )
      ).rows[0].total,
      5
    );
  } finally {
    t.mock.restoreAll();
    await sql.close();
  }
});
