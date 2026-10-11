import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { cloudDanceEnabled } from '@/core/cloudflare/dance';
import {
  cloudDanceVideoExists,
  streamCloudDanceVideo,
} from '@/core/cloudflare/dance-video';
import {
  privateVideoExists,
  readPrivate,
  readSimulation,
} from '@/core/storage/dance-private';
import { owned, requireSandbox } from '@/modules/dance/service';
import type { VideoFileState } from '@/lib/dance-video-state';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  const q = new URL(request.url).searchParams;
  const statusOnly = q.get('status') === '1' && q.get('slot') === 'video';
  const status = (state: VideoFileState) =>
    respData(
      { state },
      {
        headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
      }
    );
  try {
    requireSandbox();
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user)
      return statusOnly
        ? status('authentication_required')
        : respErr('Unauthorized', { status: 401 });
    const job = await owned(session.user.id, q.get('id') || '').catch(
      (error: unknown) => {
        if (error instanceof Error && error.message === 'Order not found')
          return null;
        throw error;
      }
    );
    if (!job)
      return statusOnly
        ? status('video_missing')
        : respErr('File unavailable', { status: 404 });
    if (job.expiresAt <= Date.now() / 1000 || job.status === 'deleted')
      return statusOnly
        ? status('video_expired')
        : respErr('File expired or deleted', { status: 410 });
    const slot = q.get('slot');
    const isVideo = slot === 'video';
    if (isVideo && job.status !== 'succeeded')
      return statusOnly
        ? status('video_not_ready')
        : respErr('Video not ready', { status: 409 });
    if (!isVideo && !['0', '1', '2'].includes(slot || ''))
      return respErr('Invalid file', { status: 400 });
    if (statusOnly) {
      const exists =
        job.generationMode === 'kie' && cloudDanceEnabled()
          ? await cloudDanceVideoExists(job.resultKey || '')
          : await privateVideoExists(
              job.resultKey || '',
              job.generationMode !== 'kie'
            );
      return status(exists ? 'ready' : 'video_missing');
    }
    if (isVideo && job.generationMode === 'kie' && cloudDanceEnabled())
      return await streamCloudDanceVideo(job.resultKey || '', request);
    const bytes = isVideo
      ? job.generationMode === 'kie'
        ? await readPrivate(job.resultKey || '')
        : await readSimulation()
      : await readPrivate(JSON.parse(job.photos)[Number(slot)]);
    const headers: Record<string, string> = {
      'Content-Type': isVideo ? 'video/mp4' : 'image/jpeg',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `${q.has('download') ? 'attachment' : 'inline'}; filename="${isVideo ? (job.generationMode === 'kie' ? 'generated-video.mp4' : 'SIMULATION-NOT-AI.mp4') : 'photo.jpg'}"`,
    };
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = match ? Number(match[1]) : -1;
      const end = match?.[2]
        ? Math.min(Number(match[2]), bytes.length - 1)
        : bytes.length - 1;
      if (start < 0 || start >= bytes.length || end < start)
        return new Response(null, {
          status: 416,
          headers: {
            ...headers,
            'Content-Length': '0',
            'Content-Range': `bytes */${bytes.length}`,
          },
        });
      return new Response(bytes.subarray(start, end + 1), {
        status: 206,
        headers: {
          ...headers,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
        },
      });
    }
    return new Response(bytes, { headers });
  } catch {
    if (statusOnly) return status('video_unavailable');
    return respErr('File unavailable', { status: 404 });
  }
}
export const Route = createFileRoute('/api/dance/file')({
  server: { handlers: { GET } },
});
