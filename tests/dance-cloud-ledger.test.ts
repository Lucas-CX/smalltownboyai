import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createClient } from '@libsql/client';

import {
  fulfillCloudCheckout,
  queueCloudDance,
  restoreCloudDance,
} from '../src/core/cloudflare/dance-ledger';
import { danceCreditCost, dancePlans } from '../src/lib/dance-plans';

mkdirSync('data/tests', { recursive: true });
const client = createClient({
  url: `file:data/tests/cloud-${crypto.randomUUID()}.db`,
});
await client.executeMultiple(
  readFileSync('migrations/cloudflare/0001_initial.sql', 'utf8')
);
function statement(sql: string, args: any[] = []): any {
  return {
    sql,
    args,
    bind: (...values: any[]) => statement(sql, values),
    first: async () => (await client.execute({ sql, args })).rows[0],
    all: async () => ({ results: (await client.execute({ sql, args })).rows }),
  };
}
process.env.DATABASE_PROVIDER = 'd1';
process.env.DANCE_CLOUD_ENABLED = 'true';
process.env.DANCE_PAYMENT_MODE = 'stripe-test';
(globalThis as any).__CF_ENV__ = {
  DB: {
    prepare: statement,
    batch: async (items: any[]) =>
      (
        await client.batch(
          items.map(({ sql, args }) => ({ sql, args })),
          'write'
        )
      ).map((r) => ({ meta: { changes: r.rowsAffected } })),
  },
};

test('D1 SQL batch: concurrent callbacks, competing jobs, once-only restoration and ownership', async () => {
  await client.execute(
    "INSERT INTO user(id,name,email) VALUES ('a','QA','qa@example.test')"
  );
  await client.execute(`INSERT INTO "order"(id,order_no,user_id,status,amount,currency,payment_provider,payment_session_id,checkout_info,credits_amount)
    VALUES ('o','dance-test:a:1','a','pending',890,'usd','stripe-test','cs_test_fixture','{}',100)`);
  const checkout = {
    id: 'cs_test_fixture',
    livemode: false,
    mode: 'payment',
    payment_status: 'paid',
    metadata: { danceCreditOrder: 'dance-test:a:1', userId: 'a' },
    currency: 'usd',
    amount_total: 890,
  };
  await assert.rejects(fulfillCloudCheckout({ ...checkout, amount_total: 1 }));
  const paid = await Promise.all(
    Array.from({ length: 4 }, () => fulfillCloudCheckout(checkout))
  );
  assert.equal(paid.filter(Boolean).length, 1);
  const now = Math.floor(Date.now() / 1000);
  for (const id of ['j1', 'j2'])
    await client.execute({
      sql: `INSERT INTO dance_job(id,user_id,request_key,photos,created_at,expires_at,next_run_at)
    VALUES (?,'a',?,'[]',?,?,?)`,
      args: [id, id, now, now + 3600, now],
    });
  await assert.rejects(queueCloudDance('intruder', 'j1'));
  const queued = await Promise.allSettled([
    queueCloudDance('a', 'j1'),
    queueCloudDance('a', 'j2'),
  ]);
  assert.equal(queued.filter((r) => r.status === 'fulfilled').length, 1);
  const id = String(
    (await client.execute("SELECT id FROM dance_job WHERE status='queued'"))
      .rows[0].id
  );
  await queueCloudDance('a', id);
  assert.equal(
    (
      await client.execute(
        "SELECT * FROM credit WHERE transaction_type='consume'"
      )
    ).rows.length,
    1
  );
  assert.equal(
    (
      await client.execute(
        "SELECT remaining_credits FROM credit WHERE transaction_type='grant'"
      )
    ).rows[0].remaining_credits,
    0
  );
  await client.execute({
    sql: "UPDATE dance_job SET status='failed' WHERE id=?",
    args: [id],
  });
  await Promise.all([restoreCloudDance(), restoreCloudDance()]);
  assert.equal(
    (
      await client.execute(
        "SELECT remaining_credits FROM credit WHERE transaction_type='grant'"
      )
    ).rows[0].remaining_credits,
    100
  );
});

test('resolution pricing spends across paid grants and restores the exact allocation once', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const [resolution, cost] of [
    ['720P', 150],
    ['1080P', 250],
  ] as const) {
    const user = `quality-${resolution}`;
    await client.execute({
      sql: 'INSERT INTO user(id,name,email) VALUES (?,?,?)',
      args: [user, 'QA', `${user}@example.test`],
    });
    for (const [index, amount] of [50, cost - 50].entries()) {
      const order = `${user}-${index}`;
      await client.execute({
        sql: `INSERT INTO "order"(id,order_no,user_id,status,amount,currency,payment_provider,checkout_info,credits_amount)
        VALUES (?,?,?,'paid',990,'usd','stripe-test','{}',?)`,
        args: [order, order, user, amount],
      });
      await client.execute({
        sql: `INSERT INTO credit(id,user_id,order_no,transaction_no,transaction_type,credits,remaining_credits,status)
        VALUES (?,?,?,?,'grant',?,?,'active')`,
        args: [order, user, order, order, amount, amount],
      });
    }
    const job = `job-${user}`;
    await client.execute({
      sql: `INSERT INTO dance_job(id,user_id,request_key,photos,resolution,created_at,expires_at,next_run_at)
      VALUES (?,?,?,'[]',?,?,?,?)`,
      args: [job, user, job, resolution, now, now + 3600, now],
    });
    await Promise.all([queueCloudDance(user, job), queueCloudDance(user, job)]);
    const spent = (
      await client.execute({
        sql: "SELECT credits,consumed_detail FROM credit WHERE user_id=? AND transaction_type='consume'",
        args: [user],
      })
    ).rows;
    assert.equal(spent.length, 1);
    assert.equal(spent[0].credits, -cost);
    assert.equal(JSON.parse(String(spent[0].consumed_detail)).length, 2);
    assert.equal(
      (
        await client.execute({
          sql: 'SELECT SUM(remaining_credits) AS balance FROM credit WHERE user_id=?',
          args: [user],
        })
      ).rows[0].balance,
      0
    );
    await client.execute({
      sql: "UPDATE dance_job SET status='failed' WHERE id=?",
      args: [job],
    });
    await Promise.all([restoreCloudDance(), restoreCloudDance()]);
    const grants = (
      await client.execute({
        sql: "SELECT credits,remaining_credits FROM credit WHERE user_id=? AND transaction_type='grant'",
        args: [user],
      })
    ).rows;
    for (const grant of grants)
      assert.equal(grant.remaining_credits, grant.credits);
  }
});

test('720p packs cover exactly the advertised videos without a leftover balance', () => {
  assert.deepEqual(
    dancePlans.map((p) => [p.cents, p.credits, p.videos]),
    [
      [790, 150, 1],
      [1990, 450, 3],
      [2990, 750, 5],
    ]
  );
  for (const plan of dancePlans) {
    assert.equal(plan.credits, plan.videos * danceCreditCost('720P'));
    // Public Wan rate includes 14 seconds of reference + 14 seconds of output.
    const contribution =
      plan.cents * (1 - 0.029 - 0.03) - 30 - plan.videos * (224 * 1.15 + 10);
    assert.ok(contribution / plan.cents > 0.48);
  }
  assert.throws(() => danceCreditCost('1440P'));
});
