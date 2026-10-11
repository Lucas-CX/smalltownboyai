import { createRouter } from '@tanstack/react-router';

import { installBrowserLocaleCache } from '@/core/i18n/locale-cache';
import { deLocalizeUrl, localizeUrl } from '@/core/i18n/urls';

import { routeTree } from './routeTree.gen';

export function getRouter() {
  installBrowserLocaleCache();
  const router = createRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    // Paraglide owns locale prefixes: incoming URLs are de-localized before
    // matching (routes are locale-free), outgoing hrefs get re-localized.
    rewrite: {
      input: ({ url }) => deLocalizeUrl(url),
      output: ({ url }) => localizeUrl(url),
    },
  });
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
