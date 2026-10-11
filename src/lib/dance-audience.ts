import type { FunnelParams } from '@/lib/dance-funnel-contract';

// Browser language is a preference, never a country inference. Keep regional
// subtags and ignore disabled/invalid ranges; do not store the whole header.
export function preferredBrowserLanguage(header: string | null) {
  const choices = (header || '')
    .slice(0, 2048)
    .split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const quality = parameters.find((part) => part.trim().startsWith('q='));
      const q = quality ? Number(quality.trim().slice(2)) : 1;
      return { tag, q, index };
    })
    .filter(
      ({ tag, q }) =>
        /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(tag) &&
        tag.length <= 35 &&
        Number.isFinite(q) &&
        q > 0 &&
        q <= 1
    )
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of choices) {
    try {
      return Intl.getCanonicalLocales(tag)[0];
    } catch {
      /* Invalid tag. */
    }
  }
  return 'unknown';
}

export function funnelAudience(
  request: Request,
  pageLocale: NonNullable<FunnelParams['page_locale']>,
  cloudflare = false
) {
  // Only trust edge geolocation in the Workers runtime. Never accept country
  // from event JSON, browser language, or arbitrary local request headers.
  const country = cloudflare
    ? (request as Request & { cf?: { country?: string } }).cf?.country ||
      request.headers.get('cf-ipcountry')
    : null;
  return {
    audience_version: 'market_20261011' as const,
    browser_language: preferredBrowserLanguage(
      request.headers.get('accept-language')
    ),
    page_locale: pageLocale,
    geo_country:
      country && /^[A-Z]{2}$/.test(country) && country !== 'XX'
        ? country
        : 'unknown',
    geo_source:
      country && /^[A-Z]{2}$/.test(country) && country !== 'XX'
        ? ('cloudflare' as const)
        : ('unknown' as const),
  };
}
