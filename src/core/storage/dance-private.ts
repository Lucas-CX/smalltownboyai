import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';

import {
  dancePhotoOutputSize,
  MAX_DANCE_PHOTO_RATIO,
  MIN_DANCE_PHOTO_EDGE,
} from '@/lib/dance-photo-policy';
import { danceTemplate } from '@/lib/dance-template';

// Local Node MVP only. Never expose this directory via public/ or a static server.
const root = path.resolve('data/dance-private');
export async function normalizePhoto(input: Uint8Array) {
  if (!input.length || input.length > 8 * 1024 * 1024)
    throw new Error('Photo must be under 8 MB');
  const image = sharp(input, {
    limitInputPixels: 36_000_000,
    failOn: 'warning',
  });
  const meta = await image.metadata();
  if (
    !['jpeg', 'png', 'webp'].includes(meta.format || '') ||
    (meta.pages || 1) !== 1
  )
    throw new Error('Use a single JPEG, PNG or WebP image');
  if (
    !meta.width ||
    !meta.height ||
    meta.width < MIN_DANCE_PHOTO_EDGE ||
    meta.height < MIN_DANCE_PHOTO_EDGE ||
    Math.max(meta.width / meta.height, meta.height / meta.width) >
      MAX_DANCE_PHOTO_RATIO
  )
    throw new Error(
      'Use a clear image at least 240 px on each side, with an aspect ratio up to 8:1'
    );
  const output = dancePhotoOutputSize(meta.width, meta.height);
  // Decode fully, remove EXIF/GPS and bound dimensions before saving.
  return image
    .rotate()
    .resize({
      width: Math.max(output.width, output.height),
      height: Math.max(output.width, output.height),
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}
export async function savePrivate(bytes: Uint8Array) {
  await mkdir(root, { recursive: true });
  const key = crypto.randomUUID();
  await writeFile(path.join(root, key), bytes, { flag: 'wx' });
  return key;
}
function filePath(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid file key');
  return path.join(root, key);
}
export async function savePrivateStream(
  body: ReadableStream<Uint8Array>,
  _byteLength: number
) {
  await mkdir(root, { recursive: true });
  const key = crypto.randomUUID();
  try {
    await pipeline(
      Readable.fromWeb(body as any),
      createWriteStream(filePath(key), { flags: 'wx' })
    );
    return key;
  } catch (error) {
    await rm(filePath(key), { force: true });
    throw error;
  }
}
export const readPrivate = (key: string) => readFile(filePath(key));
export async function privateVideoExists(key: string, simulation = false) {
  try {
    const file = await stat(
      simulation ? 'data/fixtures/simulation.mp4' : filePath(key)
    );
    return file.isFile() && file.size > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
export const deletePrivate = (key: string) =>
  rm(filePath(key), { force: true });
export const readSimulation = () => readFile('data/fixtures/simulation.mp4');
export const readDanceReference = () =>
  readFile(path.join('public', danceTemplate.path));
