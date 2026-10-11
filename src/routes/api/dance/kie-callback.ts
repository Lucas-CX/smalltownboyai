import { createFileRoute } from '@tanstack/react-router';

import {
  readCallbackTaskId,
  verifyDanceCallback,
} from '@/core/ai/dance-callback';
import { completeDanceCallback } from '@/lib/dance-events.server';
import { respData, respErr } from '@/lib/resp';

export async function handleKieCallback(request: Request): Promise<Response> {
  if (process.env.VITE_PREVIEW_ONLY === 'true')
    return respErr('Preview paused', { status: 503 });
  let jobId: string | null;
  let taskId: string;
  try {
    jobId = verifyDanceCallback(new URL(request.url));
    if (!jobId) return respErr('Invalid callback', { status: 401 });
    taskId = await readCallbackTaskId(request);
  } catch {
    return respErr('Invalid callback', { status: 400 });
  }
  try {
    await completeDanceCallback(jobId, taskId);
    return respData(
      { received: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    // Acknowledge only durable completion. Transient failures remain retryable;
    // page refresh can recover the same task even if provider retries stop.
    return respErr('Callback processing pending', {
      status: 503,
      headers: { 'Retry-After': '30' },
    });
  }
}
export const Route = createFileRoute('/api/dance/kie-callback')({
  server: { handlers: { POST: ({ request }) => handleKieCallback(request) } },
});
