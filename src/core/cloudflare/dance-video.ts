import { cloudBindings } from './dance';

export async function cloudDanceVideoExists(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) return false;
  const bucket = cloudBindings()?.DANCE_FILES;
  if (!bucket) throw new Error('Private storage unavailable');
  const meta = await bucket.head(`private/${key}`);
  return !!meta && meta.size > 0;
}

// Called only after the API has checked session, ownership, expiry and status.
export async function streamCloudDanceVideo(key: string, request: Request) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid file key');
  const bucket = cloudBindings()?.DANCE_FILES;
  if (!bucket) throw new Error('Private storage unavailable');
  const objectKey = `private/${key}`;
  const meta = await bucket.head(objectKey);
  if (!meta) throw new Error('File unavailable');
  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Content-Length': String(meta.size),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `${new URL(request.url).searchParams.has('download') ? 'attachment' : 'inline'}; filename="generated-video.mp4"`,
  };
  let range: { offset: number; length: number } | undefined;
  const value = request.headers.get('range');
  if (value) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(value);
    const start = match ? Number(match[1]) : -1;
    const end = match?.[2]
      ? Math.min(Number(match[2]), meta.size - 1)
      : meta.size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= meta.size ||
      end < start
    ) {
      return new Response(null, {
        status: 416,
        headers: {
          ...headers,
          'Content-Length': '0',
          'Content-Range': `bytes */${meta.size}`,
        },
      });
    }
    range = { offset: start, length: end - start + 1 };
    headers['Content-Length'] = String(range.length);
    headers['Content-Range'] = `bytes ${start}-${end}/${meta.size}`;
  }
  const result = await bucket.get(objectKey, range ? { range } : undefined);
  if (!result) throw new Error('File unavailable');
  return new Response(result.body, { status: range ? 206 : 200, headers });
}
