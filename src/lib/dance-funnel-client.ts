import { analyticsDiagnostic } from '@/lib/analytics-policy';
import { apiPost } from '@/lib/api-client';
import { browserUuid } from '@/lib/browser-uuid';
import { readDanceCampaign } from '@/lib/dance-campaign';
import {
  DANCE_CONVERSION_VERSION,
  funnelParamsSchema,
  type FunnelParams,
} from '@/lib/dance-funnel-contract';
import { paymentFunnelEventId } from '@/lib/dance-payment-receipt';
import { getQueryClient } from '@/lib/query-client';

let memoryFlow: string | undefined;
let queue: {
  id: string;
  event: string;
  locale: string;
  params: FunnelParams;
}[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let flushing: Promise<void> | undefined;
let diagnostic = false;
let installed = false;
export function danceFlowId() {
  if (typeof window === 'undefined') return undefined;
  if (!memoryFlow) {
    try {
      memoryFlow = sessionStorage.getItem('dance-funnel-flow') || browserUuid();
      sessionStorage.setItem('dance-funnel-flow', memoryFlow);
    } catch {
      memoryFlow = browserUuid();
    }
  }
  diagnostic = diagnostic || analyticsDiagnostic();
  try {
    document.cookie = `dance_flow=${memoryFlow}; Path=/; SameSite=Lax; Max-Age=86400${location.protocol === 'https:' ? '; Secure' : ''}`;
    if (!installed) {
      installed = true;
      window.addEventListener('pagehide', () => {
        void flushDanceFunnel();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void flushDanceFunnel();
      });
    }
  } catch {
    /* A storage failure must not stop collection in this document. */
  }
  return memoryFlow;
}
export function enableDanceDiagnostics() {
  diagnostic = true;
  try {
    sessionStorage.setItem('dance-funnel-diagnostic', '1');
  } catch {
    /* optional */
  }
  try {
    document.cookie = 'dance_diagnostic=1; Path=/; SameSite=Lax; Max-Age=86400';
  } catch {
    /* optional */
  }
  try {
    window.dispatchEvent(new Event('dance-diagnostics-enabled'));
  } catch {
    /* optional */
  }
}
export function resetDanceFlow() {
  // Account changes must not mix two people's histories in one visit.
  queue = [];
  memoryFlow = browserUuid();
  try {
    sessionStorage.setItem('dance-funnel-flow', memoryFlow);
  } catch {
    /* optional */
  }
  danceFlowId();
}
export function queueDanceFunnel(event: string, params: unknown) {
  if (typeof window === 'undefined') return;
  if (/(?:^|\/)(?:admin|settings|api)(?:\/|$)/.test(window.location.pathname))
    return;
  try {
    danceFlowId();
    // Allowlist individual fields; invalid GA dimensions are omitted, never
    // forward transaction IDs, URLs, photos or arbitrary exception text.
    const clean: Record<string, unknown> = {
      conversion_version: DANCE_CONVERSION_VERSION,
      ...readDanceCampaign(),
    };
    for (const [key, value] of Object.entries(
      (params || {}) as Record<string, unknown>
    )) {
      const parsed = funnelParamsSchema.safeParse({ [key]: value });
      if (parsed.success) Object.assign(clean, parsed.data);
    }
    queue.push({
      id:
        ((event === 'purchase' || event === 'dance_test_purchase') &&
          paymentFunnelEventId(
            (params as { transaction_id?: unknown })?.transaction_id
          )) ||
        browserUuid(),
      event,
      locale: document.documentElement.lang || 'en',
      params: clean as FunnelParams,
    });
    queue = queue.slice(-100);
    if (!timer)
      timer = setTimeout(() => {
        timer = undefined;
        void flushDanceFunnel();
      }, 300);
  } catch {
    /* Product actions never depend on telemetry. */
  }
}
export async function flushDanceFunnel(): Promise<void> {
  if (flushing) return flushing;
  if (!queue.length) return;
  const batch = queue.splice(0, 20);
  const body = { flowId: danceFlowId(), diagnostic, events: batch };
  const client = getQueryClient();
  flushing = client
    .getMutationCache()
    .build(client, {
      mutationFn: () => apiPost('/api/dance/events', body, { keepalive: true }),
      retry: false,
    })
    .execute(undefined)
    .then(() => undefined)
    .catch(() => {
      queue = [...batch, ...queue].slice(-100);
    })
    .finally(() => {
      flushing = undefined;
    });
  await flushing;
  // No retry loop while offline. A later user event will retry the same IDs.
  if (queue.length && !queue.some((row) => row.id === batch[0]?.id))
    await flushDanceFunnel();
}
