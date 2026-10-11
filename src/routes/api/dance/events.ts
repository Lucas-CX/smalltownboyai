import { createFileRoute } from '@tanstack/react-router';
import { count, eq } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { recordFunnel } from '@/core/telemetry/dance-funnel';
import { danceFunnelEvent } from '@/config/db/schema';
import { funnelAudience } from '@/lib/dance-audience';
import { funnelBatchSchema } from '@/lib/dance-funnel-contract';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

async function POST({ request }: { request: Request }) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return respErr('Invalid origin', { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return respErr('Invalid content type', { status: 400 });
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 100,
    keyPrefix: 'dance-events',
  });
  if (limited) return limited;
  try {
    const reader = request.body?.getReader();
    if (!reader) return respErr('Missing events', { status: 400 });
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_000) {
        await reader.cancel();
        return respErr('Too many events', { status: 413 });
      }
      chunks.push(value);
    }
    const input = funnelBatchSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString('utf8'))
    );
    const [quota] = await db()
      .select({ total: count() })
      .from(danceFunnelEvent)
      .where(eq(danceFunnelEvent.flowId, input.flowId));
    if (quota.total >= 500)
      return respErr('Event limit reached', { status: 429 });
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    const device = /Mobile|Android/i.test(
      request.headers.get('user-agent') || ''
    )
      ? 'mobile'
      : 'desktop';
    const results = [];
    for (const event of input.events)
      results.push(
        await recordFunnel({
          ...event,
          params: {
            ...event.params,
            ...funnelAudience(
              request,
              event.locale,
              Boolean((globalThis as { __CF_ENV__?: unknown }).__CF_ENV__)
            ),
          },
          flowId: input.flowId,
          userId: session?.user.id,
          source: 'client',
          device,
          diagnostic: input.diagnostic,
        })
      );
    if (results.some((result) => !result))
      return respErr('Event storage unavailable', { status: 503 });
    return respData(
      { accepted: input.events.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return respErr('Events unavailable', { status: 400 });
  }
}
export const Route = createFileRoute('/api/dance/events')({
  server: { handlers: { POST } },
});
