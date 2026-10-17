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

const { sweepDanceRecovery, recoveryCandidatesSql } =
  await import('../src/lib/dance-recovery.server');
const { claimCloudDanceSubmission, recoverCloudDanceJob } =
  await import('../src/core/cloudflare/dance-recovery');
const { completeDanceCallback } =
  await import('../src/lib/dance-events.server');

async function recoveryFixture(
  age: number,
  status = 'queued',
  error: string | null = null,
  provider: string | null = null
) {
  const id = crypto.randomUUID(),
    now = Math.floor(Date.now() / 1000);
  await client.execute({
    sql: "INSERT INTO user(id,name,email) VALUES (?,'Fixture',?)",
    args: [id, `${id}@example.test`],
  });
  await client.execute({
    sql: `INSERT INTO credit(id,user_id,order_no,transaction_no,transaction_type,transaction_scene,credits,remaining_credits,status) VALUES (?,?,? ,?,'grant','payment',150,150,'active')`,
    args: [`grant-${id}`, id, `dance-live:${id}`, id],
  });
  await client.execute({
    sql: `INSERT INTO dance_job(id,user_id,request_key,photos,generation_mode,resolution,created_at,expires_at,next_run_at) VALUES (?,?,?,'[]','kie','480P',?,?,0)`,
    args: [id, id, id, now - 7200, now + 86400],
  });
  await client.execute({
    sql: `INSERT INTO "order"(id,order_no,user_id,status,amount,currency,payment_provider,checkout_info,credits_amount) VALUES (?,?,?,'paid',790,'usd','stripe-live','{}',150)`,
    args: [id, `dance-live:${id}`, id],
  });
  await queueCloudDance(id, id);
  await client.execute({
    sql: `UPDATE credit SET created_at=? WHERE id=(SELECT substr(payment_id,8) FROM dance_job WHERE id=?)`,
    args: [(now - age) * 1000, id],
  });
  await client.execute({
    sql: `UPDATE dance_job SET status=?,error_code=?,provider_id=?,next_run_at=? WHERE id=?`,
    args: [status, error, provider, now - 400, id],
  });
  return id;
}
async function jobRow(id: string) {
  return (
    await client.execute({
      sql: 'SELECT * FROM dance_job WHERE id=?',
      args: [id],
    })
  ).rows[0];
}

test('killed before submission: scheduled recovery restores once; stale worker is fenced out', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Recovery must not generate');
  });
  for (const status of ['queued', 'reconciling']) {
    const id = await recoveryFixture(
      600,
      status,
      status === 'reconciling' ? 'SUBMISSION_PREPARING' : null
    );
    await sweepDanceRecovery();
    assert.equal((await jobRow(id)).error_code, 'PRE_SUBMISSION_INTERRUPTED');
    assert.equal(await cloudDanceBalance(id), 150);
    await assert.rejects(claimCloudDanceSubmission(id, id));
    await Promise.all([
      restoreCloudDance({ jobId: id }),
      completeDanceCallback(id, 'late-task'),
      sweepDanceRecovery(),
    ]);
    assert.equal(await cloudDanceBalance(id), 150);
    assert.equal((await jobRow(id)).payment_mode, 'credits-restored');
  }
});

test('paid-call boundary wins: no premature refund, no repeated submission; deadline compensates once', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new Error('Unexpected provider call');
  });
  const id = await recoveryFixture(600, 'reconciling', 'SUBMISSION_PREPARING');
  const now = Math.floor(Date.now() / 1000);
  await client.execute({
    sql: 'UPDATE dance_job SET next_run_at=? WHERE id=?',
    args: [now + 100, id],
  });
  await claimCloudDanceSubmission(id, id);
  await assert.rejects(claimCloudDanceSubmission(id, id));
  await client.execute({
    sql: 'UPDATE dance_job SET next_run_at=0 WHERE id=?',
    args: [id],
  });
  await sweepDanceRecovery();
  assert.equal(await cloudDanceBalance(id), 50);
  await client.execute({
    sql: `UPDATE credit SET created_at=? WHERE id=(SELECT substr(payment_id,8) FROM dance_job WHERE id=?)`,
    args: [(now - 1900) * 1000, id],
  });
  await Promise.all([
    advanceDanceJobs({ userId: id, jobId: id, reason: 'recovery' }),
    advanceDanceJobs({ userId: id, jobId: id, reason: 'recovery' }),
  ]);
  assert.equal((await jobRow(id)).error_code, 'GENERATION_DELIVERY_TIMEOUT');
  assert.equal((await jobRow(id)).provider_cost_cents, null);
  await completeDanceCallback(id, 'late-task');
  assert.equal(await cloudDanceBalance(id), 150);
  assert.equal(calls, 0);
});

test('crash between failure and refund is recovered; old draft uses debit time', async () => {
  const id = await recoveryFixture(180, 'failed', 'PROVIDER_GENERATION_FAILED');
  const recent = await recoveryFixture(10);
  await sweepDanceRecovery();
  assert.equal(await cloudDanceBalance(id), 150);
  assert.equal(await cloudDanceBalance(recent), 50);
  assert.equal((await jobRow(recent)).status, 'queued');
  await client.execute({
    sql: "UPDATE dance_job SET status='deleted' WHERE id=?",
    args: [recent],
  });
});

