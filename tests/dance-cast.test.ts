import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { completeDanceCast } from '../src/core/storage/dance-default-cast';
import assets from '../src/core/storage/dance-default-cast.json';
import {
  castPreview,
  dancePhotosSchema,
  defaultDanceCast,
  resolveDanceCast,
} from '../src/lib/dance-cast';

test('all seven custom role combinations preserve indices and the displayed default identity', () => {
  for (let mask = 1; mask < 8; mask++) {
    const photos = [0, 1, 2].map((i) =>
      mask & (1 << i)
        ? `data:image/jpeg;base64,${Buffer.from(`custom-${i}`).toString('base64')}`
        : null
    );
    assert.deepEqual(dancePhotosSchema.parse(photos), photos);
    assert.deepEqual(
      castPreview(photos),
      photos.map((p, i) => p ?? defaultDanceCast[i])
    );
    const bytes = photos.map((p, i) => (p ? Buffer.from(`custom-${i}`) : null));
    const complete = completeDanceCast(bytes);
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(
        complete[i],
        bytes[i] ?? readFileSync(`public${defaultDanceCast[i]}`)
      );
    }
  }
  assert.deepEqual(castPreview([null, null, null]), [
    null,
    defaultDanceCast[1],
    defaultDanceCast[2],
  ]);
});
test('empty, malformed or URL-based uploads are rejected; defaults cannot come from client URLs', () => {
  for (const photos of [
    [null, null, null],
    [],
    ['https://evil.invalid/photo', null, null],
    ['data:image/svg+xml;base64,AAAA', null, null],
    ['', null, null],
  ])
    assert.equal(dancePhotosSchema.safeParse(photos).success, false);
  assert.throws(() => completeDanceCast([null, null, null]), /at least one/);
  assert.throws(() => resolveDanceCast([1, null], () => 2), /three role/);
  assert.throws(
    () =>
      resolveDanceCast([1, null, null], () => {
        throw new Error('unavailable');
      }),
    /unavailable/
  );
});
test('bundled v1 characters match public preview bytes and paths', () => {
  assets.forEach((asset, i) => {
    assert.equal(asset.path, defaultDanceCast[i]);
    const bytes = readFileSync(`public${asset.path}`);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      asset.sha256
    );
    assert.deepEqual(Buffer.from(asset.base64, 'base64'), bytes);
  });
});
