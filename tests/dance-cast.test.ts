import assert from 'node:assert/strict';
import { test } from 'node:test';

import { completeDanceCast } from '../src/core/storage/dance-default-cast';
import { castPreview, dancePhotosSchema } from '../src/lib/dance-cast';

const a = 'data:image/jpeg;base64,YQ==';
const b = 'data:image/png;base64,Yg==';
test('duo roles preserve upload order and accept a swapped cast', () => {
  for (const photos of [
    [a, b],
    [b, a],
  ])
    assert.deepEqual(dancePhotosSchema.parse(photos), photos);
  const bytes = [Buffer.from('a'), Buffer.from('b')];
  assert.deepEqual(completeDanceCast(bytes), bytes);
  assert.deepEqual(completeDanceCast([...bytes].reverse()), [
    bytes[1],
    bytes[0],
  ]);
  assert.deepEqual(castPreview([null, b]), [null, b]);
});
test('both roles required; legacy three-role, remote and malformed uploads rejected', () => {
  for (const photos of [
    [],
    [a],
    [null, b],
    [a, null],
    [null, null],
    [a, b, a],
    ['https://evil.invalid/photo', b],
    ['data:image/svg+xml;base64,YQ==', b],
    ['', b],
  ])
    assert.equal(dancePhotosSchema.safeParse(photos).success, false);
  assert.throws(() => completeDanceCast([Buffer.from('a'), null]), /two/);
  assert.throws(
    () => completeDanceCast([Buffer.from('a'), Buffer.alloc(0)]),
    /Empty/
  );
});
