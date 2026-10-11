import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

import { completeDanceCast } from '../src/core/storage/dance-default-cast';
import { normalizePhoto as normalizeLocalPhoto } from '../src/core/storage/dance-private';
import { normalizePhoto } from '../src/core/storage/dance-private.workers';

test('local and Workers normalization preserve the new minimum and 8:1 boundary', async () => {
  (globalThis as any).__CF_ENV__ = {
    IMAGES: {
      input(stream: ReadableStream) {
        return {
          transform(options: { width: number; height: number }) {
            return {
              async output() {
                const bytes = Buffer.from(
                  await new Response(stream).arrayBuffer()
                );
                const decoded = await sharp(bytes)
                  .resize({
                    ...options,
                    fit: 'inside',
                    withoutEnlargement: true,
                  })
                  .jpeg()
                  .toBuffer();
                return { response: () => new Response(decoded) };
              },
            };
          },
        };
      },
    },
  };
  try {
    for (const [width, height] of [
      [240, 400],
      [319, 600],
      [1000, 400],
      [1920, 240],
      [240, 1920],
    ]) {
      const bytes = await sharp({
        create: { width, height, channels: 3, background: 'white' },
      })
        .jpeg()
        .toBuffer();
      for (const normalize of [normalizePhoto, normalizeLocalPhoto]) {
        const meta = await sharp(await normalize(bytes)).metadata();
        assert.equal(meta.width, width);
        assert.equal(meta.height, height);
        assert.equal(meta.format, 'jpeg');
      }
    }
    for (const [width, height] of [
      [239, 400],
      [1921, 240],
    ]) {
      const bytes = await sharp({
        create: { width, height, channels: 3, background: 'white' },
      })
        .jpeg()
        .toBuffer();
      for (const normalize of [normalizePhoto, normalizeLocalPhoto])
        await assert.rejects(normalize(bytes));
    }
  } finally {
    delete (globalThis as any).__CF_ENV__;
  }
});

test('all bundled defaults pass Workers image validation and the native decoder pipeline', async () => {
  let calls = 0;
  (globalThis as any).__CF_ENV__ = {
    IMAGES: {
      input(stream: ReadableStream) {
        return {
          transform() {
            return {
              async output() {
                calls++;
                const bytes = await new Response(stream).arrayBuffer();
                const decoded = await sharp(Buffer.from(bytes))
                  .jpeg()
                  .toBuffer();
                return { response: () => new Response(decoded) };
              },
            };
          },
        };
      },
    },
  };
  try {
    const input = await sharp({
      create: { width: 400, height: 500, channels: 3, background: 'white' },
    })
      .jpeg()
      .toBuffer();
    for (let role = 0; role < 3; role++) {
      const cast = completeDanceCast(
        [0, 1, 2].map((i) => (i === role ? input : null))
      );
      for (const photo of cast)
        assert.ok((await normalizePhoto(photo)).length > 0);
    }
    assert.equal(calls, 9);
  } finally {
    delete (globalThis as any).__CF_ENV__;
  }
});

test('rejects truncated image containers before invoking Images', async () => {
  let calls = 0;
  (globalThis as any).__CF_ENV__ = {
    IMAGES: {
      input() {
        calls++;
        throw new Error('Unexpected decode');
      },
    },
  };
  try {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const bytes = await sharp({
        create: { width: 400, height: 400, channels: 3, background: 'white' },
      })
        .toFormat(format)
        .toBuffer();
      await assert.rejects(
        normalizePhoto(bytes.subarray(0, bytes.length - 8)),
        /incomplete|damaged/
      );
    }
    assert.equal(calls, 0);
  } finally {
    delete (globalThis as any).__CF_ENV__;
  }
});

test('valid headers do not bypass remote image decoding errors', async () => {
  const bytes = await sharp({
    create: { width: 400, height: 400, channels: 3, background: 'white' },
  })
    .jpeg()
    .toBuffer();
  (globalThis as any).__CF_ENV__ = {
    IMAGES: {
      input() {
        return {
          transform() {
            return {
              async output() {
                throw new Error('Decoder rejected image');
              },
            };
          },
        };
      },
    },
  };
  try {
    await assert.rejects(normalizePhoto(bytes), /Decoder rejected/);
  } finally {
    delete (globalThis as any).__CF_ENV__;
  }
});
