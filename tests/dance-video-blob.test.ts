import assert from 'node:assert/strict';
import test from 'node:test';

import { loadPrivateVideoBlob } from '../src/lib/dance-video-blob';

test('private fallback keeps credentials and rejects foreign URLs, login responses and oversized media', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'https://example.test' } },
  });
  const signal = new AbortController().signal;
  try {
    globalThis.fetch = async (_, init) => {
      assert.equal(init?.credentials, 'same-origin');
      assert.equal(init?.signal, signal);
      return new Response(new Uint8Array([1, 2]), {
        headers: { 'Content-Type': 'video/mp4' },
      });
    };
    const blob = await loadPrivateVideoBlob(
      '/api/dance/file?id=test&slot=video',
      signal
    );
    assert.equal(blob.size, 2);
    assert.equal(blob.type, 'video/mp4');
    await assert.rejects(
      loadPrivateVideoBlob('https://other.test/api/dance/file', signal)
    );
    globalThis.fetch = async () =>
      new Response('<html>Sign in</html>', {
        headers: { 'Content-Type': 'text/html' },
      });
    await assert.rejects(loadPrivateVideoBlob('/api/dance/file', signal));
    globalThis.fetch = async () =>
      new Response('x', {
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': '200000000' },
      });
    await assert.rejects(loadPrivateVideoBlob('/api/dance/file', signal));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow)
      Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
