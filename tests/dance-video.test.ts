import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { cloudDanceVideoExists } from '../src/core/cloudflare/dance-video';
import { privateVideoExists } from '../src/core/storage/dance-private.workers';
import {
  funnelBatchSchema,
  funnelParamsSchema,
} from '../src/lib/dance-funnel-contract';
import { danceTrendPreview } from '../src/lib/dance-media';
import {
  readDanceVideoState,
  videoFailureFromState,
  videoMediaFailure,
} from '../src/lib/dance-video-state';

test('studio sample has a bounded payload and a front-loaded MP4 index', () => {
  const bytes = readFileSync(
    new URL('../public' + danceTrendPreview.src, import.meta.url)
  );
  assert.ok(bytes.length < 3_000_000, 'mobile preview should stay under 3 MB');
  const atoms: string[] = [];
  for (let offset = 0; offset < bytes.length; ) {
    const size = bytes.readUInt32BE(offset);
    assert.ok(size >= 8 && offset + size <= bytes.length);
    atoms.push(bytes.toString('ascii', offset + 4, offset + 8));
    offset += size;
  }
  assert.ok(atoms.includes('moov') && atoms.includes('mdat'));
  assert.ok(atoms.indexOf('moov') < atoms.indexOf('mdat'));
});

test('media and private-file failures are classified without forwarding browser messages or URLs', () => {
  for (const [code, reason] of [
    [1, 'video_aborted'],
    [2, 'video_network'],
    [3, 'video_decode'],
    [4, 'video_unsupported'],
    [0, 'video_unknown'],
  ] as const) {
    assert.equal(videoMediaFailure(code), reason);
    assert.equal(videoFailureFromState(reason, 'ready'), reason);
    assert.equal(
      funnelParamsSchema.safeParse({ stage: 'result', reason }).success,
      true
    );
  }
  assert.equal(videoMediaFailure(4, false), 'video_network');
  for (const state of [
    'video_expired',
    'video_missing',
    'authentication_required',
    'video_unavailable',
  ] as const)
    assert.equal(videoFailureFromState('video_unsupported', state), state);
  const clean = funnelParamsSchema.parse({
    reason: 'video_network',
    url: 'private.mp4',
    message: 'secret',
    job_id: 'private-id',
  });
  assert.deepEqual(clean, { reason: 'video_network' });
  for (const event of ['dance_video_retry', 'dance_video_recovered'])
    assert.equal(
      funnelBatchSchema.safeParse({
        flowId: crypto.randomUUID(),
        events: [
          { id: crypto.randomUUID(), event, params: { stage: 'result' } },
        ],
      }).success,
      true
    );
});

test('diagnostic requests use the authenticated API, never fetch the media body, and handle bad responses', async () => {
  const original = globalThis.fetch;
  try {
    for (const state of [
      'ready',
      'video_expired',
      'authentication_required',
    ] as const) {
      globalThis.fetch = async (url) => {
        assert.equal(
          String(url),
          '/api/dance/file?id=job%20id&slot=video&status=1'
        );
        return Response.json({ code: 0, data: { state } });
      };
      assert.equal(await readDanceVideoState('job id'), state);
    }
    globalThis.fetch = async () =>
      Response.json({
        code: 0,
        data: { state: 'https://private.example/video' },
      });
    assert.equal(await readDanceVideoState('id'), 'video_unavailable');
    globalThis.fetch = async () => {
      throw new Error('private network details');
    };
    assert.equal(await readDanceVideoState('id'), 'video_network');
  } finally {
    globalThis.fetch = original;
  }
});

test('cloud video health uses metadata only and distinguishes absence from a storage outage', async () => {
  const state = globalThis as typeof globalThis & { __CF_ENV__?: unknown };
  const original = state.__CF_ENV__;
  let reads = 0;
  try {
    state.__CF_ENV__ = {
      DANCE_FILES: {
        head: async () => {
          reads++;
          return { size: 10 };
        },
        get: () => {
          throw new Error('must not download');
        },
      },
    };
    assert.equal(await cloudDanceVideoExists('../private'), false);
    assert.equal(reads, 0);
    assert.equal(await cloudDanceVideoExists(crypto.randomUUID()), true);
    state.__CF_ENV__ = { DANCE_FILES: { head: async () => null } };
    assert.equal(await cloudDanceVideoExists(crypto.randomUUID()), false);
    state.__CF_ENV__ = {
      DANCE_FILES: {
        head: async () => {
          throw new Error('outage');
        },
      },
    };
    await assert.rejects(cloudDanceVideoExists(crypto.randomUUID()));
  } finally {
    state.__CF_ENV__ = original;
  }
});

test('Workers private-file adapter checks real and simulation metadata without downloading', async () => {
  const state = globalThis as typeof globalThis & { __CF_ENV__?: unknown };
  const original = state.__CF_ENV__;
  const keys: string[] = [];
  try {
    state.__CF_ENV__ = {
      DANCE_FILES: {
        head: async (key: string) => {
          keys.push(key);
          return { size: 10 };
        },
      },
    };
    const id = crypto.randomUUID();
    assert.equal(await privateVideoExists(id), true);
    assert.equal(await privateVideoExists('', true), true);
    assert.deepEqual(keys, [`private/${id}`, 'fixtures/simulation.mp4']);
    await assert.rejects(privateVideoExists('../private'));
    assert.equal(keys.length, 2);
    state.__CF_ENV__ = { DANCE_FILES: { head: async () => null } };
    assert.equal(await privateVideoExists(id), false);
    state.__CF_ENV__ = { DANCE_FILES: { head: async () => ({ size: 0 }) } };
    assert.equal(await privateVideoExists(id), false);
    state.__CF_ENV__ = {
      DANCE_FILES: {
        head: async () => {
          throw new Error('outage');
        },
      },
    };
    await assert.rejects(privateVideoExists(id));
  } finally {
    state.__CF_ENV__ = original;
  }
});
