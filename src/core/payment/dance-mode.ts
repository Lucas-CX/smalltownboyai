export function dancePaymentMode() {
  const mode = process.env.DANCE_PAYMENT_MODE;
  if (mode !== 'stripe-test' && mode !== 'stripe-live')
    throw new Error('Stripe checkout is not configured');
  return mode;
}

export function danceStripeLive() {
  return dancePaymentMode() === 'stripe-live';
}

// Restricted server keys are valid; public keys and opposite-mode keys are not.
export function isDanceStripeKey(key: string) {
  return (
    danceStripeLive()
      ? /^(sk|rk)_live_[A-Za-z0-9_]+$/
      : /^(sk|rk)_test_[A-Za-z0-9_]+$/
  ).test(key);
}

export function validateDancePayment(checkout: {
  livemode: boolean;
  mode: string | null;
  payment_status: string;
}) {
  if (
    checkout.livemode !== danceStripeLive() ||
    checkout.mode !== 'payment' ||
    checkout.payment_status !== 'paid'
  )
    throw new Error('Payment mode or status mismatch');
}
