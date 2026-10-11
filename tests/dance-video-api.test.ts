import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { createClient } from '@libsql/client';

mkdirSync('data/tests', { recursive: true });
process.env.DATABASE_PROVIDER = 'sqlite';
process.env.DATABASE_URL = `file:data/tests/video-api-${crypto.randomUUID()}.db`;
process.env.DANCE_SANDBOX = 'true';
process.env.DANCE_CLOUD_ENABLED = 'false';
process.env.DANCE_GENERATION_MODE = 'mock';
process.env.VITE_APP_URL = 'http://localhost:3000';
process.env.AUTH_SECRET = `local-video-api-${crypto.randomUUID()}`;
const sql = createClient({ url: process.env.DATABASE_URL });
await sql.executeMultiple(
  readFileSync('migrations/cloudflare/0001_initial.sql', 'utf8')
);
await sql.executeMultiple(
  readFileSync('migrations/cloudflare/0002_dance_funnel.sql', 'utf8')
);
const { getAuth } = await import('../src/core/auth');
const { savePrivate, deletePrivate } =
  await import('../src/core/storage/dance-private');
const { Route } = await import('../src/routes/api/dance/file');
const handle = (
  Route.options.server!.handlers as {
    GET: (ctx: { request: Request }) => Promise<Response>;
  }
).GET;

test('private video status checks real authentication, ownership, expiry and storage without returning media', async () => {
  const auth = await getAuth().handler(
    new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        name: 'Local QA',
        email: 'video-api@example.test',
        password: crypto.randomUUID(),
      }),
    })
  );
  assert.equal(auth.status, 200);
  const account = await auth.json();
  const cookie = auth.headers
    .getSetCookie()
    .map((value: string) => value.split(';')[0])
    .join('; ');
  assert.ok(cookie);
  const key = await savePrivate(
    new Uint8Array([
      0, 0, 0, 16, 102, 116, 121, 112, 109, 112, 52, 50, 0, 0, 0, 0,
    ])
  );
  const id = crypto.randomUUID(),
    other = crypto.randomUUID(),
    now = Math.floor(Date.now() / 1000);
  const response = async (
    jobId: string,
    session = true,
    query = '&status=1'
  ) => {
    const request = new Request(
      `http://localhost:3000/api/dance/file?id=${jobId}&slot=video${query}`,
      { headers: session ? { Cookie: cookie } : {} }
    );
    return await (handle as (ctx: { request: Request }) => Promise<Response>)({
      request,
    });
  };
  const state = async (jobId: string, session = true) => {
    const res = await response(jobId, session);
    assert.match(res.headers.get('cache-control') || '', /no-store/);
    const body = await res.json();
    assert.equal(body.code, 0);
    assert.deepEqual(Object.keys(body.data), ['state']);
    return body.data.state;
  };
  try {
    await sql.execute({
      sql: "INSERT INTO dance_job(id,user_id,request_key,photos,created_at,expires_at,next_run_at,status,generation_mode,result_key) VALUES (?,?,?,'[]',?,?,?,'succeeded','kie',?)",
      args: [id, account.user.id, id, now, now + 3600, now, key],
    });
    await sql.execute({
      sql: "INSERT INTO user(id,name,email) VALUES (?,'Other QA','other-video@example.test')",
      args: [other],
    });
    const otherJob = crypto.randomUUID();
    await sql.execute({
      sql: "INSERT INTO dance_job(id,user_id,request_key,photos,created_at,expires_at,next_run_at,status,generation_mode,result_key) VALUES (?,?,?,'[]',?,?,?,'succeeded','kie',?)",
      args: [otherJob, other, otherJob, now, now + 3600, now, key],
    });
    assert.equal(await state(id, false), 'authentication_required');
    assert.equal(await state(otherJob), 'video_missing');
    assert.equal(await state(crypto.randomUUID()), 'video_missing');
    assert.equal(await state(id), 'ready');
    const media = await response(id, true, '');
    assert.equal(media.status, 200);
    assert.equal(media.headers.get('content-type'), 'video/mp4');
    assert.equal((await media.arrayBuffer()).byteLength, 16);
    await sql.execute({
      sql: "UPDATE dance_job SET status='queued' WHERE id=?",
      args: [id],
    });
    assert.equal(await state(id), 'video_not_ready');
    await sql.execute({
      sql: "UPDATE dance_job SET status='deleted' WHERE id=?",
      args: [id],
    });
    assert.equal(await state(id), 'video_expired');
    await sql.execute({
      sql: "UPDATE dance_job SET status='succeeded',expires_at=0 WHERE id=?",
      args: [id],
    });
    assert.equal(await state(id), 'video_expired');
    await sql.execute({
      sql: 'UPDATE dance_job SET expires_at=? WHERE id=?',
      args: [now + 3600, id],
    });
    await deletePrivate(key);
    assert.equal(await state(id), 'video_missing');
    assert.equal((await response(id, false, '')).status, 401);
  } finally {
    await deletePrivate(key);
    await sql.close();
  }
});
