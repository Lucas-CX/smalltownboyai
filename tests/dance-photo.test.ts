import assert from 'node:assert/strict';
import test from 'node:test';

import { funnelParamsSchema } from '../src/lib/dance-funnel-contract';
import {
  DancePhotoError,
  decodeDancePhoto,
  prepareDancePhoto,
  readDancePhotoDimensions,
  validateDancePhotoDimensions,
  validateDancePhotoFile,
} from '../src/lib/dance-photo';
import { dancePhotoOutputSize } from '../src/lib/dance-photo-policy';

function jpegHeader(width: number, height: number) {
  return new File(
    [
      new Uint8Array([
        255,
        216,
        255,
        224,
        0,
        2,
        255,
        192,
        0,
        17,
        8,
        height >> 8,
        height & 255,
        width >> 8,
        width & 255,
        3,
        1,
        17,
        0,
        2,
        17,
        0,
        3,
        17,
        0,
        255,
        217,
      ]),
    ],
    'large.jpg',
    { type: 'image/jpeg' }
  );
}

test('mobile blob URL decode failure retries selected bytes and releases the URL', async () => {
  const originals = {
    image: globalThis.Image,
    bitmap: globalThis.createImageBitmap,
    reader: globalThis.FileReader,
    revoke: URL.revokeObjectURL,
  };
  const sources: string[] = [];
  let revoked = 0;
  class MobileImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      sources.push(value);
      queueMicrotask(() =>
        value.startsWith('data:') ? this.onload?.() : this.onerror?.()
      );
    }
  }
  class Reader {
    result = 'data:image/png;base64,fixture';
    onload: (() => void) | null = null;
    readAsDataURL() {
      queueMicrotask(() => this.onload?.());
    }
  }
  try {
    globalThis.Image = MobileImage as unknown as typeof Image;
    globalThis.FileReader = Reader as unknown as typeof FileReader;
    globalThis.createImageBitmap = async () => {
      throw new Error('mobile decoder failed');
    };
    URL.revokeObjectURL = () => {
      revoked++;
    };
    const decoded = await decodeDancePhoto(
      new File(['png'], 'phone.png', { type: 'image/png' }),
      100
    );
    assert.equal(sources.length, 2);
    assert.ok(sources[0].startsWith('blob:'));
    assert.ok(sources[1].startsWith('data:image/png'));
    decoded.release();
    assert.equal(revoked, 1);
  } finally {
    globalThis.Image = originals.image;
    globalThis.createImageBitmap = originals.bitmap;
    globalThis.FileReader = originals.reader;
    URL.revokeObjectURL = originals.revoke;
  }
});

test('large phone headers are bounded before decoding and 48 MP requests decoder resizing', async () => {
  const original = globalThis.createImageBitmap;
  const image = globalThis.Image;
  let calls = 0,
    closed = 0,
    fallbacks = 0;
  try {
    const file = jpegHeader(8000, 6000);
    assert.deepEqual(await readDancePhotoDimensions(file), {
      width: 8000,
      height: 6000,
    });
    globalThis.Image = class {
      constructor() {
        fallbacks++;
      }
    } as unknown as typeof Image;
    globalThis.createImageBitmap = (async (
      _file: File,
      options: ImageBitmapOptions
    ) => {
      calls++;
      assert.equal(options.resizeWidth, 1600);
      assert.equal(options.resizeHeight, undefined);
      return { width: 1600, height: 1200, close: () => closed++ };
    }) as unknown as typeof createImageBitmap;
    const decoded = await decodeDancePhoto(file, 50, {
      width: 1600,
      required: true,
    });
    decoded.release();
    assert.equal(closed, 1);
    await assert.rejects(
      prepareDancePhoto(jpegHeader(12000, 8000)),
      (e: unknown) =>
        e instanceof DancePhotoError && e.reason === 'image_dimensions_exceeded'
    );
    assert.equal(calls, 1, '96 MP must be rejected before decoding');
    globalThis.createImageBitmap = async () => {
      throw new Error('resize unavailable');
    };
    await assert.rejects(
      decodeDancePhoto(file, 50, { width: 1600, required: true }),
      (e: unknown) =>
        e instanceof DancePhotoError && e.reason === 'image_resize_unavailable'
    );
    assert.equal(
      fallbacks,
      0,
      'large photos must not fall back to full-size DOM decoding'
    );
    globalThis.createImageBitmap = async () =>
      ({
        width: 8000,
        height: 6000,
        close: () => closed++,
      }) as unknown as ImageBitmap;
    await assert.rejects(
      decodeDancePhoto(file, 50, { width: 1600, required: true }),
      (e: unknown) =>
        e instanceof DancePhotoError && e.reason === 'image_resize_unavailable'
    );
    assert.equal(
      closed,
      2,
      'ignored resize options must release the oversized bitmap'
    );
    validateDancePhotoDimensions(8000, 8000, 64_000_000);
    assert.throws(() => validateDancePhotoDimensions(8001, 8000, 64_000_000));
    class FallbackImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = FallbackImage as unknown as typeof Image;
    globalThis.createImageBitmap = async () =>
      ({
        width: 4000,
        height: 3000,
        close: () => closed++,
      }) as unknown as ImageBitmap;
    const smaller = await decodeDancePhoto(jpegHeader(4000, 3000), 50, {
      width: 1600,
      required: false,
    });
    assert.ok(
      smaller.source instanceof FallbackImage,
      'safe small sources still support older browser fallback'
    );
    smaller.release();
  } finally {
    globalThis.createImageBitmap = original;
    globalThis.Image = image;
  }
});

