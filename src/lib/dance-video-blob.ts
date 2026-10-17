// Some Android browser media players issue their own requests without the
// page's session. Fetch through the authenticated page as a bounded fallback.
export async function loadPrivateVideoBlob(src: string, signal: AbortSignal) {
  const url = new URL(src, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    url.pathname !== '/api/dance/file'
  )
    throw new Error('Invalid private video URL');
  const response = await fetch(url, { credentials: 'same-origin', signal });
  if (
    !response.ok ||
    !response.headers.get('content-type')?.startsWith('video/')
  )
    throw new Error('Video unavailable');
  const limit = 100 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('Video too large for fallback');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Video unavailable');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Video too large for fallback');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type: 'video/mp4' });
}
