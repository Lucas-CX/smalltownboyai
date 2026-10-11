import assert from 'node:assert/strict';
import test from 'node:test';

import { startDancePreview } from '../src/lib/dance-video-preview';

function fixture(reduced = false, reject = false) {
  const events = new EventTarget();
  const video = Object.assign(events, {
    paused: true,
    ended: false,
    plays: 0,
    play() {
      this.plays++;
      if (reject) return Promise.reject(new Error('NotAllowedError'));
      this.paused = false;
      events.dispatchEvent(new Event('play'));
      return Promise.resolve();
    },
    pause() {
      if (this.paused) return;
      this.paused = true;
      events.dispatchEvent(new Event('pause'));
    },
  });
  const page = Object.assign(new EventTarget(), { hidden: false });
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  let visible = (_: boolean) => {};
  let disconnected = false;
  const stop = startDancePreview(video, page, motion, (callback) => {
    visible = callback;
    return () => {
      disconnected = true;
    };
  });
  return {
    video,
    page,
    motion,
    visible: (value: boolean) => visible(value),
    stop,
    disconnected: () => disconnected,
  };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test('preview starts only in view, pauses offscreen and resumes on return', async () => {
  const f = fixture();
  assert.equal(f.video.plays, 0);
  f.visible(true);
  await flush();
  assert.equal(f.video.paused, false);
  f.visible(false);
  assert.equal(f.video.paused, true);
  f.visible(true);
  await flush();
  assert.equal(f.video.plays, 2);
  f.stop();
  assert.equal(f.video.paused, true);
  assert.equal(f.disconnected(), true);
  f.visible(true);
  assert.equal(f.video.plays, 2);
});
test('manual pause is preserved across viewport and tab visibility changes', async () => {
  const f = fixture();
  f.visible(true);
  await flush();
  f.video.pause();
  f.visible(false);
  f.visible(true);
  f.page.hidden = true;
  f.page.dispatchEvent(new Event('visibilitychange'));
  f.page.hidden = false;
  f.page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.video.plays, 1);
  await f.video.play();
  f.visible(false);
  f.visible(true);
  await flush();
  assert.equal(f.video.plays, 3);
  f.stop();
});
test('background tab pauses automatic preview and foreground resumes', async () => {
  const f = fixture();
  f.visible(true);
  await flush();
  f.page.hidden = true;
  f.page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.video.paused, true);
  f.page.hidden = false;
  f.page.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(f.video.plays, 2);
  f.stop();
});
test('reduced motion disables autoplay but permits deliberate playback', async () => {
  const f = fixture(true);
  f.visible(true);
  await flush();
  assert.equal(f.video.plays, 0);
  await f.video.play();
  assert.equal(f.video.paused, false);
  f.visible(false);
  f.visible(true);
  await flush();
  assert.equal(f.video.plays, 1);
  f.stop();
});
test('autoplay denial is handled without a retry loop', async () => {
  const f = fixture(false, true);
  f.visible(true);
  await flush();
  f.visible(false);
  f.visible(true);
  await flush();
  assert.equal(f.video.plays, 1);
  assert.equal(f.video.paused, true);
  f.stop();
});
