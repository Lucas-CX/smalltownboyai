import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createClient } from '@libsql/client';
import type Stripe from 'stripe';

mkdirSync('data/tests', { recursive: true });
process.env.DATABASE_PROVIDER = 'sqlite';
process.env.DATABASE_URL = `file:data/tests/ledger-${crypto.randomUUID()}.db`;
process.env.DANCE_SANDBOX = 'true';
process.env.DANCE_PAYMENT_MODE = 'stripe-test';
const sql = createClient({ url: process.env.DATABASE_URL });
await sql.executeMultiple(
  readFileSync('tests/fixtures/dance-ledger.sql', 'utf8')
);
await sql.execute(
  "INSERT INTO user(id,name,email,email_verified) VALUES ('buyer','QA','buyer@example.test',0)"
);
await sql.execute(
  "INSERT INTO \"order\"(id,order_no,user_id,status,amount,currency,payment_provider,payment_session_id,checkout_info,credits_amount) VALUES ('order-1','dance-test:buyer:1','buyer','pending',890,'usd','stripe-test','cs_test_fixture','{}',100)"
);
const { fulfillDanceCheckout } =
  await import('../src/modules/payment/dance-checkout');
const { queueDanceWithCredits, restoreFailedDanceCredits } =
  await import('../src/modules/ai-tasks/service');
const checkout = {
  id: 'cs_test_fixture',
  livemode: false,
  mode: 'payment',
  payment_status: 'paid',
  currency: 'usd',
  amount_total: 890,
  metadata: { danceCreditOrder: 'dance-test:buyer:1', userId: 'buyer' },
  payment_intent: 'pi_fixture',
} as unknown as Stripe.Checkout.Session;

test('unpaid/live/wrong-amount sessions never grant; concurrent paid callbacks grant once', async () => {
  for (const override of [
    { payment_status: 'unpaid' },
    { livemode: true },
    { amount_total: 1 },
    {
      metadata: { danceCreditOrder: 'dance-test:buyer:1', userId: 'intruder' },
    },
  ]) {
    await assert.rejects(
      fulfillDanceCheckout({
        ...checkout,
        ...override,
      } as Stripe.Checkout.Session)
    );
  }
  assert.equal((await sql.execute('SELECT * FROM credit')).rows.length, 0);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => fulfillDanceCheckout(checkout))
  );
  assert.equal(results.filter(Boolean).length, 1);
  const rows = (
    await sql.execute('SELECT credits,remaining_credits FROM credit')
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].remaining_credits, 100);
});

test('generation credit consumption is atomic; failures restore exactly once', async () => {
  const stamp = Math.floor(Date.now() / 1000);
  await sql.execute({
    sql: "INSERT INTO dance_job(id,user_id,request_key,photos,next_run_at,created_at,expires_at,generation_mode) VALUES ('job-1','buyer','buyer:req','[]',?,?,?,'kie')",
    args: [stamp, stamp, stamp + 3600],
  });
  const jobs = await Promise.all([
    queueDanceWithCredits('buyer', 'job-1'),
    queueDanceWithCredits('buyer', 'job-1'),
  ]);
  assert.ok(jobs.every((j) => j.status === 'queued'));
  assert.equal(
    (await sql.execute("SELECT * FROM credit WHERE transaction_type='consume'"))
      .rows.length,
    1
  );
  assert.equal(
    (
      await sql.execute(
        "SELECT remaining_credits FROM credit WHERE transaction_type='grant'"
      )
    ).rows[0].remaining_credits,
    0
  );
  await sql.execute("UPDATE dance_job SET status='failed' WHERE id='job-1'");
  await Promise.all([restoreFailedDanceCredits(), restoreFailedDanceCredits()]);
  assert.equal(
    (
      await sql.execute(
        "SELECT remaining_credits FROM credit WHERE transaction_type='grant'"
      )
    ).rows[0].remaining_credits,
    100
  );
  assert.equal(
    (await sql.execute("SELECT payment_mode FROM dance_job WHERE id='job-1'"))
      .rows[0].payment_mode,
    'credits-restored'
  );
});
