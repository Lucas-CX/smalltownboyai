import { localizeUrl } from '@/core/i18n/urls';
import { dancePublicPaths } from '@/lib/dance-public-pages';
import { locales } from '@/paraglide/runtime.js';

export const danceMarketLocales = locales;

export function danceLocaleHasIndexablePage(path: string, locale: string) {
  return (
    dancePublicPaths.includes(path) &&
    danceMarketLocales.some((market) => market === locale)
  );
}

export function danceLanguageAlternates(origin: string, path: string) {
  return [
    ...locales
      .filter((locale) => danceLocaleHasIndexablePage(path, locale))
      .map((locale) => ({
        rel: 'alternate',
        hrefLang: locale,
        href: localizeUrl(origin + path, { locale }).href,
      })),
    { rel: 'alternate', hrefLang: 'x-default', href: origin + path },
  ];
}
