import { createFileRoute } from '@tanstack/react-router';
import { and, eq } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { StripeProvider } from '@/core/payment/stripe';
import { PaymentType } from '@/core/payment/types';
import { danceJob } from '@/config/db/schema';
import { getAllConfigs } from '@/modules/config/service';
import { owned, requireSandbox } from '@/modules/dance/service';
import { respData, respErr } from '@/lib/resp';

async function POST({ request }: { request: Request }) {
  try {
    requireSandbox();
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return respErr('Invalid origin', { status: 403 });
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return respErr('Unauthorized', { status: 401 });
    const { id } = await request.json();
    const job = await owned(session.user.id, id);
    if (
      job.status !== 'unpaid' ||
      job.paymentMode !== 'stripe-test' ||
      job.expiresAt <= Date.now() / 1000
    )
      throw new Error('Checkout unavailable');
    const config = await getAllConfigs();
    const key = config.stripe_secret_key || '';
    if (!key.startsWith('sk_test_'))
      return respErr(
        'Configure a Stripe test key in Admin Settings. Live keys are blocked.',
        { status: 503 }
      );
    const provider = new StripeProvider({
      secretKey: key,
      publishableKey: '',
      allowedPaymentMethods: ['card'],
      allowPromotionCodes: false,
    });
    const base = new URL(request.url).origin;
    const checkout = await provider.createPayment({
      idempotencyKey: `dance-${job.id}`,
      order: {
        type: PaymentType.ONE_TIME,
        price: { amount: job.amountCents, currency: 'usd' },
        description: 'SANDBOX — simulated video, no real charge',
        metadata: { danceJobId: job.id, userId: job.userId },
        successUrl: `${base}/?checkout=returned`,
        cancelUrl: `${base}/?checkout=cancelled`,
      },
    });
    await db()
      .update(danceJob)
      .set({ paymentId: checkout.checkoutInfo.sessionId })
      .where(and(eq(danceJob.id, id), eq(danceJob.status, 'unpaid')));
    return respData({ url: checkout.checkoutInfo.checkoutUrl });
  } catch {
    return respErr('Test checkout unavailable; no generation submitted', {
      status: 400,
    });
  }
}
export const Route = createFileRoute('/api/dance/checkout')({
  server: { handlers: { POST } },
});
