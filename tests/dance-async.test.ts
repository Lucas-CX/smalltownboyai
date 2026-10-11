import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { createClient } from '@libsql/client';

process.env.DANCE_SANDBOX = 'true';
process.env.DATABASE_PROVIDER = 'sqlite';
process.env.DATABASE_URL = `file:data/tests/async-${crypto.randomUUID()}.db`;
process.env.AUTH_SECRET = 'local-test-callback-secret-not-for-production';
process.env.VITE_APP_URL = 'https://example.test';
process.env.KIE_API_KEY = 'LOCAL_KIE_FIXTURE_ONLY';
process.env.VITE_PREVIEW_ONLY = 'false';
mkdirSync('data/tests', { recursive: true });
const sql = createClient({ url: process.env.DATABASE_URL });
await sql.executeMultiple(
  readFileSync('migrations/cloudflare/0001_initial.sql', 'utf8')
);
await sql.executeMultiple(
  readFileSync('migrations/cloudflare/0002_dance_funnel.sql', 'utf8')
);
await sql.execute(
  "INSERT INTO user(id,name,email) VALUES ('alice','A','alice@example.test'),('bob','B','bob@example.test')"
);
const { danceCallbackUrl, readCallbackTaskId, verifyDanceCallback } =
  await import('../src/core/ai/dance-callback');
const { DANCE_MODEL, KieDanceClient } =
  await import('../src/core/ai/dance-kie');
const { advanceDanceJobs, completeDanceCallback } =
  await import('../src/lib/dance-events.server');
const { handleKieCallback } =
  await import('../src/routes/api/dance/kie-callback');
const service = await import('../src/modules/dance/service');
const { readPrivate } = await import('../src/core/storage/dance-private');
const stamp = () => Math.floor(Date.now() / 1000);
async function job(
  user = 'alice',
  provider: string | null = 'provider_fixture',
  status = 'generating'
) {
  const id = crypto.randomUUID();
  await sql.execute({
    sql: "INSERT INTO dance_job(id,user_id,request_key,photos,status,provider_id,generation_mode,payment_mode,created_at,expires_at,next_run_at) VALUES (?,?,?,'[]',?,?,'kie','credits-test',?,?,0)",
    args: [id, user, id, status, provider, stamp(), stamp() + 3600],
  });
  return id;
}
function callback(id: string, taskId = 'provider_fixture', extra = {}) {
  return new Request(danceCallbackUrl(id), {
    method: 'POST',
    body: JSON.stringify({ data: { taskId, ...extra } }),
  });
}
function mockProvider(t: any, state: string, extra = {}) {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    assert.notEqual(
      init?.method,
      'POST',
      'reconciliation must never create a task'
    );
    if (url.startsWith('https://api.kie.ai/api/v1/jobs/recordInfo?'))
      return Response.json({
        code: 200,
        data: {
          state,
          resultJson: JSON.stringify({
            resultUrls: ['https://tempfile.aiquickdraw.com/fixture.mp4'],
          }),
          ...extra,
        },
      });
    assert.equal(url, 'https://tempfile.aiquickdraw.com/fixture.mp4');
    return new Response(Buffer.from('\0\0\0\x18ftypisomLOCAL-TEST-MEDIA'));
  });
  return calls;
}

test('async submission sends per-job callback URL and does not retry an ambiguous createTask', async () => {
  const id = crypto.randomUUID();
  let calls = 0;
  const client = new KieDanceClient('fixture', async (_url, options) => {
    calls++;
    const payload = JSON.parse(String(options?.body));
    assert.equal(payload.callBackUrl, danceCallbackUrl(id));
    assert.equal(payload.model, DANCE_MODEL);
    return Response.json({ code: 200, data: { taskId: 'task_created' } });
  });
  const images = ['https://example.test/a.jpg', 'https://example.test/b.jpg'];
  const reference = {
    url: 'https://example.test/reference.mp4',
    durationSeconds: 14,
  };
  assert.equal(
    await client.submit(images, reference, '720P', danceCallbackUrl(id)),
    'task_created'
  );
  assert.equal(calls, 1);
  const failed = new KieDanceClient('fixture', async () => {
    calls++;
    throw new Error('timeout');
  });
  await assert.rejects(
    failed.submit(images, reference, '720P', danceCallbackUrl(id)),
    /timeout/
  );
  assert.equal(calls, 2);
});

