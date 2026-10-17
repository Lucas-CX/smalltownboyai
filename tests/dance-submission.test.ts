import assert from 'node:assert/strict';
import test from 'node:test';

import { submitRealDance } from '../src/core/ai/dance-acceptance.workers';
import { KieDanceClient } from '../src/core/ai/dance-kie';
import { DancePreSubmissionError } from '../src/core/ai/dance-submission';
import { deletePrivate, savePrivate } from '../src/core/storage/dance-private';

test('only proven pre-submit failures are refundable; paid-call uncertainty and duplicate claims stay in review', async (t) => {
  const names = [
    'AUTH_SECRET',
    'VITE_APP_URL',
    'DATABASE_PROVIDER',
    'DANCE_CLOUD_ENABLED',
    'DANCE_PAYMENT_MODE',
    'DANCE_GENERATION_MODE',
  ];
  const previous = names.map((name) => process.env[name]);
  const bindings = (globalThis as any).__CF_ENV__;
  const originalFetch = globalThis.fetch;
  const photos = [
    await savePrivate(Buffer.from('fixture-a')),
    await savePrivate(Buffer.from('fixture-b')),
  ];
  try {
    Object.assign(process.env, {
      AUTH_SECRET: 'local-fixture-callback-secret-not-production',
      VITE_APP_URL: 'https://example.test',
      DATABASE_PROVIDER: 'd1',
      DANCE_CLOUD_ENABLED: 'true',
      DANCE_PAYMENT_MODE: 'stripe-live',
      DANCE_GENERATION_MODE: 'kie',
    });
    for (const outcome of [
      'balance-timeout',
      'empty-balance',
      'photo-upload',
      'reference-upload',
      'duplicate-claim',
      'claim-error',
      'create-timeout',
      'missing-task-id',
      'success',
    ]) {
      await t.test(outcome, async () => {
        let creates = 0,
          balances = 0,
          claims = 0,
          uploads = 0;
        (globalThis as any).__CF_ENV__ = {
          DB: {
            prepare: (sql: string) => ({
              bind: () => ({
                first: async () => {
                  if (sql.startsWith('INSERT')) {
                    claims++;
                    if (outcome === 'claim-error')
                      throw new Error('D1 outcome unknown');
                    if (outcome === 'duplicate-claim') return null;
                  }
                  return { id: 'fixture', name: 'fixture' };
                },
                run: async () => ({ success: true }),
              }),
            }),
          },
        };
        globalThis.fetch = async (input, init) => {
          const url = String(input);
          if (url.endsWith('chat/credit')) {
            balances++;
            assert.equal(init?.method, 'GET');
            if (outcome === 'balance-timeout')
              throw new DOMException('timed out', 'TimeoutError');
            return Response.json({
              code: 200,
              data: outcome === 'empty-balance' ? 0 : 1000,
            });
          }
          if (url.endsWith('file-stream-upload')) {
            uploads++;
            if (
              outcome === 'photo-upload' ||
              (outcome === 'reference-upload' && uploads === 3)
            )
              throw new Error('network failure');
            return Response.json({
              code: 200,
              data: { downloadUrl: 'https://example.test/fixture' },
            });
          }
          assert.ok(url.endsWith('jobs/createTask'));
          creates++;
          if (outcome === 'create-timeout')
            throw new DOMException('timed out', 'TimeoutError');
          return Response.json({
            code: 200,
            data: outcome === 'missing-task-id' ? {} : { taskId: 'fixture' },
          });
        };
        const task = submitRealDance(
          {
            id: '00000000-0000-4000-8000-000000000001',
            userId: 'fixture',
            resolution: '480P',
            photos: JSON.stringify(photos),
          },
          'fixture'
        );
        const safe = [
          'balance-timeout',
          'empty-balance',
          'photo-upload',
          'reference-upload',
        ].includes(outcome);
        if (outcome === 'success') assert.equal(await task, 'fixture');
        else
          await assert.rejects(task, (error) => {
            assert.equal(error instanceof DancePreSubmissionError, safe);
            if (safe)
              assert.match(
                (error as Error).message,
                /^PRE_SUBMISSION_(BALANCE|PHOTO_UPLOAD|REFERENCE_UPLOAD)$/
              );
            return true;
          });
        assert.equal(
          creates,
          ['create-timeout', 'missing-task-id', 'success'].includes(outcome)
            ? 1
            : 0
        );
        if (outcome === 'balance-timeout') {
          assert.equal(balances, 2);
          assert.equal(claims, 0);
        }
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).__CF_ENV__ = bindings;
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name];
      else process.env[name] = previous[i];
    });
    await Promise.all(photos.map(deletePrivate));
  }
});

test('read-only balance retry recovers a transient failure without retrying a paid operation', async () => {
  let calls = 0;
  const client = new KieDanceClient('fixture', async (url, init) => {
    assert.ok(String(url).endsWith('chat/credit'));
    assert.equal(init?.method, 'GET');
    if (++calls === 1) throw new TypeError('network failure');
    return Response.json({ code: 200, data: 100 });
  });
  assert.equal(await client.balance(), 100);
  assert.equal(calls, 2);
});
