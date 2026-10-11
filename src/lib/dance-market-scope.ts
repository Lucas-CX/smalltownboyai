// The first German/Polish release covers the generator and pricing, not the
// editorial library. Never advertise English fallback articles as translations.
export const dancePilotLocales = ['de', 'pl'] as const;
export const danceEntryLocales = ['tr', 'ro'] as const;
export const danceLimitedLocales = [...dancePilotLocales, ...danceEntryLocales];
export function danceMarketPageAvailable(path: string, locale: string) {
  const normalized = path.replace(/\/$/, '') || '/';
  if (danceEntryLocales.some((value) => value === locale))
    return normalized === '/';
  return (
    !dancePilotLocales.some((value) => value === locale) ||
    ['/', '/pricing'].includes(normalized)
  );
}
