import { createFileRoute } from '@tanstack/react-router';

import { verifyDanceEvent } from '@/core/payment/dance-event';
import { danceStripeLive, isDanceStripeKey } from '@/core/payment/dance-mode';
import { getAllConfigs } from '@/modules/config/service';
import { acceptPayment, owned, requireSandbox } from '@/modules/dance/service';
import { fulfillDanceCheckout } from '@/modules/payment/dance-checkout';
import { respData, respErr } from '@/lib/resp';

async function POST({ request }: { request: Request }) {
  try {
    requireSandbox();
    const config = await getAllConfigs(true);
    const key = config.stripe_secret_key || '';
    const secret = config.stripe_signing_secret || config.stripe_webhook_secret;
    if (!isDanceStripeKey(key) || !secret)
      throw new Error('Payment configuration missing');
    const checkout = await verifyDanceEvent(
      await request.text(),
      request.headers.get('stripe-signature') || '',
      secret
    );
    if (!checkout) return respData({ ignored: true });
    if (checkout.metadata?.danceCreditOrder) {
      await fulfillDanceCheckout(checkout);
      return respData({ received: true });
    }
    if (danceStripeLive()) throw new Error('Unsupported payment metadata');
    const job = await owned(
      checkout.metadata?.userId || '',
      checkout.metadata?.danceJobId || ''
    );
    if (
      checkout.payment_status !== 'paid' ||
      checkout.currency !== 'usd' ||
      checkout.amount_total !== job.amountCents ||
      checkout.id !== job.paymentId ||
      job.paymentMode !== 'stripe-test' ||
      job.expiresAt <= Date.now() / 1000
    )
      throw new Error('Payment mismatch');
    await acceptPayment(
      job.id,
      checkout.id,
      'stripe-test',
      checkout.amount_total
    );
    return respData({ received: true });
  } catch {
    return respErr('Webhook verification failed', { status: 400 });
  }
}
export const Route = createFileRoute('/api/dance/stripe-webhook')({
  server: { handlers: { POST } },
});
