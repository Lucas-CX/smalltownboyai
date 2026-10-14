const privatePage =
  /(?:^|\/)(?:admin|settings|api|auth-callback|sign-in|sign-up|verify-email|forgot-password|reset-password)(?:\/|$)/;
export function analyticsPageAllowed(pathname: string) {
  return !privatePage.test(pathname);
}
export function analyticsDiagnostic() {
  let requested = false;
  try {
    requested = new URLSearchParams(location.search).get('diagnostic') === '1';
  } catch {
    /* SSR or restricted location */
  }
  if (requested) {
    try {
      sessionStorage.setItem('dance-funnel-diagnostic', '1');
    } catch {
      /* optional */
    }
    try {
      document.cookie =
        'dance_diagnostic=1; Path=/; SameSite=Lax; Max-Age=86400';
    } catch {
      /* optional */
    }
    return true;
  }
  try {
    if (/(?:^|;\s*)dance_diagnostic=1(?:;|$)/.test(document.cookie))
      return true;
  } catch {
    /* optional */
  }
  try {
    return sessionStorage.getItem('dance-funnel-diagnostic') === '1';
  } catch {
    return false;
  }
}
export function externalAnalyticsAllowed() {
  return (
    typeof window !== 'undefined' &&
    analyticsPageAllowed(window.location.pathname) &&
    !analyticsDiagnostic()
  );
}
export function analyticsReferrer(referrer: string, origin: string) {
  try {
    const url = new URL(referrer);
    if (
      url.origin === origin ||
      ['accounts.google.com', 'checkout.stripe.com'].includes(url.hostname)
    )
      return { page_referrer: '', ignore_referrer: true };
    return { page_referrer: url.origin, ignore_referrer: false };
  } catch {
    return { page_referrer: '', ignore_referrer: false };
  }
}
export function analyticsLocation(href: string) {
  const url = new URL(href);
  const clean = new URLSearchParams();
  for (const key of [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
  ]) {
    const value = url.searchParams.get(key);
    if (value && /^[\w .:/-]{1,120}$/.test(value)) clean.set(key, value);
  }
  return url.origin + url.pathname + (clean.size ? `?${clean}` : '');
}
export function googleAnalyticsBootstrap(measurementId: string) {
  // The initial SSR script must apply the same exclusion before GA can load.
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}var id=${JSON.stringify(measurementId).replace(/</g, '\\u003c')};var diagnostic=(${analyticsDiagnostic.toString()})();var excluded=${privatePage.toString()}.test(location.pathname)||diagnostic;window['ga-disable-'+id]=excluded;gtag('js',new Date());if(!excluded){gtag('config',id,Object.assign({page_location:(${analyticsLocation.toString()})(location.href)},(${analyticsReferrer.toString()})(document.referrer,location.origin)));}`;
}
