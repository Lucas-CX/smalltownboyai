import type Stripe from 'stripe';

import { envConfigs } from '@/config';

// Pin only Checkout creation to the API that supports per-session branding.
// Webhook validation and existing fulfillment keep their current SDK contract.
export const danceCheckoutApiVersion = '2026-08-26.dahlia';
export function danceCheckoutPresentation(origin: string, locale = 'en') {
  const supported = ['en', 'zh'];
  const selected = supported.includes(locale) ? locale : 'en';
  const name = envConfigs.app_name;
  return {
    branding_settings: { display_name: name },
    locale: selected as Stripe.Checkout.SessionCreateParams.Locale,
    payment_intent_data: {
      description: `${name} video credits`,
      statement_descriptor_suffix: name
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .replace(/\s+/g, '')
        .slice(0, 22),
    },
    success_url: `${origin}/api/dance/payment-return?locale=${selected}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${selected === 'en' ? '/' : `/${selected}`}?checkout=canceled#studio`,
  };
}
