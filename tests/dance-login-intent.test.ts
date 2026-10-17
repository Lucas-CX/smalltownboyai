import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearDanceLoginIntent,
  consumeDanceLoginIntent,
  saveDanceLoginIntent,
} from '../src/lib/dance-login-intent';

test('only matching explicit login navigation may continue once; refresh, history and passive drafts never do', async () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    'sessionStorage'
  );
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  const draft = {
    photos: ['a', 'b'],
    requestKey: 'stable-generation-key',
    resolution: '720P',
    packId: 'friends',
  };
  try {
    for (const navigation of ['reload', 'back_forward', 'unknown']) {
      await saveDanceLoginIntent('nonce', draft);
      assert.equal(
        await consumeDanceLoginIntent('nonce', draft, navigation),
        false
      );
      assert.equal(
        await consumeDanceLoginIntent('nonce', draft, 'navigate'),
        false
      );
    }
    await saveDanceLoginIntent('nonce', draft);
    assert.equal(await consumeDanceLoginIntent(null, draft, 'navigate'), false);
    await saveDanceLoginIntent('nonce', draft);
    assert.equal(
      await consumeDanceLoginIntent('wrong', draft, 'navigate'),
      false
    );
    for (const changed of [
      { ...draft, photos: ['b', 'a'] },
      { ...draft, requestKey: 'other' },
      { ...draft, packId: 'single' },
    ]) {
      await saveDanceLoginIntent('nonce', draft);
      assert.equal(
        await consumeDanceLoginIntent('nonce', changed, 'navigate'),
        false
      );
    }
    await saveDanceLoginIntent('nonce', draft);
    assert.deepEqual(
      await Promise.all([
        consumeDanceLoginIntent('nonce', draft, 'navigate'),
        consumeDanceLoginIntent('nonce', draft, 'navigate'),
      ]),
      [true, false]
    );
    await saveDanceLoginIntent('nonce', draft);
    const stored = JSON.parse(values.get('dance-login-intent')!);
    values.set(
      'dance-login-intent',
      JSON.stringify({ ...stored, expires: Date.now() - 1 })
    );
    assert.equal(
      await consumeDanceLoginIntent('nonce', draft, 'navigate'),
      false
    );
    await saveDanceLoginIntent('nonce', draft);
    clearDanceLoginIntent();
    assert.equal(
      await consumeDanceLoginIntent('nonce', draft, 'navigate'),
      false
    );
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
