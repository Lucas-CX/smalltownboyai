import { externalAnalyticsAllowed } from '@/lib/analytics-policy';
import { trackClarityEvent } from '@/lib/clarity';
import { queueDanceFunnel } from '@/lib/dance-funnel-client';
import {
  DANCE_CONVERSION_VERSION,
  type FunnelParams,
} from '@/lib/dance-funnel-contract';
import { readDancePaymentReceipt } from '@/lib/dance-payment-receipt';

type Params = Pick<
  FunnelParams,
  | 'quote_cents'
  | 'photo_decoder'
  | 'source_mime'
  | 'source_bytes'
  | 'source_width'
  | 'source_height'
  | 'photo_stage'
  | 'photo_rule'
  | 'error_kind'
  | 'error_source'
  | 'error_line'
  | 'error_fingerprint'
  | 'browser_family'
  | 'entry_article'
  | 'entry_market'
> & {
  photo_count?: number;
  default_roles?: number;
  role?: string;
  resolution?: string;
  reason?: string;
  payment_mode?: string;
  simulation?: boolean;
  pack_id?: string;
  value?: number;
  currency?: string;
  stage?: string;
  transaction_id?: string;
};

export type DanceEvent =
  | 'dance_market_landing_viewed'
  | 'dance_market_entry_clicked'
  | 'dance_quote_viewed'
  | 'dance_resolution_changed'
  | 'dance_photo_picker_opened'
  | 'dance_photo_picker_canceled'
  | 'dance_purchase_restored'
  | 'dance_article_studio_clicked'
  | 'dance_studio_viewed'
  | 'dance_auth_started'
  | 'dance_auth_failed'
  | 'dance_session_ready'
  | 'dance_draft_restored'
  | 'dance_draft_missing'
  | 'dance_purchase_shown'
  | 'dance_purchase_closed'
  | 'dance_purchase_cta_viewed'
  | 'dance_purchase_cta_state'
  | 'dance_purchase_more_opened'
  | 'dance_purchase_continue_clicked'
  | 'dance_make_another_clicked'
  | 'dance_photo_selected'
  | 'dance_photo_ready'
  | 'dance_photo_failed'
  | 'dance_generate_clicked'
  | 'dance_login_required'
  | 'dance_credits_required'
  | 'dance_upload_started'
  | 'dance_upload_succeeded'
  | 'dance_upload_failed'
  | 'dance_generation_queued'
  | 'dance_generation_succeeded'
  | 'dance_generation_failed'
  | 'dance_download_clicked'
  | 'dance_video_failed'
  | 'dance_video_retry'
  | 'dance_video_recovered'
  | 'dance_pack_selected'
  | 'begin_checkout'
  | 'dance_checkout_ready'
  | 'dance_checkout_failed'
  | 'dance_client_error'
  | 'purchase'
  | 'dance_test_purchase'
  | 'dance_checkout_canceled';

// Never forward photos, filenames, order/user IDs, exception messages or URLs.
export function trackDance(
  event: DanceEvent,
  params: Params = {},
  persist = true
) {
  if (typeof window === 'undefined') return false;
  if (persist) queueDanceFunnel(event, params);
  if (!externalAnalyticsAllowed()) return false;
  if (persist) trackClarityEvent(event);
  try {
    const ga = (window as Window & { gtag?: (...args: unknown[]) => void })
      .gtag;
    if (!ga) return false;
    const safe = Object.fromEntries(
      [
        'photo_count',
        'default_roles',
        'role',
        'resolution',
        'reason',
        'payment_mode',
        'simulation',
        'pack_id',
        'value',
        'currency',
        'stage',
        'transaction_id',
        'error_kind',
        'error_source',
        'error_line',
        'error_fingerprint',
        'browser_family',
        'entry_article',
        'entry_market',
      ]
        .filter((key) => params[key as keyof Params] !== undefined)
        .map((key) => [key, params[key as keyof Params]])
    );
    ga('event', event, {
      ...safe,
      analytics_version: 'dance_v1',
      conversion_version: DANCE_CONVERSION_VERSION,
      page_location: window.location.origin + window.location.pathname,
      transport_type: 'beacon',
    });
    return true;
  } catch {
    // Analytics must never interrupt uploads, checkout or rendering.
    return false;
  }
}

export function createDanceResultObserver() {
  const observed = new Set<string>();
  return (
    job: {
      id: string;
      status: string;
      resolution: string;
      simulation: boolean;
      paymentMode: string;
    },
    submitted = false
  ) => {
    if (
      submitted ||
      ['queued', 'generating', 'reconciling'].includes(job.status)
    )
      observed.add(job.id);
    if (!observed.has(job.id) || !['succeeded', 'failed'].includes(job.status))
      return;
    trackDanceOnce(
      `${job.id}:${job.status}`,
      job.status === 'succeeded'
        ? 'dance_generation_succeeded'
        : 'dance_generation_failed',
      {
        resolution: job.resolution,
        simulation: job.simulation,
        payment_mode: job.paymentMode,
        ...(job.status === 'failed'
          ? {
              reason: job.simulation ? 'simulated_failure' : 'provider_failure',
            }
          : {}),
      }
    );
  };
}

export function danceErrorReason(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'INSUFFICIENT_CREDITS') return 'insufficient_credits';
  if (message === 'Sign in to continue') return 'authentication_required';
  if (message === 'Photos too large') return 'upload_too_large';
  if (message === 'Invalid upload or consent') return 'invalid_upload';
  if (error instanceof TypeError) return 'network_or_client';
  return 'request_failed';
}

export function trackDancePaymentReceipt(value: unknown) {
  const receipt = readDancePaymentReceipt(value);
  if (!receipt) return;
  trackDanceOnce(
    `payment:${receipt.transaction_id}`,
    receipt.payment_mode === 'stripe-live' ? 'purchase' : 'dance_test_purchase',
    receipt
  );
}

const funnelObserved = new Set<string>();
const gaObserved = new Set<string>();
const clarityObserved = new Set<string>();
export function trackDanceOnce(key: string, event: DanceEvent, params: Params) {
  if (typeof window === 'undefined') return;
  if (
    externalAnalyticsAllowed() &&
    !clarityObserved.has(key) &&
    trackClarityEvent(event)
  ) {
    clarityObserved.add(key);
  }
  if (!funnelObserved.has(key)) {
    queueDanceFunnel(event, params);
    funnelObserved.add(key);
  }
  try {
    const storageKey = `dance-analytics:${key}`;
    let storage: Storage | undefined;
    try {
      storage = key.startsWith('payment:') ? localStorage : sessionStorage;
      if (storage.getItem(storageKey)) return;
    } catch {
      // Browser storage restrictions must not block actions or reporting.
    }
    if (gaObserved.has(key)) return;
    if (typeof (window as Window & { gtag?: unknown }).gtag !== 'function')
      return;
    if (trackDance(event, params, false)) {
      gaObserved.add(key);
      try {
        storage?.setItem(storageKey, '1');
      } catch {
        /* memory fallback */
      }
    }
  } catch {
    // Storage restrictions must not break product actions.
  }
}
