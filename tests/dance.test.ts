import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createClient } from '@libsql/client';
import sharp from 'sharp';
import Stripe from 'stripe';

import { dancePayload, KieDanceClient } from '../src/core/ai/dance-kie';
import { downloadDanceResult } from '../src/core/ai/dance-result';
import { verifyDanceEvent } from '../src/core/payment/dance-event';
import { normalizePhoto, readPrivate } from '../src/core/storage/dance-private';

mkdirSync('data/tests', { recursive: true });
process.env.DANCE_SANDBOX = 'true';
process.env.DATABASE_PROVIDER = 'sqlite';
process.env.DATABASE_URL = `file:data/tests/dance-${crypto.randomUUID()}.db`;
const sql = createClient({ url: process.env.DATABASE_URL });
await sql.execute('CREATE TABLE user (id TEXT PRIMARY KEY)');
await sql.executeMultiple(
  readFileSync('migrations/001-dance-sqlite.sql', 'utf8')
);
await sql.executeMultiple(
  readFileSync('migrations/002-dance-resolution.sql', 'utf8')
);
await sql.executeMultiple(
  readFileSync('migrations/003-dance-real-result.sql', 'utf8')
);
await sql.execute("INSERT INTO user(id) VALUES ('alice'), ('bob')");
const service = await import('../src/modules/dance/service');
const image = await sharp({
  create: { width: 400, height: 500, channels: 3, background: '#647c59' },
})
  .png()
  .toBuffer();

test('duo saves two private ordered images, retries stay idempotent and deletion removes both', async () => {
  await sql.execute("INSERT INTO user(id) VALUES ('cast-test')");
  const { completeDanceCast } =
    await import('../src/core/storage/dance-default-cast');
  for (let mask = 3; mask < 4; mask++) {
    const photos = [0, 1].map((i) => (mask & (1 << i) ? image : null));
    const request = crypto.randomUUID();
    const job = await service.create('cast-test', request, photos, 'success');
    const row = await service.owned('cast-test', job.id);
    const keys = JSON.parse(row.photos) as string[];
    assert.equal(keys.length, 2);
    const expected = completeDanceCast(photos);
    for (let i = 0; i < 2; i++)
      assert.deepEqual(
        await readPrivate(keys[i]),
        await normalizePhoto(expected[i])
      );
    assert.equal(
      (await service.create('cast-test', request, photos, 'success')).id,
      job.id
    );
    await service.erase('cast-test', job.id);
    for (const key of keys) await assert.rejects(readPrivate(key));
    assert.equal(completeDanceCast(photos).length, 2);
  }
  await assert.rejects(
    service.create('cast-test', crypto.randomUUID(), [null, null], 'success'),
    /two/
  );
});

