import {
  baseLocale,
  getLocale,
  locales,
  type Locale,
} from '@/paraglide/runtime.js';

const prefixes = new Set<string>(
  locales.filter((locale) => locale !== baseLocale)
);

// Mirrors vite.config.ts's fixed prefix rules without compiling URLPatterns for
// every router link. Keep the parity test when changing the Inlang URL rules.
export function deLocalizeUrl(input: string | URL): URL {
  const url = new URL(input);
  const end = url.pathname.indexOf('/', 1);
  const first = url.pathname.slice(1, end === -1 ? undefined : end);
  if (prefixes.has(first))
    url.pathname = end === -1 ? '/' : url.pathname.slice(end);
  return url;
}

export function localizeUrl(
  input: string | URL,
  options?: { locale?: Locale }
): URL {
  const source = new URL(input);
  // API rules precede locale rules in the compiler configuration.
  if (source.pathname === '/api' || source.pathname.startsWith('/api/'))
    return source;
  const url = deLocalizeUrl(source);
  const locale = options?.locale ?? getLocale();
  const bareHome =
    source.pathname === '/' || prefixes.has(source.pathname.slice(1));
  if (locale !== baseLocale)
    url.pathname = '/' + locale + (bareHome ? '' : url.pathname);
  return url;
}

export function localizeHref(
  href: string,
  options?: { locale?: Locale }
): string {
  // This helper is used for root-relative application links only.
  const url = localizeUrl(new URL(href, 'https://locale.invalid'), options);
  return href.startsWith('/') ? url.pathname + url.search + url.hash : url.href;
}
