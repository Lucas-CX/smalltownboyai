import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initializeClarity,
  isClarityPageAllowed,
  recoverClarityInitialization,
  trackClarityEvent,
} from '../src/lib/clarity';

test('Clarity excludes private paths, locales and checkout/auth tokens', () => {
  for (const path of [
    '/admin',
    '/zh/admin/settings',
    '/zh/settings',
    '/sign-in',
    '/ru/auth-callback',
    '/api/dance/file',
  ]) {
    assert.equal(isClarityPageAllowed(path), false, path);
  }
  assert.equal(isClarityPageAllowed('/', '?session_id=private'), false);
  assert.equal(isClarityPageAllowed('/', '?code=private'), false);
  assert.equal(isClarityPageAllowed('/it', '?utm_source=tiktok'), true);
  assert.equal(isClarityPageAllowed('/pricing'), true);
  assert.equal(initializeClarity('abc123'), false, 'SSR safe');
  assert.equal(trackClarityEvent('begin_checkout'), false, 'SSR safe');
});

test('empty responses retry a bounded number of times; active and private pages do not retry', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document'
  );
  const pending: Array<() => void> = [];
  const delays: number[] = [];
  let removals = 0;
  let loads = 0;
  let cleared = false;
  const target = {
    location: { pathname: '/', search: '' },
    clarity: Object.assign(() => {}, { v: '' }),
    setTimeout: (callback: () => void, delay: number) => {
      pending.push(callback);
      delays.push(delay);
      return pending.length;
    },
    clearTimeout: () => {
      cleared = true;
    },
  };
  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: target,
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        getElementById: () => ({
          remove: () => {
            removals += 1;
          },
        }),
      },
    });
    // Existing script is removed and initializeClarity is invoked. The mock
    // keeps the element visible, so no actual network or DOM APIs are needed.
    const stop = recoverClarityInitialization('abc123');
    while (pending.length) {
      pending.shift()!();
      loads += 1;
    }
    assert.equal(loads, 4);
    assert.equal(removals, 4);
    assert.deepEqual(delays, [30_000, 60_000, 120_000, 240_000]);
    stop();
    assert.equal(cleared, true);
    target.clarity.v = '0.8.70';
    recoverClarityInitialization('abc123');
    pending.shift()!();
    assert.equal(removals, 4, 'active recorder is untouched');
    assert.equal(pending.length, 0);
    target.clarity.v = '';
    target.location.pathname = '/zh/admin';
    recoverClarityInitialization('abc123');
    while (pending.length) pending.shift()!();
    assert.equal(removals, 4, 'private page cannot load a tracker');
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
    if (previousWindow)
      Object.defineProperty(globalThis, 'window', previousWindow);
    if (previousDocument)
      Object.defineProperty(globalThis, 'document', previousDocument);
  }
});

test('Clarity events carry only the event name and failures do not break product actions', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events: unknown[][] = [];
  const target = {
    location: { pathname: '/', search: '' },
    clarity: (...args: unknown[]) => events.push(args),
  };
  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: target,
    });
    assert.equal(trackClarityEvent('dance_upload_succeeded'), true);
    assert.deepEqual(events, [['event', 'dance_upload_succeeded']]);
    target.location.pathname = '/zh/admin';
    assert.equal(trackClarityEvent('begin_checkout'), false);
    assert.equal(events.length, 1);
    target.location.pathname = '/';
    target.clarity = () => {
      throw new Error('blocked');
    };
    assert.equal(trackClarityEvent('begin_checkout'), false);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
    if (previous) Object.defineProperty(globalThis, 'window', previous);
  }
});

test('Clarity installs once, rejects malformed IDs and denies cookie storage before loading', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document'
  );
  const scripts: Record<string, unknown>[] = [];
  const target: {
    location: { pathname: string; search: string };
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] };
  } = {
    location: { pathname: '/', search: '' },
  };
  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: target,
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        getElementById: () => scripts[0],
        createElement: () => ({}),
        head: {
          appendChild: (script: Record<string, unknown>) =>
            scripts.push(script),
        },
      },
    });
    assert.equal(initializeClarity('bad/id'), false);
    assert.equal(scripts.length, 0);
    assert.equal(initializeClarity('abc123'), true);
    assert.equal(initializeClarity('abc123'), true);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, 'https://www.clarity.ms/tag/abc123');
    assert.deepEqual(target.clarity?.q?.[0], [
      'consentv2',
      {
        ad_Storage: 'denied',
        analytics_Storage: 'denied',
      },
    ]);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
    if (previousWindow)
      Object.defineProperty(globalThis, 'window', previousWindow);
    if (previousDocument)
      Object.defineProperty(globalThis, 'document', previousDocument);
  }
});
