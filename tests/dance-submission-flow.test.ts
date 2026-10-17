import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createClient } from '@libsql/client';

Object.assign(process.env, {
  DATABASE_PROVIDER: 'd1',
  DANCE_CLOUD_ENABLED: 'true',
  DANCE_PAYMENT_MODE: 'stripe-live',
  DANCE_GENERATION_MODE: 'kie',
  VITE_PREVIEW_ONLY: 'false',
  AUTH_SECRET: 'local-fixture-callback-secret-not-production',
  VITE_APP_URL: 'https://example.test',
  KIE_API_KEY: 'fixture',
});
const client = createClient({ url: ':memory:' });
await client.executeMultiple(
  readFileSync('migrations/cloudflare/0001_initial.sql', 'utf8')
);
await client.executeMultiple(
  readFileSync('migrations/cloudflare/0002_dance_funnel.sql', 'utf8')
);
function statement(sql: string, args: any[] = []): any {
  return {
    sql,
    args,
    bind: (...values: any[]) => statement(sql, values),
    first: async () => (await client.execute({ sql, args })).rows[0],
    all: async () => ({ results: (await client.execute({ sql, args })).rows }),
    raw: async () =>
      (await client.execute({ sql, args })).rows.map((row) => Array.from(row)),
    run: async () => ({
      meta: { changes: (await client.execute({ sql, args })).rowsAffected },
    }),
  };
}
(globalThis as any).__CF_ENV__ = {
  DB: {
    prepare: statement,
    batch: async (items: any[]) =>
      (
        await client.batch(
          items.map(({ sql, args }) => ({ sql, args })),
          'write'
        )
      ).map((r) => ({ results: r.rows, meta: { changes: r.rowsAffected } })),
  },
};
const { queueCloudDance, cloudDanceBalance, restoreCloudDance } =
  await import('../src/core/cloudflare/dance-ledger');
const { advanceDanceJobs } = await import('../src/lib/dance-events.server');

test('preflight failure becomes failed and restores only the original debit exactly once through real orchestration', async (t) => {
  await client.execute(
    "INSERT INTO user(id,name,email) VALUES ('buyer','Fixture','buyer@example.test')"
  );
  await client.execute(
    `INSERT INTO "order"(id,order_no,user_id,status,amount,currency,payment_provider,checkout_info,credits_amount) VALUES ('order','dance-live:fixture','buyer','paid',790,'usd','stripe-live','{}',150)`
  );
  await client.execute(
    "INSERT INTO credit(id,user_id,order_no,transaction_no,transaction_type,transaction_scene,credits,remaining_credits,status) VALUES ('grant','buyer','dance-live:fixture','grant','grant','payment',150,150,'active')"
  );
  const id = crypto.randomUUID(),
    now = Math.floor(Date.now() / 1000);
  await client.execute({
    sql: "INSERT INTO dance_job(id,user_id,request_key,photos,generation_mode,resolution,created_at,expires_at,next_run_at) VALUES (?,'buyer',?,'[\"fixture-a\",\"fixture-b\"]','kie','480P',?,?,0)",
    args: [id, id, now, now + 86400],
  });
  await queueCloudDance('buyer', id);
  assert.equal(await cloudDanceBalance('buyer'), 50);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (input: any, init: any) => {
    assert.ok(String(input).endsWith('chat/credit'));
    assert.equal(init.method, 'GET');
    calls++;
    throw new DOMException('timed out', 'TimeoutError');
  });
  await advanceDanceJobs({ userId: 'buyer', jobId: id, reason: 'submit' });
  const job = (
    await client.execute({
      sql: 'SELECT status,payment_mode,error_code,provider_cost_cents,provider_id FROM dance_job WHERE id=?',
      args: [id],
    })
  ).rows[0];
  assert.equal(job.status, 'failed');
  assert.equal(job.payment_mode, 'credits-restored');
  assert.equal(job.error_code, 'PRE_SUBMISSION_BALANCE');
  assert.equal(job.provider_cost_cents, 0);
  assert.equal(job.provider_id, null);
  assert.equal(calls, 2);
  assert.equal(await cloudDanceBalance('buyer'), 150);
  await Promise.all([
    restoreCloudDance({ jobId: id }),
    restoreCloudDance({ jobId: id }),
  ]);
  await advanceDanceJobs({ userId: 'buyer', jobId: id, reason: 'submit' });
  assert.equal(calls, 2);
  assert.equal(await cloudDanceBalance('buyer'), 150);
});
