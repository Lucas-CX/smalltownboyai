import assert from 'node:assert/strict';
import test from 'node:test';

import { authContinuationQuery, safeInternalPath } from '../src/lib/redirect';

test('password recovery retains studio intent without leaking reset secrets or unsafe targets', () => {
  const query = authContinuationQuery(
    '?callbackUrl=%2Fit%2F%3Fresume%3D1%23studio&token=secret&email=private'
  );
  assert.equal(
    new URLSearchParams(query).get('callbackUrl'),
    '/it/?resume=1#studio'
  );
  assert.equal(query.includes('secret'), false);
  assert.equal(query.includes('private'), false);
  assert.equal(
    authContinuationQuery(
      '?callbackUrl=https://evil.example&redirect=javascript:alert(1)'
    ),
    ''
  );
  assert.equal(authContinuationQuery('?callbackUrl=/reset-password'), '');
});

test('return paths retain raw resume parameters and reject external/auth destinations', () => {
  assert.equal(safeInternalPath('/?resume=1#studio'), '/?resume=1#studio');
  assert.equal(
    safeInternalPath('/it/?resume=1#studio'),
    '/it/?resume=1#studio'
  );
  for (const path of [
    '/\\evil.example',
    '//evil.example',
    'https://evil.example/',
    'javascript:alert(1)',
    '/sign-in',
    '/it/sign-up',
    '/zh/verify-email',
  ]) {
    assert.equal(safeInternalPath(path), null, path);
  }
});
