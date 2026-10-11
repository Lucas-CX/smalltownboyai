import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { list, requireSandbox } from '@/modules/dance/service';
import { advanceDanceJobs } from '@/lib/dance-events.server';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

async function POST({ request }: { request: Request }) {
  if (process.env.VITE_PREVIEW_ONLY === 'true')
    return respErr('Preview paused', { status: 503 });
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return respErr('Invalid origin', { status: 403 });
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Sign in to continue', { status: 401 });
  try {
    requireSandbox();
    const limited = enforceMinIntervalRateLimit(request, {
      intervalMs: 5000,
      keyPrefix: `dance-refresh-${session.user.id}`,
    });
    if (!limited)
      await advanceDanceJobs({ userId: session.user.id, reason: 'refresh' });
    // A throttled second tab still gets the durable state without provider I/O.
    return respData(await list(session.user.id), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return respErr('Task refresh unavailable', { status: 503 });
  }
}
export const Route = createFileRoute('/api/dance/refresh')({
  server: { handlers: { POST } },
});
