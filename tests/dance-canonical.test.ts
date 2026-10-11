import assert from 'node:assert/strict';
import test from 'node:test';

import { danceCanonicalTarget } from '../src/lib/dance-canonical';

const origin = 'https://example.com';
test('normalizes public production hosts without dropping locale or attribution', () => {
  assert.equal(
    danceCanonicalTarget(
      new URL('http://example.com/zh/about/?utm_source=test'),
      'GET',
      origin
    ),
    origin + '/zh/about?utm_source=test'
  );
  assert.equal(
    danceCanonicalTarget(new URL(origin + '/pricing/'), 'HEAD', origin),
    origin + '/pricing'
  );
  assert.equal(
    danceCanonicalTarget(new URL('https://www.example.com/'), 'GET', origin),
    origin + '/'
  );
  assert.equal(
    danceCanonicalTarget(
      new URL('https://unrelated.workers.dev/zh'),
      'GET',
      origin
    ),
    null
  );
});
test('does not redirect APIs, mutations, local hosts or already canonical pages', () => {
  for (const url of [
    'http://example.com/api/payment/callback',
    'http://example.com/api',
    'http://localhost:3100/pricing/',
    origin + '/zh/about',
    'https://example.com.attacker.example/',
  ])
    assert.equal(danceCanonicalTarget(new URL(url), 'GET', origin), null);
  assert.equal(
    danceCanonicalTarget(new URL('http://example.com/pricing'), 'POST', origin),
    null
  );
});
