import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const base = 'http://localhost:3000';
const signup = await fetch(base + '/api/auth/sign-up/email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify({
    name: 'Credit QA',
    email: `credit-${randomUUID()}@example.test`,
    password: randomUUID() + 'Aa9!',
  }),
});
assert.equal(signup.status, 200);
const cookie = signup.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');
async function call(path, body, authenticated = true) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Cookie: authenticated ? cookie : '',
      Origin: base,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, ...(await r.json()) };
}
const balance = async () => (await call('/api/dance/credits')).data.balance;
const pause = () => new Promise((r) => setTimeout(r, 3100));
const photo =
  'data:image/png;base64,' +
  readFileSync('data/fixtures/test-card.png').toString('base64');
const request = {
  requestKey: randomUUID(),
  photos: [photo, photo, photo],
  consent: true,
  useCredits: true,
};
assert.equal((await call('/api/dance/credits', undefined, false)).status, 401);
assert.equal(await balance(), 0);
assert.equal((await call('/api/dance/', request)).status, 402);
assert.equal(
  (await call('/api/dance/')).data.length,
  0,
  'No upload stored before credit gate'
);
const purchase = {
  packId: 'single',
  requestKey: randomUUID(),
  confirmPreview: true,
};
const bought = await Promise.all([
  call('/api/dance/credits', purchase),
  call('/api/dance/credits', purchase),
]);
for (const result of bought)
  assert.equal(result.status, 200, JSON.stringify(result));
assert.equal(await balance(), 100, 'Duplicate purchase must not grant twice');
await pause();
const made = await call('/api/dance/', request);
assert.equal(made.status, 200, JSON.stringify(made));
assert.equal(made.data.status, 'queued');
assert.equal(await balance(), 0);
await pause();
const again = await call('/api/dance/', request);
assert.equal(again.status, 200);
assert.equal(again.data.id, made.data.id);
assert.equal(await balance(), 0, 'Replay must not debit twice');
await pause();
assert.equal(
  (await call('/api/dance/', { ...request, requestKey: randomUUID() })).status,
  402
);
await call('/api/dance/credits', { ...purchase, requestKey: randomUUID() });
await pause();
const failed = await call('/api/dance/', {
  ...request,
  requestKey: randomUUID(),
  scenario: 'failure',
});
assert.equal(failed.status, 200, JSON.stringify(failed));
for (let i = 0; i < 30; i++) {
  if ((await balance()) === 100) break;
  await new Promise((r) => setTimeout(r, 1000));
}
assert.equal(await balance(), 100, 'Failed preview restores credits');
await pause();
assert.equal(await balance(), 100, 'Restoration must happen once');
console.log(
  'PASS: auth, credit gate, no unpaid upload, duplicate purchase, atomic debit, replay, insufficient balance, failed-job restoration'
);
