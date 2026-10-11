import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';

import { useSession } from '@/core/auth/client';
import {
  analyticsDiagnostic,
  analyticsLocation,
  analyticsPageAllowed,
  externalAnalyticsAllowed,
  googleAnalyticsBootstrap,
} from '@/lib/analytics-policy';
import { apiGet } from '@/lib/api-client';
import {
  trackDance,
  trackDanceOnce,
  trackDancePaymentReceipt,
} from '@/lib/dance-analytics';
import { runtimeDiagnostic } from '@/lib/dance-diagnostics';

// Initialize the event queue in SSR, but download GA after the first render.
// Interaction starts it immediately so upload/checkout events stay queued.
export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!measurementId) return;
    let idle: number | undefined;
    let timer: number | undefined;
    let frame: number | undefined;
    let started = false;
    let configured = externalAnalyticsAllowed();
    const start = () => {
      if (!externalAnalyticsAllowed()) return;
      if (started) return;
      started = true;
      if (document.getElementById('ga-loader')) return;
      const script = document.createElement('script');
      script.id = 'ga-loader';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(script);
    };
    const schedule = () => {
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          if (typeof window.requestIdleCallback === 'function') {
            idle = window.requestIdleCallback(start, { timeout: 1500 });
          } else {
            timer = window.setTimeout(start, 1000);
          }
        });
      });
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    window.addEventListener('pointerdown', start, {
      once: true,
      passive: true,
    });
    window.addEventListener('keydown', start, { once: true });
    const setExcluded = (path: string) => {
      (window as unknown as Record<string, unknown>)[
        `ga-disable-${measurementId}`
      ] = !analyticsPageAllowed(path) || analyticsDiagnostic();
    };
    const before = router.subscribe('onBeforeNavigate', ({ toLocation }) => {
      // Do not re-enable while the old private URL is still in the address bar.
      if (!analyticsPageAllowed(toLocation.pathname))
        setExcluded(toLocation.pathname);
    });
    const after = router.subscribe('onResolved', () => {
      setExcluded(window.location.pathname);
      if (externalAnalyticsAllowed()) {
        (window as Window & { gtag?: (...args: unknown[]) => void }).gtag?.(
          'config',
          measurementId,
          {
            update: configured,
            send_page_view: !configured,
            page_location: analyticsLocation(window.location.href),
          }
        );
        configured = true;
        start();
      }
    });
    const onDiagnostic = () => setExcluded(window.location.pathname);
    window.addEventListener('dance-diagnostics-enabled', onDiagnostic);
    return () => {
      window.removeEventListener('dance-diagnostics-enabled', onDiagnostic);
      before();
      after();
      window.removeEventListener('load', schedule);
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [measurementId, router]);
  const session = useSession();
  const receipt = useQuery({
    queryKey: ['dance-payment-analytics', session.data?.user.id],
    queryFn: () => apiGet<unknown>('/api/dance/payment-analytics'),
    enabled:
      !!session.data?.user &&
      !!measurementId &&
      typeof window !== 'undefined' &&
      externalAnalyticsAllowed(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    trackDancePaymentReceipt(receipt.data);
  }, [receipt.data]);
  useEffect(() => {
    if (!measurementId) return;
    const onError = (event: ErrorEvent) =>
      trackDance('dance_client_error', {
        stage: 'runtime',
        reason: 'uncaught_error',
        ...runtimeDiagnostic(
          event.error,
          event.filename,
          event.lineno,
          window.location.origin,
          navigator.userAgent
        ),
      });
    const onRejection = (event: PromiseRejectionEvent) =>
      trackDance('dance_client_error', {
        stage: 'runtime',
        reason: 'unhandled_rejection',
        ...runtimeDiagnostic(
          event.reason,
          undefined,
          undefined,
          window.location.origin,
          navigator.userAgent
        ),
      });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    if (
      new URLSearchParams(window.location.search).get('checkout') === 'canceled'
    )
      trackDanceOnce(
        `checkout-canceled:${window.location.pathname}`,
        'dance_checkout_canceled',
        {}
      );
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [measurementId]);
  if (!measurementId) return null;
  return (
    <>
      {/* async={true} flags this to React 19 as a hoistable resource —
          without it, React logs the "Encountered a script tag while
          rendering React component" warning and won't re-execute it on
          client navigations. */}
      <script
        id="ga-init"
        async
        dangerouslySetInnerHTML={{
          __html: googleAnalyticsBootstrap(measurementId),
        }}
      />
    </>
  );
}
