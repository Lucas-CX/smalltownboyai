import { imageSize } from 'image-size';

import { cloudBindings } from '@/core/cloudflare/dance';
import {
  dancePhotoOutputSize,
  MAX_DANCE_PHOTO_RATIO,
  MIN_DANCE_PHOTO_EDGE,
} from '@/lib/dance-photo-policy';
import { danceTemplate } from '@/lib/dance-template';

function bucket(): any {
  const value = cloudBindings()?.DANCE_FILES;
  if (!value) throw new Error('Private storage unavailable');
  return value;
}
function objectKey(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid file key');
  return `private/${key}`;
}
export async function readDanceReference() {
  const assets = cloudBindings()?.ASSETS;
  if (!assets) throw new Error('Reference assets unavailable');
  // Use the deployment's static asset binding, never a temporary provider URL
  // or an external self-fetch that may hit an older deployment.
  const response = await assets.fetch(
    new Request(`https://assets.invalid${danceTemplate.path}`)
  );
  if (!response.ok) throw new Error('Reference video unavailable');
  return Buffer.from(await response.arrayBuffer());
}
export async function normalizePhoto(input: Uint8Array) {
  if (!input.length || input.length > 8 * 1024 * 1024)
    throw new Error('Photo must be under 8 MB');
  const meta = imageSize(input);
  // Inspect headers before allocating decoder memory. Browser resizes to 1600px.
  if (
    !['jpg', 'png', 'webp'].includes(meta.type || '') ||
    meta.width < MIN_DANCE_PHOTO_EDGE ||
    meta.height < MIN_DANCE_PHOTO_EDGE ||
    meta.width * meta.height > 4_000_000 ||
    Math.max(meta.width / meta.height, meta.height / meta.width) >
      MAX_DANCE_PHOTO_RATIO
  )
    throw new Error(
      'Use a JPEG, PNG or WebP photo at least 240px per side, up to 4 megapixels and an 8:1 aspect ratio'
    );
  const raw = Buffer.from(input);
  // Images can recover truncated JPEGs. Reject incomplete containers before
  // sending them to the decoder, rather than silently accepting damaged photos.
  if (
    (meta.type === 'jpg' &&
      !raw.subarray(-2).equals(Buffer.from([0xff, 0xd9]))) ||
    (meta.type === 'png' &&
      !raw
        .subarray(-12)
        .equals(Buffer.from('0000000049454e44ae426082', 'hex'))) ||
    (meta.type === 'webp' && raw.readUInt32LE(4) + 8 !== raw.length)
  )
    throw new Error('Photo is incomplete or damaged');
  if (
    (meta.type === 'png' && raw.includes(Buffer.from('acTL'))) ||
    (meta.type === 'webp' && raw.includes(Buffer.from('ANIM')))
  )
    throw new Error('Animated photos are not supported');
  const images = cloudBindings()?.IMAGES;
  if (!images) throw new Error('Photo processing unavailable');
  const output = dancePhotoOutputSize(meta.width, meta.height);
  // Decode/re-encode outside the Worker CPU budget. Bytes never need a public URL.
  const result = await images
    .input(new Response(raw).body!)
    .transform({
      width: Math.max(output.width, output.height),
      height: Math.max(output.width, output.height),
      fit: 'scale-down',
      metadata: 'none',
    })
    .output({ format: 'image/jpeg', quality: 90, anim: false });
  const response = result.response();
  if (!response.ok) throw new Error('Photo processing failed');
  return Buffer.from(await response.arrayBuffer());
}
export async function savePrivate(bytes: Uint8Array) {
  const key = crypto.randomUUID();
  await bucket().put(objectKey(key), bytes);
  return key;
}
export async function savePrivateStream(
  body: ReadableStream<Uint8Array>,
  byteLength: number
) {
  const FixedStream = (globalThis as any).FixedLengthStream;
  if (!FixedStream) {
    await body.cancel();
    throw new Error('Streaming storage unavailable');
  }
  const key = crypto.randomUUID();
  const stream = new FixedStream(byteLength);
  const abort = new AbortController();
  const pumping = body.pipeTo(stream.writable, { signal: abort.signal });
  const storing = Promise.resolve().then(() =>
    bucket().put(objectKey(key), stream.readable, {
      httpMetadata: { contentType: 'video/mp4' },
    })
  );
  try {
    await Promise.all([pumping, storing]);
    return key;
  } catch (error) {
    abort.abort();
    await Promise.allSettled([pumping, storing]);
    await bucket().delete(objectKey(key));
    throw error;
  }
}
export async function readPrivate(key: string) {
  const object = await bucket().get(objectKey(key));
  if (!object) throw new Error('File unavailable');
  return Buffer.from(await object.arrayBuffer());
}
export async function privateVideoExists(key: string, simulation = false) {
  const meta = await bucket().head(
    simulation ? 'fixtures/simulation.mp4' : objectKey(key)
  );
  return !!meta && meta.size > 0;
}
export async function deletePrivate(key: string) {
  await bucket().delete(objectKey(key));
}
export async function readSimulation() {
  const object = await bucket().get('fixtures/simulation.mp4');
  if (!object) throw new Error('Simulation fixture unavailable');
  return Buffer.from(await object.arrayBuffer());
}
