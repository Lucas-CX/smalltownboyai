import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDanceResultObserver,
  danceErrorReason,
  trackDance,
  trackDanceOnce,
} from '../src/lib/dance-analytics';

test('analytics are SSR safe, private, deduplicated and non-blocking', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'sessionStorage'
  );
  const events: unknown[][] = [];
  const saved = new Map<string, string>();
  try {
    Reflect.deleteProperty(globalThis, 'window');
    assert.equal(trackDance('dance_photo_selected'), false);
    const mockWindow = {
      location: {
        origin: 'https://example.com',
        pathname: '/',
        search: '?session_id=secret',
      },
      gtag: (...args: unknown[]) => events.push(args),
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: mockWindow,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => saved.get(key),
        setItem: (key: string, value: string) => saved.set(key, value),
      },
    });
    const params = {
      photo_count: 1,
      default_roles: 2,
      resolution: '480P',
      photos: 'private-photo',
      email: 'private-email',
    };
    trackDanceOnce('job:succeeded', 'dance_generation_succeeded', params);
    trackDanceOnce('job:succeeded', 'dance_generation_succeeded', params);
    assert.equal(events.length, 1);
    const payload = events[0][2] as Record<string, unknown>;
    assert.equal(payload.page_location, 'https://example.com/');
    assert.equal(payload.resolution, '480P');
    assert.equal(payload.photo_count, 1);
    assert.equal(payload.default_roles, 2);
    assert.equal(payload.photos, undefined);
    assert.equal(payload.email, undefined);
    const observer = createDanceResultObserver();
    const job = {
      id: 'new-job',
      status: 'succeeded',
      resolution: '720P',
      simulation: false,
      paymentMode: 'credits-live',
    };
    observer(job);
    assert.equal(events.length, 1, 'historical success must not be counted');
    observer({ ...job, status: 'queued' });
    observer(job);
    observer(job);
    assert.equal(events.length, 2, 'polling must count one completion');
    observer(
      { ...job, id: 'simulated', status: 'failed', simulation: true },
      true
    );
    assert.equal(
      (events[2][2] as Record<string, unknown>).reason,
      'simulated_failure'
    );
    mockWindow.gtag = () => {
      throw new Error('blocked');
    };
    assert.doesNotThrow(() => trackDanceOnce('retry', 'purchase', {}));
    assert.equal(saved.has('dance-analytics:retry'), false);
    mockWindow.gtag = (...args) => events.push(args);
    trackDanceOnce('retry', 'purchase', {});
    assert.equal(events.length, 4);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'sessionStorage');
    if (originalWindow)
      Object.defineProperty(globalThis, 'window', originalWindow);
    if (originalStorage)
      Object.defineProperty(globalThis, 'sessionStorage', originalStorage);
  }
});

test('error classification never sends arbitrary server messages', () => {
  assert.equal(
    danceErrorReason(new Error('secret provider response')),
    'request_failed'
  );
  assert.equal(
    danceErrorReason(new Error('INSUFFICIENT_CREDITS')),
    'insufficient_credits'
  );
  assert.equal(
    danceErrorReason(new TypeError('Failed to fetch')),
    'network_or_client'
  );
});
