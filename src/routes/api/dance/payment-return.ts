import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { danceStripeLive } from '@/core/payment/dance-mode';
import { recordFunnel, requestFlow } from '@/core/telemetry/dance-funnel';
import { getAllConfigs } from '@/modules/config/service';
import {
  danceStripe,
  fulfillDanceCheckout,
} from '@/modules/payment/dance-checkout';
import { respErr } from '@/lib/resp';
import { locales, localizeUrl } from '@/paraglide/runtime.js';

export const Route = createFileRoute('/api/dance/payment-return')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await getAuth().api.getSession({
            headers: request.headers,
          });
          if (!session?.user)
            return respErr('Sign in to verify your payment', { status: 401 });
          const config = await getAllConfigs(true);
          const id = new URL(request.url).searchParams.get('session_id') || '';
          if (!id.startsWith(danceStripeLive() ? 'cs_live_' : 'cs_test_'))
            throw new Error('Invalid payment session');
          const checkout = await danceStripe(
            config.stripe_secret_key || ''
          ).checkout.sessions.retrieve(id);
          if (checkout.metadata?.userId !== session.user.id)
            return respErr('Not found', { status: 404 });
          await fulfillDanceCheckout(checkout);
          const preferredLocale = request.headers
            .get('cookie')
            ?.match(/(?:^|;\s*)PARAGLIDE_LOCALE=([^;]*)/)?.[1];
          const locale =
            locales.find(
              (value) =>
                value === new URL(request.url).searchParams.get('locale')
            ) ||
            locales.find((value) => value === preferredLocale) ||
            'en';
          const destination = localizeUrl(
            new URL('/?resume=1#studio', request.url),
            { locale }
          );
          return new Response(null, {
            status: 303,
            headers: {
              Location:
                destination.pathname + destination.search + destination.hash,
              'Cache-Control': 'no-store',
              'Set-Cookie': `dance_payment_receipt=${checkout.id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800`,
            },
          });
        } catch {
          await recordFunnel({
            event: 'server_payment_return_failed',
            flowId: requestFlow(request),
            params: { reason: 'payment_unconfirmed' },
          });
          return respErr(
            'Payment not confirmed. Return to pricing or contact support.',
            { status: 409 }
          );
        }
      },
    },
  },
});
