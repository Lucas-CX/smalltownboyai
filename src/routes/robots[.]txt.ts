import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { baseLocale, locales } from '@/paraglide/runtime.js';

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => {
        const rules = [
          envConfigs.site_indexable === 'true' ? 'Allow: /' : 'Disallow: /',
          ...[
            '',
            ...locales
              .filter((locale) => locale !== baseLocale)
              .map((locale) => '/' + locale),
          ].flatMap((prefix) =>
            [
              'admin',
              'settings',
              'sign-in',
              'sign-up',
              'auth-callback',
              'reset-password',
              'forgot-password',
              'verify-email',
              'redeem-invite',
            ].map((path) => `Disallow: ${prefix}/${path}`)
          ),
          'Disallow: /api/',
        ];
        const body = [
          'User-agent: *',
          ...rules,
          '',
          'User-agent: OAI-SearchBot',
          ...rules,
          '',
          `Sitemap: ${envConfigs.seo_url}/sitemap.xml`,
          '',
        ].join('\n');
        return new Response(body, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            // Keep preview crawl restrictions from lingering after launch.
            'Cache-Control': 'public, max-age=300, must-revalidate',
          },
        });
      },
    },
  },
});
