import assert from 'node:assert/strict';
import test from 'node:test';

import { submitRealDance } from '../src/core/ai/dance-acceptance.workers';
import { KieDanceClient } from '../src/core/ai/dance-kie';
import { verifyDanceReference } from '../src/core/ai/dance-reference';
import {
  deletePrivate,
  readDanceReference,
  savePrivate,
} from '../src/core/storage/dance-private';
import { readDanceReference as readWorkerReference } from '../src/core/storage/dance-private.workers';
import { danceTemplate } from '../src/lib/dance-template';

test('the checked-in reference matches its inspected manifest on Node and Workers', async () => {
  const bytes = await readDanceReference();
  await verifyDanceReference(bytes);
  const previous = (globalThis as any).__CF_ENV__;
  try {
    (globalThis as any).__CF_ENV__ = {
      ASSETS: {
        async fetch(request: Request) {
          assert.equal(new URL(request.url).pathname, danceTemplate.path);
          return new Response(bytes);
        },
      },
    };
    await verifyDanceReference(await readWorkerReference());
    (globalThis as any).__CF_ENV__ = {
      ASSETS: { fetch: async () => new Response('Missing', { status: 404 }) },
    };
    await assert.rejects(readWorkerReference(), /unavailable/);
  } finally {
    (globalThis as any).__CF_ENV__ = previous;
  }
});

test('reference corruption and upload redirects fail before generation', async () => {
  const bytes = await readDanceReference();
  const corrupt = Buffer.from(bytes);
  corrupt[corrupt.length - 1] ^= 1;
  let calls = 0;
  const client = new KieDanceClient('fixture', async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: 'https://untrusted.example/upload' },
    });
  });
  await assert.rejects(
    client.uploadReference(bytes.subarray(0, 100)),
    /size mismatch/
  );
  await assert.rejects(client.uploadReference(corrupt), /checksum mismatch/);
  assert.equal(calls, 0);
  await assert.rejects(client.uploadReference(bytes), /upload failed/);
  assert.equal(calls, 1);
});

test('paid Workers submission sends two ordered photos and a fresh video reference in one 14-second task', async () => {
  const previousFetch = globalThis.fetch;
  const previousBindings = (globalThis as any).__CF_ENV__;
  const envKeys = [
    'AUTH_SECRET',
    'VITE_APP_URL',
    'DATABASE_PROVIDER',
    'DANCE_CLOUD_ENABLED',
    'DANCE_PAYMENT_MODE',
    'DANCE_GENERATION_MODE',
  ];
  const previousEnv = envKeys.map((key) => process.env[key]);
  const photos: string[] = [];
  const uploads: string[] = [];
  let taskCalls = 0;
  try {
    process.env.AUTH_SECRET = 'local-callback-fixture-secret-not-production';
    process.env.VITE_APP_URL = 'https://example.test';
    process.env.DATABASE_PROVIDER = 'd1';
    process.env.DANCE_CLOUD_ENABLED = 'true';
    process.env.DANCE_PAYMENT_MODE = 'stripe-live';
    process.env.DANCE_GENERATION_MODE = 'kie';
    (globalThis as any).__CF_ENV__ = {
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => ({ id: 'fixture', name: 'fixture' }),
            run: async () => ({ success: true }),
          }),
        }),
      },
    };
    for (let i = 0; i < 2; i++)
      photos.push(await savePrivate(Buffer.from(`ordered-photo-${i}`)));
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('chat/credit'))
        return Response.json({ code: 200, data: 1000 });
      if (url.endsWith('file-stream-upload')) {
        assert.equal(init?.redirect, 'manual');
        const file = (init!.body as FormData).get('file') as File;
        const bytes = Buffer.from(await file.arrayBuffer());
        if (uploads.length < 2)
          assert.equal(bytes.toString(), `ordered-photo-${uploads.length}`);
        else {
          assert.equal(file.type, 'video/mp4');
          await verifyDanceReference(bytes);
        }
        const result = `https://tempfile.redpandaai.co/fixture/${uploads.length}`;
        uploads.push(result);
        return Response.json({ code: 200, data: { downloadUrl: result } });
      }
      assert.ok(url.endsWith('jobs/createTask'));
      taskCalls++;
      const payload = JSON.parse(String(init?.body));
      assert.deepEqual(payload.input.reference_image_urls, uploads.slice(0, 2));
      assert.deepEqual(payload.input.reference_video_urls, [uploads[2]]);
      const callback = new URL(payload.callBackUrl);
      assert.equal(callback.origin, 'https://example.test');
      assert.equal(callback.pathname, '/api/dance/kie-callback');
      assert.equal(
        callback.searchParams.get('job'),
        '00000000-0000-4000-8000-000000000001'
      );
      assert.match(callback.searchParams.get('token')!, /^[a-f0-9]{64}$/);
      assert.equal(payload.input.duration, 14);
      assert.equal(payload.input.resolution, '720P');
      assert.equal(payload.input.audio, true);
      assert.match(payload.input.prompt, /species/);
      assert.match(payload.input.prompt, /Do not compose a new tune/);
      return Response.json({ code: 200, data: { taskId: 'fixture-task' } });
    };
    assert.equal(
      await submitRealDance(
        {
          id: '00000000-0000-4000-8000-000000000001',
          userId: 'fixture-user',
          resolution: '720P',
          photos: JSON.stringify(photos),
        },
        'fixture-key'
      ),
      'fixture-task'
    );
    assert.equal(taskCalls, 1);
    assert.equal(uploads.length, 3);
  } finally {
    globalThis.fetch = previousFetch;
    (globalThis as any).__CF_ENV__ = previousBindings;
    envKeys.forEach((key, i) => {
      if (previousEnv[i] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[i];
    });
    await Promise.all(photos.map(deletePrivate));
  }
});
