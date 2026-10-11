import assert from 'node:assert/strict';
import test from 'node:test';

import { previewResponse } from '../src/lib/preview-response';

test('display mode serves anonymous config without auth or database access', async () => {
  const request = (path: string) => new Request('https://example.test' + path);
  assert.equal(
    await previewResponse(request('/api/auth/get-session'), true)!.json(),
    null
  );
  const config = await previewResponse(
    request('/api/config/public'),
    true
  )!.json();
  assert.equal(config.data.email_auth_enabled, 'false');
  for (const path of ['/', '/zh', '/pricing', '/zh/contact'])
    assert.equal(previewResponse(request(path), true), null);
  assert.equal(previewResponse(request('/api/dance/'), false), null);
});

test('display mode refuses writes and account routes in both locales', () => {
  for (const prefix of ['', '/zh']) {
    for (const path of [
      '/api/auth/sign-up/email',
      '/api/dance/',
      '/api/dance/credits',
    ]) {
      const response = previewResponse(
        new Request('https://example.test' + prefix + path, {
          method: 'POST',
          body: '{}',
        }),
        true
      )!;
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    for (const path of ['/sign-in', '/admin', '/settings/billing']) {
      const response = previewResponse(
        new Request('https://example.test' + prefix + path),
        true
      )!;
      assert.equal(response.status, 302);
      assert.equal(
        response.headers.get('location'),
        'https://example.test' + (prefix || '/')
      );
    }
  }
});
