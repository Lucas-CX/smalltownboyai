import { localizeUrl } from '@/core/i18n/urls';
import { envConfigs } from '@/config';
import { danceFaq } from '@/lib/dance-faq';
import {
  danceLanguageAlternates,
  danceLocaleHasIndexablePage,
} from '@/lib/dance-locales';
import {
  DANCE_PRICING_REVIEWED_AT,
  danceCreditCost,
  dancePlans,
} from '@/lib/dance-plans';
import {
  danceOrganizationId,
  danceSiteSchemas,
  danceWebsiteId,
  jsonLd,
} from '@/lib/dance-schema';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

const packNames = {
  single: m['dance.pack.single'],
  friends: m['dance.pack.friends'],
  collection: m['dance.pack.collection'],
};

export function dancePageSeo(
  path: string,
  title: string,
  description: string,
  locale = getLocale()
) {
  const origin = envConfigs.seo_url.replace(/\/$/, '');
  const canonical = localizeUrl(origin + path, { locale }).href;
  return {
    scripts: danceSiteSchemas(),
    meta: [
      { title },
      { name: 'description', content: description },
      {
        name: 'robots',
        content:
          envConfigs.site_indexable === 'true' &&
          danceLocaleHasIndexablePage(path, locale)
            ? 'index, follow, max-video-preview:-1, max-image-preview:large'
            : 'noindex, nofollow',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: canonical },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [
      { rel: 'canonical', href: canonical },
      ...danceLanguageAlternates(origin, path),
    ],
  };
}

export function danceSeo() {
  const title = m['dance.seo.title']();
  const description = m['dance.seo.description']();
  const seo = dancePageSeo('/', title, description);
  return {
    ...seo,
    scripts: [
      ...seo.scripts,
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          '@id': seo.links[0].href + '#application',
          name: envConfigs.app_brand,
          url: seo.links[0].href,
          description,
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'Web browser',
          publisher: { '@id': danceOrganizationId() },
          isPartOf: { '@id': danceWebsiteId() },
          ...(envConfigs.preview_only === 'true'
            ? {}
            : { offers: dancePricingOffers() }),
          // No fabricated reviews, ratings, free offers or unverified generation times.
        }).replace(/</g, '\\u003c'),
      },
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: danceFaq.map(([question, answer]) => ({
            '@type': 'Question',
            name: question(),
            acceptedAnswer: {
              '@type': 'Answer',
              text: answer(),
            },
          })),
        }).replace(/</g, '\\u003c'),
      },
    ],
  };
}

function dancePricingOffers() {
  return dancePlans.map((plan) => ({
    '@type': 'Offer',
    price: (plan.cents / 100).toFixed(2),
    priceCurrency: 'USD',
    name: m['dance.pricing_snapshot.offer']({
      name: packNames[plan.id](),
      credits: plan.credits,
    }),
    url: localizeUrl(envConfigs.seo_url + '/pricing').href,
    seller: { '@id': danceOrganizationId() },
  }));
}

export function dancePricingSeo() {
  const title = m['dance.seo.pricing.title']();
  const description = m['dance.seo.pricing.description']({
    price: (dancePlans[0].cents / 100).toFixed(2),
    credits: dancePlans[0].credits,
    cost480: danceCreditCost('480P'),
    cost720: danceCreditCost('720P'),
    cost1080: danceCreditCost('1080P'),
  });
  const seo = dancePageSeo('/pricing', title, description);
  if (envConfigs.preview_only === 'true') return seo;
  return {
    ...seo,
    scripts: [
      ...seo.scripts,
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': seo.links[0].href + '#webpage',
        url: seo.links[0].href,
        name: title,
        description,
        dateModified: DANCE_PRICING_REVIEWED_AT,
        isPartOf: { '@id': danceWebsiteId() },
        mainEntity: {
          '@type': 'OfferCatalog',
          name: title,
          numberOfItems: dancePlans.length,
          itemListElement: dancePricingOffers(),
        },
      }),
    ],
  };
}
