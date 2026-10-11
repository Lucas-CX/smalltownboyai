import { z } from 'zod';

// Fixed performer identities, not fixed positions in the frame.
export const DANCE_CAST_VERSION = 'smalltown-duo-v1' as const;

export const dancePhotosSchema = z
  .array(
    z
      .string()
      .max(11_200_000)
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/)
      .nullable()
  )
  .length(2)
  .refine((photos) => photos.every(Boolean), 'Upload both role photos');

export function castPreview(photos: (string | null)[]) {
  return [photos[0] || null, photos[1] || null];
}

export function resolveDanceCast<T>(photos: (T | null)[]): T[] {
  if (photos.length !== 2 || photos.some((photo) => photo == null))
    throw new Error('Exactly two role photos required');
  return photos as T[];
}
