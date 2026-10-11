import { analyticsDiagnostic } from '@/lib/analytics-policy';

type Clarity = ((...args: unknown[]) => void) & {
  q?: unknown[][];
  v?: string;
  t?: boolean;
};
type ClarityWindow = Window & { clarity?: Clarity };
let stopped = false;

export function stopClarity() {
  if (typeof window === 'undefined') return;
  (window as ClarityWindow).clarity?.('stop');
  stopped = true;
}

// Locale-prefixed private routes and auth callback URLs must not be recorded.
export function isClarityPageAllowed(pathname: string, search = '') {
  return (
    !/(?:^|\/)(?:admin|settings|sign-in|sign-up|forgot-password|reset-password|auth-callback|api)(?:\/|$)/.test(
      pathname
    ) && !/(?:^|[?&])(?:token|session_id|code|state)=/i.test(search)
  );
}

export function initializeClarity(projectId: string) {
  if (analyticsDiagnostic()) return false;
  if (typeof window === 'undefined' || !/^[a-z0-9]+$/i.test(projectId))
    return false;
  if (!isClarityPageAllowed(window.location.pathname, window.location.search))
    return false;
  if (document.getElementById('clarity-loader')) {
    if (stopped) {
      (window as ClarityWindow).clarity?.('start');
      stopped = false;
    }
    return true;
  }
  const target = window as ClarityWindow;
  target.clarity ??= Object.assign(
    (...args: unknown[]) => {
      target.clarity!.q!.push(args);
    },
    { q: [] as unknown[][] }
  );
  // No implied cookie approval: use Clarity's limited, cookieless mode.
  target.clarity('consentv2', {
    ad_Storage: 'denied',
    analytics_Storage: 'denied',
  });
  const script = document.createElement('script');
  script.id = 'clarity-loader';
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${projectId}`;
  script.onload = () => {
    if (!isClarityPageAllowed(window.location.pathname, window.location.search))
      stopClarity();
  };
  document.head.appendChild(script);
  return true;
}

// A 204 script response fires `load` but leaves the queue unprocessed. Retry
// only while Microsoft's bootstrap/runtime flags are absent; never restart
// an active recorder or inject tracking on private pages.
export function recoverClarityInitialization(projectId: string) {
  if (typeof window === 'undefined') return () => {};
  const delays = [30_000, 60_000, 120_000, 240_000];
  let timer: number | undefined;
  let attempt = 0;
  const schedule = () => {
    if (attempt >= delays.length) return;
    timer = window.setTimeout(() => {
      const clarity = (window as ClarityWindow).clarity;
      if (clarity?.v || clarity?.t) return;
      if (
        isClarityPageAllowed(window.location.pathname, window.location.search)
      ) {
        document.getElementById('clarity-loader')?.remove();
        initializeClarity(projectId);
      }
      attempt += 1;
      schedule();
    }, delays[attempt]);
  };
  schedule();
  return () => {
    if (timer !== undefined) window.clearTimeout(timer);
  };
}

// Only fixed event names reach Clarity: never photos, user/order IDs or params.
export function trackClarityEvent(event: string) {
  if (typeof window === 'undefined') return false;
  if (analyticsDiagnostic()) return false;
  if (!isClarityPageAllowed(window.location.pathname, window.location.search))
    return false;
  try {
    const clarity = (window as ClarityWindow).clarity;
    if (!clarity) return false;
    clarity('event', event);
    return true;
  } catch {
    return false;
  }
}
