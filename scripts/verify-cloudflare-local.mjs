import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const origin = process.env.DANCE_VERIFY_ORIGIN || 'http://localhost:8787';
if (!['http://localhost:8787'].includes(origin))
  throw new Error('Unexpected acceptance origin');
const previewCookie = '';
const id = crypto.randomUUID();
const account = {
  email: `cloud-${id}@example.test`,
  password: crypto.randomUUID() + 'Aa9!',
  name: 'Cloud QA',
};
const signup = await fetch(origin + '/api/auth/sign-up/email', {
  method: 'POST',
  headers: {
    Origin: origin,
    Cookie: previewCookie,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(account),
});
assert.equal(signup.status, 200, await signup.clone().text());
const body = await signup.json();
const cookie = [
  previewCookie,
  ...signup.headers.getSetCookie().map((c) => c.split(';')[0]),
]
  .filter(Boolean)
  .join('; ');
mkdirSync('data/cloudflare-tests', { recursive: true });
writeFileSync(
  'data/cloudflare-tests/account.json',
  JSON.stringify({ ...account, userId: body.user.id, cookie })
);
const photos = ['dancer', 'selfie', 'car-exit'].map(
  (n) =>
    'data:image/png;base64,' +
    readFileSync(`data/real-tests/cast-v1/${n}.png`).toString('base64')
);
const post = (payload) =>
  fetch(origin + '/api/dance/', {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
const input = {
  requestKey: crypto.randomUUID(),
  photos,
  consent: true,
  resolution: '480P',
  useCredits: true,
};
const unpaid = await post(input);
assert.equal(unpaid.status, 402, await unpaid.clone().text());
await new Promise((r) => setTimeout(r, 3100));
const uploaded = await post({ ...input, useCredits: false });
assert.equal(uploaded.status, 200, await uploaded.clone().text());
const job = (await uploaded.json()).data;
assert.equal(job.status, 'unpaid');
writeFileSync('data/cloudflare-tests/job.json', JSON.stringify(job));
const url = origin + `/api/dance/file?id=${job.id}&slot=0`;
assert.equal((await fetch(url)).status, 401);
const image = await fetch(url, { headers: { Cookie: cookie } });
assert.equal(image.status, 200);
assert.equal(image.headers.get('content-type'), 'image/jpeg');
assert.equal(
  Buffer.from(await image.arrayBuffer())
    .subarray(0, 2)
    .toString('hex'),
  'ffd8'
);
const restored = await fetch(origin + '/api/dance/', {
  headers: { Cookie: cookie },
});
assert.equal((await restored.json()).data[0].id, job.id);
const checkout = await fetch(origin + '/api/dance/credits', {
  method: 'POST',
  headers: {
    Origin: origin,
    Cookie: cookie,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    packId: 'single',
    requestKey: crypto.randomUUID(),
    confirmPreview: true,
  }),
});
assert.equal(checkout.status, 200, await checkout.clone().text());
const checkoutResult = (await checkout.json()).data;
assert.match(checkoutResult.checkoutUrl, /^https:\/\/checkout.stripe.com\//);
writeFileSync(
  'data/cloudflare-tests/checkout.json',
  JSON.stringify(checkoutResult)
);
console.log(
  JSON.stringify({
    signup: true,
    unpaid402: true,
    wasmDecode: true,
    privateR2: true,
    refresh: true,
    stripeTestCheckout: true,
  })
);
