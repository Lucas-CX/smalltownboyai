import { getLocale, overwriteGetLocale } from '@/paraglide/runtime.js';

let installed = false;

// Avoid rebuilding URLPatterns for every label. Server locale resolution stays
// request-scoped; browser URL and cookie changes invalidate this cache.
export function installBrowserLocaleCache() {
  if (typeof window === 'undefined' || installed) return;
  installed = true;
  const resolve = getLocale;
  let previousUrl: string | undefined;
  let previousCookie: string | undefined;
  let locale: ReturnType<typeof getLocale>;
  overwriteGetLocale(() => {
    const url = window.location.href;
    const cookie = document.cookie;
    if (url !== previousUrl || cookie !== previousCookie) {
      locale = resolve();
      previousUrl = window.location.href;
      previousCookie = document.cookie;
    }
    return locale;
  });
}
