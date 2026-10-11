import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const media = new URL('../public/media/', import.meta.url);
const output = new URL('launch/responsive/', media);
await mkdir(output, { recursive: true });
for (const name of [
  'input-dancer',
  'input-selfie',
  'input-car-exit',
  'shot-dancer',
  'shot-selfie',
  'shot-car-exit',
  'shot-return',
  'poster',
]) {
  for (const width of [240, 480]) {
    await sharp(fileURLToPath(new URL(`launch/${name}.webp`, media)))
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(fileURLToPath(new URL(`${name}-${width}.webp`, output)));
  }
}
await sharp(fileURLToPath(new URL('dance-reference-poster.jpg', media)))
  .resize({ width: 480 })
  .webp({ quality: 78 })
  .toFile(fileURLToPath(new URL('reference-poster-480.webp', output)));
