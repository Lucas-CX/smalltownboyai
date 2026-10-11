import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { cloudDanceEnabled } from '@/core/cloudflare/dance';
import { cloudDanceBalance } from '@/core/cloudflare/dance-ledger';
import { requestFlow } from '@/core/telemetry/dance-funnel';
import { getAllConfigs } from '@/modules/config/service';
import { getBalance } from '@/modules/credits/service';
import { requireSandbox } from '@/modules/dance/service';
import { createDanceCheckout } from '@/modules/payment/dance-checkout';
import { purchaseDancePreviewCredits } from '@/modules/payment/service';
import {
  DANCE_CREDITS_PER_VIDEO,
  DANCE_RESOLUTION_CREDITS,
  dancePlans,
} from '@/lib/dance-plans';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

async function handle({ request }: { request: Request }) {
  try {
    requireSandbox();
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return respErr('Sign in to continue', { status: 401 });
    if (request.method === 'GET')
      return respData(
        {
          balance: cloudDanceEnabled()
            ? await cloudDanceBalance(session.user.id)
            : await getBalance(session.user.id),
          cost: DANCE_CREDITS_PER_VIDEO,
          costs: DANCE_RESOLUTION_CREDITS,
          plans: dancePlans,
          simulation: process.env.DANCE_GENERATION_MODE !== 'kie',
          paymentMode: ['stripe-test', 'stripe-live'].includes(
            process.env.DANCE_PAYMENT_MODE || ''
          )
            ? process.env.DANCE_PAYMENT_MODE
            : 'mock',
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return respErr('Invalid origin', { status: 403 });
    const limited = enforceMinIntervalRateLimit(request, {
      intervalMs: 3000,
      keyPrefix: `dance-checkout-${session.user.id}`,
    });
    if (limited)
      return respErr('Please wait before starting another checkout.', {
        status: 429,
        headers: { 'Retry-After': '3' },
      });
    const input = z
      .object({
        flowId: z.string().uuid().optional(),
        locale: z.enum(['en', 'zh']).optional(),
        packId: z.enum(['single', 'friends', 'collection']),
        requestKey: z.string().uuid(),
        confirmPreview: z.literal(true),
      })
      .parse(await request.json());
    if (
      ['stripe-test', 'stripe-live'].includes(
        process.env.DANCE_PAYMENT_MODE || ''
      )
    ) {
      const config = await getAllConfigs(true);
      return respData(
        await createDanceCheckout({
          key: config.stripe_secret_key || '',
          kieKey: config.kie_api_key,
          signingSecret:
            config.stripe_signing_secret || config.stripe_webhook_secret,
          userId: session.user.id,
          email: session.user.email,
          packId: input.packId,
          requestKey: input.requestKey,
          origin: new URL(request.url).origin,
          flowId: input.flowId || requestFlow(request),
          locale: input.locale,
        })
      );
    }
    if (process.env.NODE_ENV === 'production')
      throw new Error('Checkout unavailable');
    return respData(
      await purchaseDancePreviewCredits(
        session.user.id,
        input.packId,
        input.requestKey
      )
    );
  } catch {
    return respErr('Credit purchase unavailable. No payment was taken.', {
      status: 400,
    });
  }
}
export const Route = createFileRoute('/api/dance/credits')({
  server: { handlers: { GET: handle, POST: handle } },
});
