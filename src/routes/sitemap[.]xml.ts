import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { dancePublicPaths } from '@/lib/dance-discovery';
import {
  danceLanguageAlternates,
  danceLocaleHasIndexablePage,
  danceMarketLocales,
} from '@/lib/dance-locales';
import { localizeUrl } from '@/paraglide/runtime.js';

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () =>
        new Response(
          '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
            (envConfigs.site_indexable === 'true'
              ? [
                  ...danceMarketLocales.flatMap((locale) =>
                    dancePublicPaths
                      .filter((path) =>
                        danceLocaleHasIndexablePage(path, locale)
                      )
                      .map((path) => ({ path, locale }))
                  ),
                ]
              : []
            )
              .map(
                ({ path, locale }) =>
                  '<url><loc>' +
                  localizeUrl(envConfigs.seo_url.replace(/\/$/, '') + path, {
                    locale,
                  }).href +
                  '</loc>' +
                  danceLanguageAlternates(
                    envConfigs.seo_url.replace(/\/$/, ''),
                    path
                  )
                    .map(
                      ({ hrefLang, href }) =>
                        `<xhtml:link rel="alternate" hreflang="${hrefLang}" href="${href}"/>`
                    )
                    .join('') +
                  '</url>'
              )
              .join('') +
            '</urlset>',
          { headers: { 'Content-Type': 'application/xml' } }
        ),
    },
  },
});
