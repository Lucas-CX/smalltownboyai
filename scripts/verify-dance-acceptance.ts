// Read/replay validation of the explicitly approved local run. Never creates a provider task.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import Stripe from 'stripe';

import { getAllConfigs } from '../src/modules/config/service';

const origin = 'http://localhost:3000';
const account = JSON.parse(
  readFileSync('data/dance-acceptance/account.json', 'utf8')
);
const config = await getAllConfigs();
assert.ok(config.stripe_secret_key.startsWith('sk_test_'));
const stripe = new Stripe(config.stripe_secret_key);
const sql = createClient({ url: process.env.DATABASE_URL! });
const [intent] = (
  await sql.execute({
    sql: 'SELECT * FROM "order" WHERE user_id=? AND payment_provider=?',
    args: [account.userId, 'stripe-test'],
  })
).rows;
assert.ok(intent);
const checkout = await stripe.checkout.sessions.retrieve(
  String(intent.payment_session_id)
);
assert.equal(checkout.livemode, false);
assert.equal(checkout.payment_status, 'paid');
const body = JSON.stringify({
  id: 'evt_local_replay',
  type: 'checkout.session.completed',
  livemode: false,
  data: { object: checkout },
});
const signature = stripe.webhooks.generateTestHeaderString({
  payload: body,
  secret: config.stripe_signing_secret,
});
const replies = await Promise.all(
  Array.from({ length: 3 }, () =>
    fetch(origin + '/api/dance/stripe-webhook', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
        'Content-Type': 'application/json',
      },
    })
  )
);
assert.ok(replies.every((r) => r.status === 200));
const invalid = await fetch(origin + '/api/dance/stripe-webhook', {
  method: 'POST',
  body,
  headers: { 'stripe-signature': 'bad' },
});
assert.equal(invalid.status, 400);
const login = await fetch(origin + '/api/auth/sign-in/email', {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: account.email, password: account.password }),
});
assert.equal(login.status, 200);
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');
const jobs = await (
  await fetch(origin + '/api/dance/', { headers: { Cookie: cookie } })
).json();
assert.equal(jobs.data.length, 1);
const job = jobs.data[0];
assert.equal(job.simulation, false);
assert.equal(job.resolution, '480P');
assert.ok(job.providerId && !job.providerId.startsWith('mock'));
assert.equal(job.resultKey, undefined);
assert.equal(job.photos, undefined);
const anonymous = await fetch(origin + `/api/dance/file?id=${job.id}&slot=0`);
assert.equal(anonymous.status, 401);
const crossOwner = await fetch(
  origin + '/api/dance/file?id=d0642e66-6b0d-4483-9c97-a2c550ee6ab9&slot=video',
  { headers: { Cookie: cookie } }
);
assert.equal(crossOwner.status, 404);
const grants = (
  await sql.execute({
    sql: "SELECT * FROM credit WHERE user_id=? AND transaction_type='grant'",
    args: [account.userId],
  })
).rows;
assert.equal(grants.length, 1);
assert.equal(grants[0].credits, 100);
assert.equal(grants[0].remaining_credits, 0);
const consumes = (
  await sql.execute({
    sql: "SELECT * FROM credit WHERE user_id=? AND transaction_type='consume'",
    args: [account.userId],
  })
).rows;
assert.equal(consumes.length, 1);
const [stored] = (
  await sql.execute({
    sql: 'SELECT request_key FROM dance_job WHERE id=?',
    args: [job.id],
  })
).rows;
const photos = ['dancer', 'selfie', 'car-exit'].map(
  (n) =>
    'data:image/png;base64,' +
    readFileSync(`data/real-tests/cast-v1/${n}.png`).toString('base64')
);
const repeat = await fetch(origin + '/api/dance/', {
  method: 'POST',
  headers: {
    Origin: origin,
    Cookie: cookie,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    requestKey: String(stored.request_key).slice(account.userId.length + 1),
    resolution: '480P',
    photos,
    consent: true,
    useCredits: true,
  }),
});
assert.equal(repeat.status, 200);
assert.equal((await repeat.json()).data.id, job.id);
await new Promise((resolve) => setTimeout(resolve, 3100));
const unpaid = await fetch(origin + '/api/dance/', {
  method: 'POST',
  headers: {
    Origin: origin,
    Cookie: cookie,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    requestKey: crypto.randomUUID(),
    resolution: '480P',
    photos,
    consent: true,
    useCredits: true,
  }),
});
assert.equal(unpaid.status, 402);
let file: Record<string, unknown> = { pending: true };
if (job.status === 'succeeded') {
  const response = await fetch(
    origin + `/api/dance/file?id=${job.id}&slot=video&download=1`,
    { headers: { Cookie: cookie } }
  );
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get('content-disposition') || '',
    /attachment.*generated-video.mp4/
  );
  assert.match(
    response.headers.get('cache-control') || '',
    /private, no-store/
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync('data/dance-acceptance/downloaded.mp4', bytes);
  const range = await fetch(
    origin + `/api/dance/file?id=${job.id}&slot=video`,
    {
      headers: {
        Cookie: cookie,
        Range: 'bytes=0-99',
        'Sec-Fetch-Dest': 'video',
      },
    }
  );
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 100);
  file = {
    bytes: bytes.length,
    range206: true,
    browserMediaRouting: true,
    attachment: true,
    private: true,
  };
}
const report = {
  at: new Date().toISOString(),
  stripe: {
    test: true,
    paid: true,
    amountCents: checkout.amount_total,
    duplicateWebhooks: 3,
    invalidSignatureRejected: true,
    grants: 1,
    consumes: 1,
  },
  job: {
    id: job.id,
    providerId: job.providerId,
    status: job.status,
    resolution: job.resolution,
  },
  duplicateGenerationRequestSameJob: true,
  insufficientCreditsRejected402: true,
  anonymousFileDenied: true,
  otherOwnerFileDenied: true,
  file,
};
writeFileSync(
  'data/dance-acceptance/verification.json',
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report));
await sql.close();
