import Stripe from 'stripe';

import { danceStripeLive, validateDancePayment } from './dance-mode';

export async function verifyDanceEvent(
  raw: string,
  signature: string,
  secret: string
) {
  const stripe = new Stripe('sk_test_local_signature_verification_only');
  // Workers uses Web Crypto; synchronous HMAC verification is not supported there.
  const event = await stripe.webhooks.constructEventAsync(
    raw,
    signature,
    secret,
    undefined,
    Stripe.createSubtleCryptoProvider()
  );
  if (event.livemode !== danceStripeLive())
    throw new Error('Payment mode mismatch');
  if (
    event.type !== 'checkout.session.completed' &&
    event.type !== 'checkout.session.async_payment_succeeded'
  )
    return null;
  const checkout = event.data.object;
  validateDancePayment(checkout);
  if (
    checkout.payment_status !== 'paid' ||
    checkout.currency !== 'usd' ||
    checkout.mode !== 'payment'
  )
    throw new Error('Payment mismatch');
  return checkout;
}
