import assert from 'node:assert/strict';
import test from 'node:test';

import { reviewDancePayment } from '../src/lib/dance-payment-review';

test('payment review requires login, matching mode and owner before touching the ledger', async () => {
  let reads = 0,
    grants = 0;
  const args = {
    userId: 'owner',
    sessionId: 'cs_test_fixture',
    live: false,
    retrieve: async () => {
      reads++;
      return { metadata: { userId: 'owner' } };
    },
    fulfill: async () => {
      grants++;
      return true;
    },
  };
  assert.equal(
    await reviewDancePayment({ ...args, userId: undefined }),
    'login'
  );
  assert.equal(await reviewDancePayment({ ...args, live: true }), 'pending');
  assert.equal(
    await reviewDancePayment({ ...args, sessionId: 'untrusted' }),
    'pending'
  );
  assert.equal(reads, 0);
  assert.equal(
    await reviewDancePayment({
      ...args,
      sessionId: 'cs_test_' + 'a'.repeat(256),
    }),
    'pending'
  );
  assert.equal(reads, 0);
  assert.equal(
    await reviewDancePayment({ ...args, userId: 'another' }),
    'pending'
  );
  assert.equal(grants, 0);
  assert.equal(await reviewDancePayment(args), 'confirmed');
  assert.equal(grants, 1);
});

test('outages and unpaid sessions remain pending; idempotently fulfilled receipts are confirmed', async () => {
  const args = {
    userId: 'owner',
    sessionId: 'cs_test_fixture',
    live: false,
    retrieve: async () => ({ metadata: { userId: 'owner' } }),
    fulfill: async () => false, // already granted, no second grant
  };
  assert.equal(await reviewDancePayment(args), 'confirmed');
  assert.equal(
    await reviewDancePayment({
      ...args,
      retrieve: async () => {
        throw new Error('offline');
      },
    }),
    'pending'
  );
  assert.equal(
    await reviewDancePayment({
      ...args,
      fulfill: async () => {
        throw new Error('unpaid');
      },
    }),
    'pending'
  );
});