test('real worker transport faults reconcile existing IDs; failure and private result persistence do not resubmit', async () => {
  const originalFetch = globalThis.fetch;
  let submissions = 0;
  try {
    for (const outcome of ['timeout', 'download-fault', 'fail', 'success']) {
      const created = await service.create(
        'bob',
        crypto.randomUUID(),
        [image, image],
        'success'
      );
      await sql.execute({
        sql: "UPDATE dance_job SET generation_mode='kie', status='generating', provider_id=?, next_run_at=0 WHERE id=?",
        args: [`fixture-${outcome}`, created.id],
      });
      globalThis.fetch = (async (
        url: string | URL | Request,
        options?: RequestInit
      ) => {
        if (options?.method === 'POST') {
          submissions++;
          throw new Error('No submission allowed');
        }
        if (String(url).includes('recordInfo')) {
          if (outcome === 'timeout')
            throw new Error('Injected provider timeout');
          return Response.json({
            code: 200,
            data: {
              state: outcome === 'download-fault' ? 'success' : outcome,
              resultJson: JSON.stringify({
                resultUrls: ['https://tempfile.aiquickdraw.com/test.mp4'],
              }),
              creditsConsumed: 160,
            },
          });
        }
        if (outcome === 'download-fault')
          throw new Error('Injected download timeout');
        return new Response(
          Buffer.from('\0\0\0\x18ftypisomFAKE-UNIT-TEST-MEDIA')
        );
      }) as typeof fetch;
      await service.tick('unit-test-key');
      const job = await service.owned('bob', created.id);
      assert.equal(
        job.status,
        outcome === 'timeout' || outcome === 'download-fault'
          ? 'reconciling'
          : outcome === 'fail'
            ? 'failed'
            : 'succeeded'
      );
      if (outcome === 'timeout')
        assert.equal(job.errorCode, 'PROVIDER_STATUS_PENDING');
      if (outcome === 'download-fault')
        assert.equal(job.errorCode, 'PROVIDER_RESULT_DOWNLOAD_PENDING');
      assert.equal(job.providerId, `fixture-${outcome}`);
      if (outcome === 'success') {
        assert.ok(job.resultKey);
        assert.equal(service.visible(job).simulation, false);
        assert.equal('resultKey' in service.visible(job), false);
        assert.ok((await readPrivate(job.resultKey!)).length);
      }
      await service.erase('bob', created.id);
      if (job.resultKey) await assert.rejects(readPrivate(job.resultKey));
    }
    assert.equal(submissions, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
async function due(id: string) {
  await sql.execute({
    sql: 'UPDATE dance_job SET next_run_at = 0 WHERE id = ?',
    args: [id],
  });
}

test('invalid, disguised, tiny and oversized images are rejected; valid images decode', async () => {
  await assert.rejects(normalizePhoto(Buffer.from('<svg>not a photo</svg>')));
  await assert.rejects(normalizePhoto(Buffer.alloc(8 * 1024 * 1024 + 1)));
  const tiny = await sharp({
    create: { width: 10, height: 10, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer();
  await assert.rejects(normalizePhoto(tiny));
  const result = await sharp(await normalizePhoto(image)).metadata();
  assert.equal(result.format, 'jpeg');
  assert.equal(result.exif, undefined);
});
test('unpaid jobs never run; duplicate order/payment is idempotent; ownership enforced', async () => {
  const key = crypto.randomUUID();
  const [a, b] = await Promise.all([
    service.create('alice', key, [image, image], 'success', '720P'),
    service.create('alice', key, [image, image], 'success', '720P'),
  ]);
  assert.equal(a.id, b.id);
  assert.equal((await service.owned('alice', a.id)).resolution, '720P');
  await due(a.id);
  await service.tick();
  assert.equal((await service.owned('alice', a.id)).status, 'unpaid');
  await assert.rejects(service.owned('bob', a.id));
  assert.equal(await service.acceptPayment(a.id, 'wrong', 'mock', 1), false);
  const payments = await Promise.all([
    service.payMock('alice', a.id),
    service.payMock('alice', a.id),
  ]);
  assert.ok(payments.every((p) => p.status === 'queued'));
  await due(a.id);
  await Promise.all([service.tick(), service.tick()]);
  const first = await service.owned('alice', a.id);
  assert.equal(first.status, 'generating');
  await due(a.id);
  await service.tick();
  const final = await service.owned('alice', a.id);
  assert.equal(final.status, 'succeeded');
  assert.equal(final.providerId, first.providerId);
  // Refresh obtains the same durable database record, not browser state.
  assert.equal(
    (await service.list('alice')).find((j) => j.id === a.id)?.status,
    'succeeded'
  );
  await service.erase('alice', a.id);
});
test('timeout reconciles the original task without a second provider ID; failure routes to review', async () => {
  for (const scenario of ['timeout', 'failure']) {
    const job = await service.create(
      'alice',
      crypto.randomUUID(),
      [image, image],
      scenario
    );
    await service.payMock('alice', job.id);
    await due(job.id);
    await service.tick();
    const original = await service.owned('alice', job.id);
    await due(job.id);
    await service.tick();
    assert.equal(
      (await service.owned('alice', job.id)).status,
      scenario === 'timeout' ? 'reconciling' : 'failed'
    );
    if (scenario === 'timeout') {
      await due(job.id);
      await service.tick();
      assert.equal((await service.owned('alice', job.id)).status, 'succeeded');
    }
    assert.equal(
      (await service.owned('alice', job.id)).providerId,
      original.providerId
    );
    await service.requestSupport('alice', job.id);
    assert.equal((await service.owned('alice', job.id)).supportRequested, 1);
    await service.erase('alice', job.id);
  }
});
test('deletion revokes and removes photos; expiry worker cleans expired uploads', async () => {
  const job = await service.create(
    'alice',
    crypto.randomUUID(),
    [image, image],
    'success'
  );
  const keys = JSON.parse((await service.owned('alice', job.id)).photos);
  await sql.execute({
    sql: 'UPDATE dance_job SET expires_at = 0 WHERE id = ?',
    args: [job.id],
  });
  await service.tick();
  assert.equal((await service.owned('alice', job.id)).status, 'deleted');
  await assert.rejects(readPrivate(keys[0]));
});
test('production guard blocks mock actions even with sandbox env enabled', () => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  assert.throws(service.requireSandbox);
  process.env.NODE_ENV = old;
});
test('Kie request retains separate references and enables model-generated audio; transport fixture verifies task contract', async () => {
  const images = [
    'https://assets.example/a.jpg',
    'https://assets.example/b.jpg',
  ];
  const reference = {
    url: 'https://assets.example/reference.mp4',
    durationSeconds: 14.92,
  };
  const payload = dancePayload(images, reference);
  for (const resolution of ['480P', '720P', '1080P'] as const)
    assert.equal(
      dancePayload(images, reference, resolution).input.resolution,
      resolution
    );
  assert.throws(() => dancePayload(images, reference, '4K' as never));
  assert.equal(payload.model, 'wan/3-0-video');
  assert.equal(payload.input.duration, 14);
  assert.equal(payload.input.resolution, '720P');
  assert.equal('generate_audio' in payload.input, false);
  assert.throws(() => dancePayload(images, undefined as never));
  assert.deepEqual(payload.input.reference_video_urls, [reference.url]);
  assert.equal(
    dancePayload(images, { ...reference, durationSeconds: 15 }).input.duration,
    14
  );
  for (const durationSeconds of [0, 15.01, 20, NaN, Infinity])
    assert.throws(() =>
      dancePayload(images, {
        url: 'https://assets.example/reference.mp4',
        durationSeconds,
      })
    );
  assert.deepEqual(payload.input.reference_image_urls, images);
  assert.equal(payload.input.audio, true);
  assert.throws(() =>
    dancePayload(images.slice(0, 1), {
      url: 'https://assets.example/reference.mp4',
      durationSeconds: 10,
    })
  );
  let calls = 0;
  const fake: typeof fetch = async (_url, init) => {
    if (init?.method === 'POST') {
      const sent = JSON.parse(String(init.body));
      assert.equal(sent.model, 'wan/3-0-video');
      assert.equal(sent.input.audio, true);
      assert.equal(sent.input.duration, 14);
      assert.deepEqual(sent.input.reference_video_urls, [
        'https://assets.example/reference.mp4',
      ]);
    }
    calls++;
    return Response.json({
      code: 200,
      data:
        calls === 1
          ? { taskId: 'verified-fixture-id' }
          : {
              state: 'success',
              resultJson:
                '{"resultUrls":["https://assets.example/output.mp4"]}',
              creditsConsumed: 1368,
            },
    });
  };
  const client = new KieDanceClient('not-a-real-key', fake);
  assert.equal(
    await client.submit(images, {
      url: 'https://assets.example/reference.mp4',
      durationSeconds: 10,
    }),
    'verified-fixture-id'
  );
  assert.equal(
    (await client.status('verified-fixture-id')).creditsConsumed,
    1368
  );
  let failedCalls = 0;
  const timeoutClient = new KieDanceClient('not-a-real-key', async () => {
    failedCalls++;
    throw new Error('Timeout');
  });
  await assert.rejects(
    timeoutClient.submit(images, {
      url: 'https://assets.example/reference.mp4',
      durationSeconds: 10,
    })
  );
  assert.equal(failedCalls, 1);
});
test('signed duplicate payment webhook only queues once; invalid signature, unpaid and live events fail', async () => {
  process.env.DANCE_PAYMENT_MODE = 'stripe-test';
  const job = await service.create(
    'alice',
    crypto.randomUUID(),
    [image, image],
    'success'
  );
  process.env.DANCE_PAYMENT_MODE = 'stripe-test';
  const stripe = new Stripe('sk_test_test_fixture_only');
  const secret = 'whsec_LOCAL_TEST_FIXTURE_ONLY';
  const event = {
    id: 'evt_local',
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_test_local',
        mode: 'payment',
        livemode: false,
        payment_status: 'paid',
        currency: 'usd',
        amount_total: 1290,
        metadata: { danceJobId: job.id, userId: 'alice' },
      },
    },
  };
  const signed = (e: unknown) => {
    const payload = JSON.stringify(e);
    return {
      payload,
      header: stripe.webhooks.generateTestHeaderString({ payload, secret }),
    };
  };
  const s = signed(event);
  await assert.rejects(() => verifyDanceEvent(s.payload, 'bad', secret));
  for (const invalid of [
    { ...event, livemode: true },
    {
      ...event,
      data: { object: { ...event.data.object, payment_status: 'unpaid' } },
    },
  ]) {
    const i = signed(invalid);
    await assert.rejects(() => verifyDanceEvent(i.payload, i.header, secret));
  }
  const checkout = (await verifyDanceEvent(s.payload, s.header, secret))!;
  assert.equal(
    await service.acceptPayment(
      job.id,
      checkout.id,
      'stripe-test',
      checkout.amount_total!
    ),
    true
  );
  assert.equal(
    await service.acceptPayment(
      job.id,
      checkout.id,
      'stripe-test',
      checkout.amount_total!
    ),
    false
  );
  await service.erase('alice', job.id);
});

test('default Kie transport does not bind native fetch to the client', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function (this: typeof globalThis | undefined) {
    assert.ok(
      this === undefined || this === globalThis,
      'native fetch receiver'
    );
    return Response.json({ code: 200, data: 200 });
  } as typeof fetch;
  try {
    assert.equal(await new KieDanceClient('test-key').balance(), 200);
  } finally {
    globalThis.fetch = original;
  }
});

test('result download rejects redirects without following private destinations', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.equal(init?.redirect, 'manual');
    return new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/private' },
    });
  };
  try {
    await assert.rejects(
      () => downloadDanceResult('https://tempfile.aiquickdraw.com/video.mp4'),
      /Result download failed/
    );
    assert.equal(calls, 1);
    await assert.rejects(
      () => downloadDanceResult('https://untrusted.example/video.mp4'),
      /Unapproved result host/
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
