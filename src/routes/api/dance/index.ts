import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { cloudDanceEnabled } from '@/core/cloudflare/dance';
import { cloudDanceBalance } from '@/core/cloudflare/dance-ledger';
import { recordFunnel, requestFlow } from '@/core/telemetry/dance-funnel';
import { queueDanceWithCredits } from '@/modules/ai-tasks/service';
import { getBalance } from '@/modules/credits/service';
import * as dance from '@/modules/dance/service';
import { dancePhotosSchema } from '@/lib/dance-cast';
import { danceCreditCost } from '@/lib/dance-plans';
import { danceResolutions } from '@/lib/dance-settings';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

const input = z.object({
  castVersion: z.literal('smalltown-duo-v1').default('smalltown-duo-v1'),
  flowId: z.string().uuid().optional(),
  resolution: z.enum(danceResolutions).default('720P'),
  requestKey: z.string().uuid(),
  consent: z.literal(true),
  photos: dancePhotosSchema,
  scenario: z.enum(['success', 'failure', 'timeout']).default('success'),
  useCredits: z.boolean().default(false),
});

async function handler({ request }: { request: Request }) {
  try {
    dance.requireSandbox();
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return respErr('Sign in to continue', { status: 401 });
    if (request.method === 'GET')
      return respData(await dance.list(session.user.id), {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return respErr('Invalid origin', { status: 403 });
    const limited = enforceMinIntervalRateLimit(request, {
      intervalMs: 3000,
      keyPrefix: `dance-${session.user.id}`,
    });
    if (limited) return limited;
    // Count actual streamed bytes too; Content-Length is not trusted.
    const reader = request.body?.getReader();
    if (!reader) return respErr('Missing photos', { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 23_000_000) {
        await reader.cancel();
        return respErr('Photos too large', { status: 413 });
      }
      chunks.push(item.value);
    }
    const data = input.parse(
      JSON.parse(Buffer.concat(chunks).toString('utf8'))
    );
    if (data.useCredits) {
      const existing = await dance.findByRequest(
        session.user.id,
        data.requestKey
      );
      if (
        existing &&
        [
          'credits-preview',
          'credits-test',
          'credits-live',
          'credits-restored',
        ].includes(existing.paymentMode)
      )
        return respData(dance.visible(existing));
      if (
        (cloudDanceEnabled()
          ? await cloudDanceBalance(session.user.id)
          : await getBalance(session.user.id)) <
        danceCreditCost(existing?.resolution ?? data.resolution)
      )
        return respErr('INSUFFICIENT_CREDITS', { status: 402 });
    }
    const job = await dance.create(
      session.user.id,
      data.requestKey,
      data.photos.map((photo) =>
        photo === null ? null : Buffer.from(photo.split(',')[1], 'base64')
      ),
      data.scenario,
      data.resolution
    );
    if (data.useCredits) {
      const queued = await queueDanceWithCredits(session.user.id, job.id);
      await recordFunnel({
        flowId: data.flowId || requestFlow(request),
        userId: session.user.id,
        event: 'server_generation_queued',
        resourceId: job.id,
        params: {
          resolution: data.resolution,
          photo_count: data.photos.filter(Boolean).length,
          default_roles: data.photos.filter((photo) => photo === null).length,
        },
      });
      return respData(dance.visible(queued));
    }
    return respData(job);
  } catch (e) {
    return respErr(
      e instanceof Error && !(e instanceof z.ZodError)
        ? e.message
        : 'Invalid upload or consent',
      { status: 400 }
    );
  }
}
export const Route = createFileRoute('/api/dance/')({
  server: { handlers: { GET: handler, POST: handler } },
});