test('callback capability is job-scoped; forged or oversized callbacks cannot reach providers', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('No provider access permitted');
  });
  const id = crypto.randomUUID();
  const url = new URL(danceCallbackUrl(id));
  assert.equal(verifyDanceCallback(url), id);
  url.searchParams.set('job', crypto.randomUUID());
  assert.equal(verifyDanceCallback(url), null);
  assert.equal(
    (await handleKieCallback(new Request(url, { method: 'POST', body: '{}' })))
      .status,
    401
  );
  assert.equal(
    (
      await handleKieCallback(
        new Request(danceCallbackUrl(id), {
          method: 'POST',
          body: 'x'.repeat(65537),
        })
      )
    ).status,
    400
  );
  assert.equal(
    await readCallbackTaskId(
      new Request('https://example.test', {
        method: 'POST',
        body: JSON.stringify({ data: { task_id: 'task_fixture' } }),
      })
    ),
    'task_fixture'
  );
});

test('completion fetches authoritative result, persists private video and makes duplicates harmless', async (t) => {
  const id = await job();
  const calls = mockProvider(t, 'success');
  const response = await handleKieCallback(
    callback(id, 'provider_fixture', {
      state: 'fail',
      resultJson: '{"resultUrls":["http://127.0.0.1/secret"]}',
    })
  );
  assert.equal(response.status, 200);
  const saved = await service.owned('alice', id);
  assert.equal(saved.status, 'succeeded');
  assert.ok(saved.resultKey);
  assert.match(
    (await readPrivate(saved.resultKey!)).toString(),
    /LOCAL-TEST-MEDIA/
  );
  const count = calls.length;
  assert.equal((await handleKieCallback(callback(id))).status, 200);
  assert.equal(calls.length, count);
  await service.erase('alice', id);
});

test('callback arriving after a lost submission response recovers only the matching provider receipt', async (t) => {
  const id = await job('alice', null, 'reconciling');
  const calls = mockProvider(t, 'success', {
    taskId: 'recovered_task',
    model: DANCE_MODEL,
    param: JSON.stringify({ callBackUrl: danceCallbackUrl(id) }),
  });
  await completeDanceCallback(id, 'recovered_task');
  assert.equal((await service.owned('alice', id)).providerId, 'recovered_task');
  assert.equal((await service.owned('alice', id)).status, 'succeeded');
  assert.equal(calls.filter((x) => x.includes('recordInfo')).length, 2);
  await service.erase('alice', id);
  const other = await job('alice', null, 'reconciling');
  await assert.rejects(
    completeDanceCallback(other, 'recovered_task'),
    /Unmatched/
  );
  assert.equal((await service.owned('alice', other)).providerId, null);
});

test('page reconciliation is owner-scoped and repeated refreshes respect durable backoff', async (t) => {
  const mine = await job('alice', 'alice_task');
  const theirs = await job('bob', 'bob_task');
  const calls = mockProvider(t, 'generating');
  await advanceDanceJobs({ userId: 'alice', jobId: mine, reason: 'refresh' });
  await advanceDanceJobs({ userId: 'alice', jobId: mine, reason: 'refresh' });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /alice_task/);
  assert.equal((await service.owned('bob', theirs)).nextRunAt, 0);
  await advanceDanceJobs({ userId: 'alice', jobId: theirs, reason: 'refresh' });
  assert.equal(calls.length, 1);
  await service.erase('alice', mine);
  await service.erase('bob', theirs);
});

test('failed completion restores only its own debit once, including duplicate callbacks', async (t) => {
  const id = await job();
  mockProvider(t, 'fail');
  await sql.execute({
    sql: "INSERT INTO credit(id,user_id,transaction_no,transaction_type,credits,remaining_credits,status) VALUES (?,'alice',?,'grant',100,0,'active')",
    args: [`grant:${id}`, `grant:${id}`],
  });
  await sql.execute({
    sql: "INSERT INTO credit(id,user_id,transaction_no,transaction_type,credits,remaining_credits,status,consumed_detail) VALUES (?,'alice',?,'consume',-100,0,'active',?)",
    args: [
      `spent:${id}`,
      `spent:${id}`,
      JSON.stringify([{ creditId: `grant:${id}`, creditsConsumed: 100 }]),
    ],
  });
  await sql.execute({
    sql: 'UPDATE dance_job SET payment_id=? WHERE id=?',
    args: [`credit:spent:${id}`, id],
  });
  await completeDanceCallback(id, 'provider_fixture');
  await completeDanceCallback(id, 'provider_fixture');
  assert.equal(
    (
      await sql.execute({
        sql: 'SELECT remaining_credits FROM credit WHERE id=?',
        args: [`grant:${id}`],
      })
    ).rows[0].remaining_credits,
    100
  );
  assert.equal(
    (await service.owned('alice', id)).paymentMode,
    'credits-restored'
  );
});