test('missed callback resumes only existing provider task; concurrent recovery polls once', async (t) => {
  const id = await recoveryFixture(600, 'generating', null, 'existing-task');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (input: any, init: any) => {
    assert.ok(String(input).includes('jobs/recordInfo?taskId=existing-task'));
    assert.equal(init.method, 'GET');
    calls++;
    return Response.json({
      code: 200,
      data: { state: 'fail', taskId: 'existing-task' },
    });
  });
  await Promise.all([
    advanceDanceJobs({ userId: id, jobId: id, reason: 'recovery' }),
    advanceDanceJobs({ userId: id, jobId: id, reason: 'recovery' }),
  ]);
  assert.equal(calls, 1);
  assert.equal(await cloudDanceBalance(id), 150);
});

test('idle recovery is one indexed read with no database writes and no provider calls; preview is zero reads', async (t) => {
  const d1 = (globalThis as any).__CF_ENV__.DB;
  let queries = 0;
  const original = d1.prepare;
  t.mock.method(d1, 'prepare', (sql: string) => {
    queries++;
    assert.equal(sql, recoveryCandidatesSql);
    return original(sql);
  });
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('No idle network');
  });
  assert.deepEqual(await sweepDanceRecovery(), {
    checked: 0,
    errors: 0,
    deferred: 0,
  });
  assert.equal(queries, 1);
  process.env.VITE_PREVIEW_ONLY = 'true';
  try {
    await sweepDanceRecovery();
    assert.equal(queries, 1);
  } finally {
    process.env.VITE_PREVIEW_ONLY = 'false';
  }
  const now = Math.floor(Date.now() / 1000);
  const plan = await client.execute({
    sql: `EXPLAIN QUERY PLAN ${recoveryCandidatesSql}`,
    args: [now, now, now - 300, now - 1800],
  });
  assert.match(JSON.stringify(plan.rows), /idx_dance_queue/);
  assert.match(JSON.stringify(plan.rows), /SEARCH c USING INDEX/);
});

test('recovery batch is bounded and remaining jobs wait for the next invocation', async () => {
  for (let i = 0; i < 6; i++) await recoveryFixture(600, 'failed');
  assert.equal((await sweepDanceRecovery())?.checked, 4);
  assert.equal((await sweepDanceRecovery())?.checked, 2);
  assert.equal((await sweepDanceRecovery())?.checked, 0);
});

test('missed success callback recovers video once and preserves the debit', async (t) => {
  const id = await recoveryFixture(600, 'generating', null, 'ready-task');
  let polls = 0,
    downloads = 0,
    stores = 0;
  const timeouts: number[] = [];
  const timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    timeouts.push(ms);
    return timeout(ms);
  });
  (globalThis as any).FixedLengthStream = class extends TransformStream {
    constructor(_length: number) {
      super();
    }
  };
  (globalThis as any).__CF_ENV__.DANCE_FILES = {
    put: async (_key: string, body: ReadableStream) => {
      await new Response(body).arrayBuffer();
      stores++;
    },
    delete: async () => {},
  };
  t.mock.method(globalThis, 'fetch', async (input: any) => {
    if (String(input).includes('jobs/recordInfo')) {
      polls++;
      return Response.json({
        code: 200,
        data: {
          state: 'success',
          taskId: 'ready-task',
          resultJson: JSON.stringify({
            resultUrls: ['https://tempfile.aiquickdraw.com/fixture.mp4'],
          }),
        },
      });
    }
    assert.equal(String(input), 'https://tempfile.aiquickdraw.com/fixture.mp4');
    downloads++;
    return new Response(new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112]), {
      headers: { 'content-length': '8' },
    });
  });
  await sweepDanceRecovery();
  assert.equal((await jobRow(id)).status, 'succeeded');
  await completeDanceCallback(id, 'ready-task');
  await sweepDanceRecovery();
  assert.deepEqual([polls, downloads, stores], [1, 1, 1]);
  assert.deepEqual(timeouts, [8000, 20000]);
  assert.equal(await cloudDanceBalance(id), 50);
  delete (globalThis as any).FixedLengthStream;
  delete (globalThis as any).__CF_ENV__.DANCE_FILES;
});

test('page refresh respects five-minute provider backoff, while callback bypasses it', async (t) => {
  const id = await recoveryFixture(600, 'generating', null, 'callback-task');
  const now = Math.floor(Date.now() / 1000);
  await client.execute({
    sql: 'UPDATE dance_job SET next_run_at=? WHERE id=?',
    args: [now + 300, id],
  });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({
      code: 200,
      data: { state: 'fail', taskId: 'callback-task' },
    });
  });
  await advanceDanceJobs({ userId: id, jobId: id, reason: 'refresh' });
  assert.equal(calls, 0);
  await completeDanceCallback(id, 'callback-task');
  assert.equal(calls, 1);
  assert.equal(await cloudDanceBalance(id), 150);
});
