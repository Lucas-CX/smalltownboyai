import assert from 'node:assert/strict';
import test from 'node:test';

import { streamCloudDanceVideo } from '../src/core/cloudflare/dance-video';
import { videoByteRange } from '../src/lib/video-byte-range';

test('MP4 range reads support tails, seeking, clamps, and unsatisfiable ranges', () => {
  for (const [input, expected] of [
    ['bytes=-4', { start: 6, end: 9 }],
    ['bytes=-40', { start: 0, end: 9 }],
    ['bytes=2-', { start: 2, end: 9 }],
    ['bytes=2-5', { start: 2, end: 5 }],
    ['bytes=2-99', { start: 2, end: 9 }],
    ['bytes=10-', null],
    ['bytes=-0', null],
    ['bytes=8-2', undefined],
    ['bytes=0-1,4-5', undefined],
    ['bytes=99999999999999999999-', undefined],
  ] as const)
    assert.deepEqual(videoByteRange(input, 10), expected);
  assert.equal(videoByteRange('bytes=-2', 0), null);
});

test('R2 returns exact partial bytes and headers, without reading invalid ranges', async () => {
  const env = globalThis as typeof globalThis & { __CF_ENV__?: unknown };
  const previous = env.__CF_ENV__;
  const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  let reads = 0;
  env.__CF_ENV__ = {
    DANCE_FILES: {
      head: async () => ({ size: data.length }),
      get: async (
        _: string,
        options?: { range: { offset: number; length: number } }
      ) => {
        reads++;
        const range = options?.range;
        return {
          body: range
            ? data.slice(range.offset, range.offset + range.length)
            : data,
        };
      },
    },
  };
  try {
    const request = (range: string) =>
      streamCloudDanceVideo(
        crypto.randomUUID(),
        new Request('https://example.test/api/dance/file', {
          headers: { Range: range },
        })
      );
    const tail = await request('bytes=-4');
    assert.equal(tail.status, 206);
    assert.equal(tail.headers.get('content-range'), 'bytes 6-9/10');
    assert.equal(tail.headers.get('content-length'), '4');
    assert.deepEqual(new Uint8Array(await tail.arrayBuffer()), data.slice(6));
    assert.equal((await request('bytes=10-')).status, 416);
    assert.equal(reads, 1);
    assert.equal((await request('bytes=0-1,4-5')).status, 200);
  } finally {
    env.__CF_ENV__ = previous;
  }
});