test('mobile source photos can be compressed without accepting unsupported formats or excessive input', () => {
  validateDancePhotoFile({
    name: 'phone.jpg',
    type: 'image/jpeg',
    size: 12 * 1024 * 1024,
  });
  validateDancePhotoFile({ name: 'PHONE.JPG', type: '', size: 100 });
  for (const [file, reason] of [
    [{ name: 'fake.jpg', type: 'text/html', size: 100 }, 'unsupported_format'],
    [
      { name: 'huge.png', type: 'image/png', size: 21 * 1024 * 1024 },
      'file_too_large',
    ],
  ] as const)
    assert.throws(
      () => validateDancePhotoFile(file),
      (error: unknown) =>
        error instanceof DancePhotoError && error.reason === reason
    );
  validateDancePhotoFile({ name: 'photo.heic', type: 'image/heic', size: 100 });
  validateDancePhotoFile({ name: 'photo.HEIF', type: '', size: 100 });
  assert.throws(
    () =>
      validateDancePhotoFile({
        name: 'empty.jpg',
        type: 'image/jpeg',
        size: 0,
      }),
    (error: unknown) =>
      error instanceof DancePhotoError && error.reason === 'image_decode_failed'
  );
});

test('a stalled bitmap decoder falls back and closes a late bitmap', async () => {
  const previous = globalThis.createImageBitmap;
  const previousImage = globalThis.Image;
  class ReadyImage {
    onload: (() => void) | null = null;
    onerror = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  globalThis.Image = ReadyImage as unknown as typeof Image;
  let resolveBitmap!: (bitmap: ImageBitmap) => void;
  let closed = 0;
  try {
    globalThis.createImageBitmap = () =>
      new Promise((resolve) => {
        resolveBitmap = resolve;
      });
    const decoders: string[] = [];
    const result = await decodeDancePhoto(
      new File(['photo'], 'test.jpg', { type: 'image/jpeg' }),
      10,
      undefined,
      (decoder) => decoders.push(decoder)
    );
    assert.deepEqual(decoders, ['bitmap', 'image']);
    result.release();
    resolveBitmap({
      close: () => {
        closed++;
      },
    } as ImageBitmap);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(closed, 1);
  } finally {
    globalThis.createImageBitmap = previous;
    globalThis.Image = previousImage;
  }
});

test('HEIC decoder fallback gives a useful format error and releases its object URL', async () => {
  const originals = {
    bitmap: globalThis.createImageBitmap,
    image: globalThis.Image,
    revoke: URL.revokeObjectURL,
  };
  let revoked = 0;
  class UnsupportedImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onerror?.());
    }
  }
  try {
    globalThis.createImageBitmap = async () => {
      throw new Error('unsupported');
    };
    globalThis.Image = UnsupportedImage as unknown as typeof Image;
    URL.revokeObjectURL = () => {
      revoked++;
    };
    await assert.rejects(
      decodeDancePhoto(
        new File(['heic'], 'photo.heic', { type: 'image/heic' }),
        50
      ),
      (error: unknown) =>
        error instanceof DancePhotoError &&
        error.reason === 'heic_not_supported'
    );
    assert.equal(revoked, 1);
    class StalledImage {
      onload = null;
      onerror = null;
      set src(_value: string) {}
    }
    globalThis.Image = StalledImage as unknown as typeof Image;
    await assert.rejects(
      decodeDancePhoto(
        new File(['png'], 'photo.png', { type: 'image/png' }),
        10
      ),
      (error: unknown) =>
        error instanceof DancePhotoError &&
        error.reason === 'image_decode_timeout'
    );
    assert.equal(revoked, 2);
  } finally {
    globalThis.createImageBitmap = originals.bitmap;
    globalThis.Image = originals.image;
    URL.revokeObjectURL = originals.revoke;
  }
});

