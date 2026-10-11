import assert from 'node:assert/strict';
import test from 'node:test';

import { browserUuid } from '../src/lib/browser-uuid';

test('LAN HTTP fallback produces distinct RFC 4122 version 4 IDs', () => {
  const source = {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
  };
  const ids = Array.from({ length: 100 }, () => browserUuid(source));
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  assert.equal(new Set(ids).size, 100);
});
test('secure-context native UUID is retained', () => {
  const id = '12345678-1234-4123-8123-123456789abc';
  assert.equal(
    browserUuid({
      randomUUID: () => id,
      getRandomValues: () => {
        throw new Error('unexpected fallback');
      },
    }),
    id
  );
});
