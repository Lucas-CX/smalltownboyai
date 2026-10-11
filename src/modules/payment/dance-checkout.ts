import { and, eq } from 'drizzle-orm';
import Stripe from 'stripe';

import { cloudDanceEnabled } from '@/core/cloudflare/dance';
import { fulfillCloudCheckout } from '@/core/cloudflare/dance-ledger';
import { db } from '@/core/db';
import { retryLocalTransaction } from '@/core/db/retry-local-transaction';
import {
  dancePaymentMode,
  danceStripeLive,
  isDanceStripeKey,
  validateDancePayment,
} from '@/core/payment/dance-mode';
import {
  recordFunnel,
  recordResourceFunnel,
} from '@/core/telemetry/dance-funnel';
import { credit, order } from '@/config/db/schema';
import {
  danceCheckoutApiVersion,
  danceCheckoutPresentation,
} from '@/lib/dance-checkout-presentation';
import { dancePlans } from '@/lib/dance-plans';

// Payment mode is operator-controlled; never infer it from a client request.
export function danceStripe(key: string) {
  if (
    (!cloudDanceEnabled() &&
      (process.env.DANCE_SANDBOX !== 'true' ||
        process.env.NODE_ENV === 'production')) ||
    !isDanceStripeKey(key)
  )
    throw new Error('Stripe checkout unavailable');
  return new Stripe(key, { maxNetworkRetries: 0 });
}

export async function createDanceCheckout(args: {
  key: string;
  signingSecret?: string;
  userId: string;
  email: string;
  packId: string;
  requestKey: string;
  origin: string;
  flowId?: string;
  locale?: string;
}) {
  const live = danceStripeLive();
  if (
    live &&
    (!cloudDanceEnabled() ||
      !args.signingSecret?.startsWith('whsec_') ||
      process.env.DANCE_GENERATION_MODE !== 'kie' ||
      !process.env.KIE_API_KEY)
  )
    throw new Error(
      'Payment and generation configuration must be completed before checkout'
    );
  const stripe = danceStripe(args.key);
  const pack = dancePlans.find((p) => p.id === args.packId);
  if (!pack || !/^[a-f0-9-]{36}$/.test(args.requestKey))
    throw new Error('Invalid purchase');
  const orderNo = `${live ? 'dance-live' : 'dance-test'}:${args.userId}:${args.requestKey}`;
  // Save the intent before contacting Stripe; retries reuse both this row and Stripe's key.
  await db()
    .insert(order)
    .values({
      id: crypto.randomUUID(),
      orderNo,
      userId: args.userId,
      userEmail: args.email,
      status: 'pending',
      amount: pack.cents,
      currency: 'usd',
      productId: pack.id,
      productName: live ? 'Dance credits' : 'Dance credits (test)',
      creditsAmount: pack.credits,
      paymentType: 'one-time',
      paymentProvider: dancePaymentMode(),
      checkoutInfo: JSON.stringify({ testMode: !live, packId: pack.id }),
    })
    .onConflictDoNothing();
  const [intent] = await db()
    .select()
    .from(order)
    .where(eq(order.orderNo, orderNo))
    .limit(1);
  if (intent.productId !== pack.id) throw new Error('Purchase does not match');
  if (intent.status === 'paid') return { checkoutUrl: '/?resume=1#studio' };
  // Do not reuse a key after Stripe's minimum 24-hour idempotency retention.
  if (Date.now() - intent.createdAt.getTime() > 23 * 3600_000)
    throw new Error('Checkout expired; start a new purchase');
  const checkout = intent.paymentSessionId
    ? await stripe.checkout.sessions.retrieve(intent.paymentSessionId)
    : await stripe.checkout.sessions.create(
        {
          ...danceCheckoutPresentation(args.origin, args.locale),
          mode: 'payment',
          client_reference_id: orderNo,
          customer_email: args.email,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: intent.amount,
                product_data: {
                  name: `${intent.creditsAmount} dance credits${live ? '' : ' (test mode)'}`,
                },
              },
            },
          ],
          metadata: { danceCreditOrder: orderNo, userId: args.userId },
        },
        { idempotencyKey: orderNo, apiVersion: danceCheckoutApiVersion }
      );
  if (checkout.livemode !== live || !checkout.url)
    throw new Error('Checkout unavailable');
  await db()
    .update(order)
    .set({ paymentSessionId: checkout.id, checkoutUrl: checkout.url })
    .where(eq(order.id, intent.id));
  await recordFunnel({
    event: 'server_checkout_created',
    flowId: args.flowId,
    userId: args.userId,
    resourceId: orderNo,
    params: { pack_id: pack.id },
  });
  return { checkoutUrl: checkout.url };
}

async function fulfillDanceCheckoutInner(checkout: Stripe.Checkout.Session) {
  const live = danceStripeLive();
  const orderNo = checkout.metadata?.danceCreditOrder;
  if (!orderNo?.startsWith(live ? 'dance-live:' : 'dance-test:'))
    throw new Error('Payment namespace mismatch');
  validateDancePayment(checkout);
  if (cloudDanceEnabled()) return fulfillCloudCheckout(checkout);
  return retryLocalTransaction(() =>
    db().transaction(async (tx: any) => {
      const [intent] = await tx
        .select()
        .from(order)
        .where(eq(order.orderNo, orderNo))
        .limit(1);
      if (
        !intent ||
        intent.paymentProvider !== dancePaymentMode() ||
        checkout.id !== intent.paymentSessionId ||
        checkout.metadata?.userId !== intent.userId ||
        checkout.currency !== intent.currency ||
        checkout.amount_total !== intent.amount
      )
        throw new Error('Payment mismatch');
      const [claimed] = await tx
        .update(order)
        .set({
          status: 'paid',
          paymentAmount: checkout.amount_total,
          paymentCurrency: checkout.currency,
          paidAt: new Date(),
          transactionId:
            typeof checkout.payment_intent === 'string'
              ? checkout.payment_intent
              : null,
        })
        .where(and(eq(order.id, intent.id), eq(order.status, 'pending')))
        .returning();
      if (!claimed) return false;
      await tx.insert(credit).values({
        id: crypto.randomUUID(),
        userId: intent.userId,
        orderNo,
        transactionNo: `grant:${orderNo}`,
        transactionType: 'grant',
        transactionScene: 'payment',
        credits: intent.creditsAmount,
        remainingCredits: intent.creditsAmount,
        status: 'active',
        description: live
          ? 'Stripe payment credits'
          : 'Stripe test payment credits',
        metadata: JSON.stringify({ testMode: !live }),
        expiresAt: null,
      });
      return true;
    })
  );
}

export async function fulfillDanceCheckout(checkout: Stripe.Checkout.Session) {
  const fulfilled = await fulfillDanceCheckoutInner(checkout);
  // A verified duplicate webhook also repairs a previously missed telemetry
  // write. Deduplication is independent of the credit-grant transaction.
  if (checkout.metadata?.danceCreditOrder && checkout.metadata.userId)
    await recordResourceFunnel(
      'server_payment_verified',
      checkout.metadata.danceCreditOrder,
      checkout.metadata.userId
    );
  return fulfilled;
}