test('callback and page racing share a lease; a pending transfer is retryable', async (t) => {
  const id = await job('alice', 'race_task');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async (url: any) => {
    reads++;
    assert.match(String(url), /recordInfo/);
    entered();
    await gate;
    return Response.json({ code: 200, data: { state: 'fail' } });
  });
  const first = advanceDanceJobs({
    userId: 'alice',
    jobId: id,
    reason: 'refresh',
  });
  await started;
  const second = await handleKieCallback(callback(id, 'race_task'));
  assert.equal(second.status, 503);
  assert.equal(reads, 1);
  release();
  await first;
  assert.equal(
    (await handleKieCallback(callback(id, 'race_task'))).status,
    200
  );
  assert.equal(reads, 1);
});

test('preview blocks submission, refresh and completion without provider traffic', async (t) => {
  const id = await job();
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    throw new Error('Must not call provider');
  });
  process.env.VITE_PREVIEW_ONLY = 'true';
  try {
    await advanceDanceJobs({ userId: 'alice', jobId: id, reason: 'submit' });
    await service.tick('fixture', {
      userId: 'alice',
      jobId: id,
      reason: 'refresh',
    });
    assert.equal((await handleKieCallback(callback(id))).status, 503);
    assert.equal(requests, 0);
    assert.equal((await service.owned('alice', id)).status, 'generating');
  } finally {
    process.env.VITE_PREVIEW_ONLY = 'false';
  }
});

test('completion cannot bypass the final seconds of an active delivery lease', async (t) => {
  const id = await job('alice', 'leased_task');
  await sql.execute({
    sql: "UPDATE dance_job SET next_run_at=?,error_code='RESULT_PROCESSING' WHERE id=?",
    args: [stamp() + 10, id],
  });
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    throw new Error('Active lease');
  });
  assert.equal(
    (await handleKieCallback(callback(id, 'leased_task'))).status,
    503
  );
  assert.equal(requests, 0);
  assert.equal(
    service.visible(await service.owned('alice', id)).errorCode,
    null
  );
});

test('expired tasks fail on demand without querying Kie or publishing late media', async (t) => {
  const id = await job('alice', null, 'reconciling');
  await sql.execute({
    sql: 'UPDATE dance_job SET expires_at=0 WHERE id=?',
    args: [id],
  });
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('No provider call after expiry');
  });
  assert.equal(
    (await handleKieCallback(callback(id, 'late_task'))).status,
    200
  );
  assert.equal((await service.owned('alice', id)).status, 'failed');
  assert.equal((await service.owned('alice', id)).resultKey, null);
});

test('download failure stays retryable; callback retry recovers the same task', async (t) => {
  const id = await job('alice', 'download_retry');
  let downloads = 0,
    queries = 0;
  t.mock.method(globalThis, 'fetch', async (url: any) => {
    if (String(url).includes('recordInfo')) {
      queries++;
      return Response.json({
        code: 200,
        data: {
          state: 'success',
          resultJson: JSON.stringify({
            resultUrls: ['https://tempfile.aiquickdraw.com/fixture.mp4'],
          }),
        },
      });
    }
    downloads++;
    if (downloads === 1) throw new Error('Temporary storage transport failure');
    return new Response(Buffer.from('\0\0\0\x18ftypisomLOCAL-TEST-MEDIA'));
  });
  assert.equal(
    (await handleKieCallback(callback(id, 'download_retry'))).status,
    503
  );
  assert.equal(
    (await service.owned('alice', id)).errorCode,
    'PROVIDER_RESULT_DOWNLOAD_PENDING'
  );
  assert.equal(
    (await handleKieCallback(callback(id, 'download_retry'))).status,
    200
  );
  assert.equal(queries, 2);
  assert.equal(downloads, 2);
  assert.equal((await service.owned('alice', id)).providerId, 'download_retry');
  await service.erase('alice', id);
});

test('refresh HTTP handler rejects cross-origin and anonymous requests before provider work', async (t) => {
  const { Route } = await import('../src/routes/api/dance/refresh');
  const handler = (Route.options as any).server.handlers.POST;
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('No provider access');
  });
  assert.equal(
    (
      await handler({
        request: new Request('https://example.test/api/dance/refresh', {
          method: 'POST',
          headers: { origin: 'https://attacker.test' },
        }),
      })
    ).status,
    403
  );
  assert.equal(
    (
      await handler({
        request: new Request('https://example.test/api/dance/refresh', {
          method: 'POST',
          headers: { origin: 'https://example.test' },
        }),
      })
    ).status,
    401
  );
});
