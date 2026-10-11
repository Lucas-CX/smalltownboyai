import assert from 'node:assert/strict';
import test from 'node:test';

import { downloadDanceResultStream } from '../src/core/ai/dance-result';
import { savePrivateStream } from '../src/core/storage/dance-private.workers';

test('67.6MB provider result streams into private storage without joining buffers', async () => {
  const oldFetch = globalThis.fetch;
  const runtime = globalThis as any;
  const oldEnv = runtime.__CF_ENV__;
  const oldFixed = runtime.FixedLengthStream;
  let stored = 0,
    largestChunk = 0;
  const length = 67_642_105;
  try {
    runtime.FixedLengthStream = class extends TransformStream {
      constructor(_length: number) {
        super();
      }
    };
    runtime.__CF_ENV__ = {
      DANCE_FILES: {
        async put(key: string, body: ReadableStream<Uint8Array>) {
          assert.match(key, /^private\/[a-f0-9-]{36}$/);
          const reader = body.getReader();
          while (true) {
            const item = await reader.read();
            if (item.done) break;
            stored += item.value.length;
            largestChunk = Math.max(largestChunk, item.value.length);
          }
        },
        async delete() {},
      },
    };
    let remaining = length;
    const chunk = new Uint8Array(1024 * 1024);
    chunk.set(new TextEncoder().encode('ftyp'), 4);
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            if (!remaining) {
              controller.close();
              return;
            }
            const n = Math.min(remaining, chunk.length);
            remaining -= n;
            controller.enqueue(chunk.subarray(0, n));
          },
        }),
        { headers: { 'content-length': String(length) } }
      )) as typeof fetch;
    const result = await downloadDanceResultStream(
      'https://tempfile.aiquickdraw.com/test.mp4'
    );
    await savePrivateStream(result.body, result.byteLength);
    assert.equal(stored, length);
    assert.equal(largestChunk, 1024 * 1024);
  } finally {
    globalThis.fetch = oldFetch;
    runtime.__CF_ENV__ = oldEnv;
    runtime.FixedLengthStream = oldFixed;
  }
});

test('stream rejects truncated MP4s, oversized payloads, redirects and unapproved hosts', async () => {
  const oldFetch = globalThis.fetch;
  try {
    const header = new Uint8Array(8);
    header.set(new TextEncoder().encode('ftyp'), 4);
    globalThis.fetch = (async () =>
      new Response(header, {
        headers: { 'content-length': '20' },
      })) as typeof fetch;
    const short = await downloadDanceResultStream(
      'https://tempfile.aiquickdraw.com/test.mp4'
    );
    await assert.rejects(
      () => new Response(short.body).arrayBuffer(),
      /Truncated/
    );
    globalThis.fetch = (async () =>
      new Response(header, {
        headers: { 'content-length': String(257 * 1024 * 1024) },
      })) as typeof fetch;
    await assert.rejects(
      () =>
        downloadDanceResultStream('https://tempfile.aiquickdraw.com/test.mp4'),
      /size/
    );
    globalThis.fetch = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private' },
      })) as typeof fetch;
    await assert.rejects(
      () =>
        downloadDanceResultStream('https://tempfile.aiquickdraw.com/test.mp4'),
      /download/
    );
    await assert.rejects(
      () => downloadDanceResultStream('http://127.0.0.1/private'),
      /host/
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});
