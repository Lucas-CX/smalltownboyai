import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { danceStripeLive } from '@/core/payment/dance-mode';
import { getAllConfigs } from '@/modules/config/service';
import {
  danceStripe,
  fulfillDanceCheckout,
} from '@/modules/payment/dance-checkout';
import { reviewDancePayment } from '@/lib/dance-payment-review';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData } from '@/lib/resp';
import { locales, localizeUrl } from '@/paraglide/runtime.js';

export const Route = createFileRoute('/api/dance/payment-return')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const cookies = request.headers.get('cookie') || '';
        if (url.searchParams.get('check') === '1') {
          try {
            const session = await getAuth().api.getSession({
              headers: request.headers,
            });
            if (!session?.user)
              return respData(
                { status: 'login' },
                { headers: { 'Cache-Control': 'private, no-store' } }
              );
            const limited = enforceMinIntervalRateLimit(request, {
              intervalMs: 5000,
              keyPrefix: `dance-payment-review-${session.user.id}`,
            });
            if (limited) return limited;
            const status = await reviewDancePayment({
              userId: session?.user.id,
              sessionId:
                cookies.match(/(?:^|;\s*)dance_payment_receipt=([^;]*)/)?.[1] ||
                '',
              live: danceStripeLive(),
              retrieve: async (id) => {
                const config = await getAllConfigs(true);
                return danceStripe(
                  config.stripe_secret_key || ''
                ).checkout.sessions.retrieve(id);
              },
              fulfill: fulfillDanceCheckout,
            });
            return respData(
              { status },
              { headers: { 'Cache-Control': 'private, no-store' } }
            );
          } catch {
            return respData(
              { status: 'pending' },
              { headers: { 'Cache-Control': 'private, no-store' } }
            );
          }
        }
        // Login expiry and provider outages return to a recoverable page. The page
        // verifies once; only an explicit user click can start generation.
        const locale =
          locales.find((v) => v === url.searchParams.get('locale')) ||
          locales.find(
            (v) =>
              v === cookies.match(/(?:^|;\s*)PARAGLIDE_LOCALE=([^;]*)/)?.[1]
          ) ||
          'en';
        const destination = localizeUrl(
          new URL('/?resume=1&payment=review#studio', request.url),
          { locale }
        );
        const id = url.searchParams.get('session_id') || '';
        const valid =
          id.length <= 255 && /^cs_(live|test)_[A-Za-z0-9_]+$/.test(id);
        return new Response(null, {
          status: 303,
          headers: {
            Location:
              destination.pathname + destination.search + destination.hash,
            'Cache-Control': 'no-store',
            'Set-Cookie': `dance_payment_receipt=${valid ? id : ''}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${valid ? 1800 : 0}`,
          },
        });
      },
    },
  },
});
