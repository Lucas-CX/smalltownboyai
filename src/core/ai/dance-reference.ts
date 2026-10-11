import { danceTemplate } from '@/lib/dance-template';

// Pin the measured file: changed/HTML/truncated assets must never reach a paid task.
export async function verifyDanceReference(bytes: Uint8Array) {
  if (bytes.byteLength !== danceTemplate.byteLength)
    throw new Error('Reference video size mismatch');
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  const hash = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
  if (hash !== danceTemplate.sha256)
    throw new Error('Reference video checksum mismatch');
  return bytes;
}
