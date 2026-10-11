import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// Bundle trusted defaults so Workers do not depend on a public network fetch.
const names = ['dancer', 'selfie', 'car'];
const cast = names.map((role) => {
  const path = `/media/cast/default-${role}-v1.jpg`;
  const bytes = readFileSync(`public${path}`);
  return {
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    base64: bytes.toString('base64'),
  };
});
writeFileSync('src/core/storage/dance-default-cast.json', JSON.stringify(cast));