test('photo failures identify the actual correction and remain accepted by telemetry', () => {
  validateDancePhotoDimensions(4000, 3000);
  for (const [width, height, reason] of [
    [239, 640, 'image_too_small'],
    [8000, 6000, 'image_dimensions_exceeded'],
    [240, 1921, 'image_aspect_ratio'],
    [NaN, 500, 'image_decode_failed'],
  ] as const) {
    assert.throws(
      () => validateDancePhotoDimensions(width, height),
      (error: unknown) =>
        error instanceof DancePhotoError && error.reason === reason
    );
    assert.equal(
      funnelParamsSchema.safeParse({ role: 'left', reason }).success,
      true
    );
  }
});

test('Wan-compatible small and wide photos survive resizing without falling below its minimum', () => {
  for (const [width, height] of [
    [240, 400],
    [319, 600],
    [1000, 400],
    [1920, 240],
    [8000, 1000],
    [1000, 8000],
  ]) {
    validateDancePhotoDimensions(width, height);
    const output = dancePhotoOutputSize(width, height);
    assert.ok(output.width >= 240 && output.height >= 240);
    assert.ok(output.width <= width && output.height <= height);
    assert.ok(
      Math.max(output.width / output.height, output.height / output.width) <= 8
    );
  }
  assert.deepEqual(dancePhotoOutputSize(8000, 1000), {
    width: 1920,
    height: 240,
  });
  for (const [name, type] of [
    ['phone.jpg', 'image/jpg'],
    ['photo.bmp', 'image/bmp'],
    ['photo.avif', 'image/avif'],
    ['photo.jpg', 'application/octet-stream'],
  ])
    validateDancePhotoFile({ name, type, size: 1000 });
});

test('photo diagnostics retain bounded metadata while excluding filenames and image data', () => {
  const result = funnelParamsSchema.parse({
    source_mime: 'image/heic',
    source_bytes: 12000,
    source_width: 239,
    source_height: 600,
    photo_stage: 'validation',
    photo_rule: 'wan3_photo_v2',
    filename: 'private-name.heic',
    photo: 'data:image/jpeg;base64,private',
  });
  assert.equal(result.source_width, 239);
  assert.equal('filename' in result, false);
  assert.equal('photo' in result, false);
  assert.equal(
    funnelParamsSchema.safeParse({ source_mime: 'private arbitrary text' })
      .success,
    false
  );
});

test('browser preprocessing downsizes before upload and releases both decoder paths', async () => {
  const originals = {
    bitmap: globalThis.createImageBitmap,
    image: globalThis.Image,
    element: globalThis.HTMLImageElement,
    document: globalThis.document,
  };
  let closed = 0,
    drawn: number[] = [];
  class FakeImage {
    naturalWidth = 4000;
    naturalHeight = 3000;
    onload?: () => void;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: '',
      fillRect: () => {},
      drawImage: (
        _source: unknown,
        _x: number,
        _y: number,
        w: number,
        h: number
      ) => {
        drawn = [w, h];
      },
    }),
    toDataURL: () => 'data:image/jpeg;base64,prepared',
  };
  try {
    Object.assign(globalThis, {
      Image: FakeImage,
      HTMLImageElement: FakeImage,
      document: { createElement: () => canvas },
      createImageBitmap: async () => ({
        width: 4000,
        height: 3000,
        close: () => {
          closed++;
        },
      }),
    });
    const file = new File(['photo'], 'phone.jpg', { type: 'image/jpeg' });
    assert.equal(
      await prepareDancePhoto(file),
      'data:image/jpeg;base64,prepared'
    );
    assert.deepEqual(drawn, [1600, 1200]);
    assert.equal(closed, 1);
    globalThis.createImageBitmap = async () => {
      throw new Error('Bitmap decoder unavailable');
    };
    assert.equal(
      await prepareDancePhoto(file),
      'data:image/jpeg;base64,prepared'
    );
    assert.deepEqual(drawn, [1600, 1200]);
  } finally {
    Object.assign(globalThis, {
      createImageBitmap: originals.bitmap,
      Image: originals.image,
      HTMLImageElement: originals.element,
      document: originals.document,
    });
  }
});
