import { resolveDanceCast } from '@/lib/dance-cast';

export function completeDanceCast(photos: (Uint8Array | null)[]) {
  const cast = resolveDanceCast(photos);
  if (cast.some((photo) => !photo.byteLength)) throw new Error('Empty photo');
  return cast;
}
