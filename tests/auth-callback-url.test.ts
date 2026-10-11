import assert from 'node:assert/strict';
import { test } from 'node:test';

import { authCallbackUrl, authRetryUrl } from '../src/lib/auth-callback-url';

test('auth callbacks preserve draft resumption and locale anchors', () => {
  assert.equal(
    authCallbackUrl('/?resume=1#studio', 'https://example.com'),
    'https://example.com/?resume=1#studio'
  );
  assert.equal(
    authCallbackUrl('/zh/#studio', 'https://example.com'),
    'https://example.com/zh/#studio'
  );
});

test('OAuth failure returns to localized sign-in with the original draft target', () => {
  const url = new URL(
    authRetryUrl('/it/?resume=1#studio', '/it/sign-in', 'https://example.com')
  );
  assert.equal(url.pathname, '/it/sign-in');
  assert.equal(url.searchParams.get('callbackUrl'), '/it/?resume=1#studio');
  assert.equal(url.searchParams.get('authError'), '1');
  assert.throws(() =>
    authRetryUrl('/', 'https://evil.example/sign-in', 'https://example.com')
  );
});
test('auth callbacks reject off-site and executable destinations', () => {
  for (const path of [
    '//evil.example',
    'https://evil.example/',
    'javascript:alert(1)',
    '/\\evil.example',
  ]) {
    assert.throws(() => authCallbackUrl(path, 'https://example.com'));
  }
});
