import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';

export const danceOrigin = () => envConfigs.seo_url.replace(/\/$/, '');
export const danceOrganizationId = () => danceOrigin() + '/#organization';
export const danceWebsiteId = () => danceOrigin() + '/#website';

export function jsonLd(value: unknown) {
  return {
    type: 'application/ld+json',
    children: JSON.stringify(value).replace(/</g, '\\u003c'),
  };
}

export function danceSiteSchemas() {
  const origin = danceOrigin();
  return [
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': danceOrganizationId(),
      name: envConfigs.app_brand,
      url: origin + '/',
      logo: origin + '/favicon.svg',
      description: m['dance.seo.description'](),
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        url: origin + '/contact',
      },
      // Do not invent legal entity details, reviews or social profiles.
    }),
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': danceWebsiteId(),
      name: envConfigs.app_brand,
      url: origin + '/',
      publisher: { '@id': danceOrganizationId() },
    }),
  ];
}
