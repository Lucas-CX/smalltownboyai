import { z } from 'zod';

// Indices are part of the API contract: dancer, selfie, car exit.
export const defaultDanceCast = [
  '/media/cast/default-dancer-v1.jpg',
  '/media/cast/default-selfie-v1.jpg',
  '/media/cast/default-car-v1.jpg',
] as const;

export const dancePhotosSchema = z
  .array(
    z
      .string()
      .max(11_200_000)
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/)
      .nullable()
  )
  .length(3)
  .refine((photos) => photos.some(Boolean), 'Upload at least one photo');

export function castPreview(photos: (string | null)[]) {
  const hasPhoto = photos.some(Boolean);
  return defaultDanceCast.map(
    (fallback, index) =>
      photos[index] || (hasPhoto || index > 0 ? fallback : null)
  );
}

export function resolveDanceCast<T>(
  photos: (T | null)[],
  fallback: (index: number) => T
): T[] {
  if (photos.length !== 3 || !photos.some((photo) => photo !== null))
    throw new Error('Upload at least one photo in three role slots');
  return photos.map((photo, index) => photo ?? fallback(index));
}
