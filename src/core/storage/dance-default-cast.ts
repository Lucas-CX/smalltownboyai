import { resolveDanceCast } from '@/lib/dance-cast';

import assets from './dance-default-cast.json';

export function completeDanceCast(photos: (Uint8Array | null)[]) {
  return resolveDanceCast(photos, (index) =>
    Buffer.from(assets[index].base64, 'base64')
  );
}
