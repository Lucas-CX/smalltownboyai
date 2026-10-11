// Local-only integration suite. Requires dev server + dance worker + fixture.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const base = 'http://localhost:3000';
async function user() {
  const email = `dance-${randomUUID()}@example.test`;
  const password = randomUUID() + 'Aa9!';
  const r = await fetch(base + '/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ name: 'Local QA', email, password }),
  });
  assert.equal(r.status, 200, 'Local test signup failed');
  return {
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
    email,
    password,
  };
}
async function call(path, account, body) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Cookie: account?.cookie || '',
      Origin: base,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
const alice = await user(),
  bob = await user();
writeFileSync('data/tests/browser-account.json', JSON.stringify(alice));
const photo =
  'data:image/png;base64,' +
  readFileSync('data/fixtures/test-card.png').toString('base64');
assert.equal((await call('/api/dance/', null)).status, 401);
const made = await call('/api/dance/', alice, {
  requestKey: randomUUID(),
  photos: [photo, photo, photo],
  consent: true,
  scenario: 'success',
});
assert.equal(made.status, 200, JSON.stringify(made.data));
const id = made.data.data.id;
assert.equal(
  (await call('/api/dance/file?id=' + id + '&slot=0', bob)).status,
  404
);
assert.equal(
  (await call('/api/dance/file?id=' + id + '&slot=video', alice)).status,
  409
);
const cross = await fetch(base + '/api/dance/action', {
  method: 'POST',
  headers: {
    Cookie: alice.cookie,
    Origin: 'https://untrusted.example',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ id, action: 'pay-mock' }),
});
assert.equal(cross.status, 403);
await Promise.all([
  call('/api/dance/action', alice, { id, action: 'pay-mock' }),
  call('/api/dance/action', alice, { id, action: 'pay-mock' }),
]);
let job;
for (let i = 0; i < 25; i++) {
  job = (await call('/api/dance/', alice)).data.data.find((j) => j.id === id);
  if (job.status === 'succeeded') break;
  await new Promise((r) => setTimeout(r, 1000));
}
assert.equal(job.status, 'succeeded');
const file = await fetch(
  base + `/api/dance/file?id=${id}&slot=video&download=1`,
  { headers: { Cookie: alice.cookie } }
);
assert.equal(file.status, 200);
assert.equal(file.headers.get('content-type'), 'video/mp4');
assert.match(file.headers.get('content-disposition'), /SIMULATION/);
assert.ok((await file.arrayBuffer()).byteLength > 1000);
assert.equal(file.headers.get('cache-control'), 'private, no-store');
const partial = await fetch(base + `/api/dance/file?id=${id}&slot=video`, {
  headers: { Cookie: alice.cookie, Range: 'bytes=0-99' },
});
assert.equal(partial.status, 206);
assert.equal((await partial.arrayBuffer()).byteLength, 100);
assert.equal((await call('/api/admin/dance', alice)).status, 403);
assert.equal(
  (await call('/api/payment/checkout', alice, { product_id: 'test' })).status,
  503
);
const webhook = await call('/api/dance/stripe-webhook', null, {
  type: 'checkout.session.completed',
});
assert.equal(webhook.status, 400);
// Retain Alice's successful test order for browser playback review; no personal data.
const bad = await call('/api/dance/', bob, {
  requestKey: randomUUID(),
  photos: [
    'data:image/png;base64,SGVsbG8=',
    'data:image/png;base64,SGVsbG8=',
    'data:image/png;base64,SGVsbG8=',
  ],
  consent: true,
});
assert.equal(bad.status, 400);
console.log(
  'HTTP PASS: auth, server decode, unpaid video, cross-account privacy, CSRF, duplicate payment, durable worker completion, video download, admin RBAC, blocked live checkout, rejected webhook.'
);
