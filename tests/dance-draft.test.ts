import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearDanceDraft,
  loadDanceDraft,
  saveDanceDraft,
} from '../src/lib/dance-draft';

test('unavailable IndexedDB falls back to tab storage with ownership, expiry and deletion', async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'sessionStorage'
  );
  const originalDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: {
        open: () => {
          throw new Error('blocked');
        },
      },
    });
    const draft = {
      photos: ['photo1', 'photo2'],
      consent: true,
      requestKey: 'same-request',
      ownerId: 'owner',
    };
    await saveDanceDraft(draft);
    assert.equal(
      await loadDanceDraft(),
      undefined,
      'expired session cannot view owned photos'
    );
    assert.deepEqual((await loadDanceDraft('owner'))?.photos, draft.photos);
    for (let mask = 1; mask < 4; mask++) {
      const partial = {
        ...draft,
        photos: draft.photos.map((p, i) => (mask & (1 << i) ? p : null)),
      };
      await saveDanceDraft(partial);
      const restored = await loadDanceDraft('owner');
      assert.deepEqual(restored?.photos, partial.photos);
      assert.equal(restored?.castVersion, 'smalltown-duo-v1');
      assert.equal(restored?.requestKey, draft.requestKey);
    }
    assert.equal((await loadDanceDraft('owner'))?.requestKey, 'same-request');
    assert.equal(await loadDanceDraft('different-account'), undefined);
    assert.equal(await loadDanceDraft('owner'), undefined);
    await saveDanceDraft(draft);
    const stored = JSON.parse(values.get('smalltown-draft-backup')!);
    values.set(
      'smalltown-draft-backup',
      JSON.stringify({ ...stored, expiresAt: Date.now() - 1 })
    );
    assert.equal(await loadDanceDraft('owner'), undefined);
    await saveDanceDraft(draft);
    await clearDanceDraft();
    assert.equal(await loadDanceDraft('owner'), undefined);
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        setItem: () => {
          throw new Error('quota');
        },
      },
    });
    await assert.rejects(saveDanceDraft(draft), /quota/);
  } finally {
    for (const [key, original] of [
      ['sessionStorage', originalStorage],
      ['indexedDB', originalDb],
    ] as const) {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('blocked IndexedDB times out and closes a late connection instead of hanging the CTA', async () => {
  const originals = ['indexedDB', 'sessionStorage'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  let request: any;
  let closed = false;
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { open: () => (request = {}) },
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    await saveDanceDraft({
      photos: ['a', 'b'],
      consent: true,
      requestKey: 'retry',
    });
    request.result = {
      close: () => {
        closed = true;
      },
    };
    request.onsuccess();
    assert.equal(closed, true);
    assert.equal((await loadDanceDraft())?.requestKey, 'retry');
  } finally {
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
