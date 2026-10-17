import { lazy, Suspense, type ComponentType } from 'react';
import { notFound, useLoaderData } from '@tanstack/react-router';

import { danceTrendPreview } from '@/lib/dance-media';
import { danceGuidePaths } from '@/lib/dance-public-pages';
import {
  danceOrganizationId,
  danceWebsiteId,
  jsonLd,
} from '@/lib/dance-schema';
import { dancePageSeo } from '@/lib/dance-seo';
import { m } from '@/paraglide/messages.js';
import { baseLocale, getLocale } from '@/paraglide/runtime.js';

type PageModule = {
  default: ComponentType;
  meta: {
    title: string;
    description: string;
    updated_at: string;
    sampleVideo?: { name: string; description: string };
  };
};
const pages = import.meta.glob<PageModule>('/src/content/pages/*.mdx');
const components = Object.fromEntries(
  Object.entries(pages).map(([key, load]) => [key, lazy(load)])
);
function pageKey(slug: string, locale: string) {
  const localized = '/src/content/pages/' + slug + '.' + locale + '.mdx';
  const fallback = '/src/content/pages/' + slug + '.' + baseLocale + '.mdx';
  return localized in pages ? localized : fallback in pages ? fallback : null;
}
type LoaderData = {
  meta: PageModule['meta'];
  key: string;
  locale: ReturnType<typeof getLocale>;
};
export function staticPageRouteOptions(slug: string) {
  return {
    loader: async (): Promise<LoaderData> => {
      const locale = getLocale();
      const key = pageKey(slug, locale);
      if (!key) throw notFound();
      return { meta: (await pages[key]()).meta, key, locale };
    },
    head: ({ loaderData }: { loaderData?: LoaderData }) => {
      if (!loaderData) return {};
      const seo = dancePageSeo(
        '/' + slug,
        loaderData.meta.title,
        loaderData.meta.description,
        loaderData.locale
      );
      if (!danceGuidePaths.some((path) => path === '/' + slug)) return seo;
      return {
        ...seo,
        scripts: [
          ...seo.scripts,
          jsonLd({
            '@context': 'https://schema.org',
            '@type': slug === 'guides' ? 'CollectionPage' : 'Article',
            '@id': seo.links[0].href + '#content',
            url: seo.links[0].href,
            headline: loaderData.meta.title,
            description: loaderData.meta.description,
            inLanguage: loaderData.locale,
            dateModified: loaderData.meta.updated_at,
            publisher: { '@id': danceOrganizationId() },
            author: { '@id': danceOrganizationId() },
            isPartOf: { '@id': danceWebsiteId() },
          }),
          ...(slug === 'smalltown-boy-sample' && loaderData.meta.sampleVideo
            ? [
                jsonLd({
                  '@context': 'https://schema.org',
                  '@type': 'VideoObject',
                  '@id': seo.links[0].href + '#video',
                  name: loaderData.meta.sampleVideo.name,
                  description: loaderData.meta.sampleVideo.description,
                  thumbnailUrl: new URL(
                    danceTrendPreview.poster,
                    seo.links[0].href
                  ).href,
                  contentUrl: new URL(danceTrendPreview.src, seo.links[0].href)
                    .href,
                  uploadDate: danceTrendPreview.uploadedAt,
                  duration: danceTrendPreview.duration,
                  width: danceTrendPreview.width,
                  height: danceTrendPreview.height,
                  publisher: { '@id': danceOrganizationId() },
                  mainEntityOfPage: seo.links[0].href,
                }),
              ]
            : []),
        ],
      };
    },
    component: StaticPage,
  };
}
function StaticPage() {
  const { meta, key } = useLoaderData({ strict: false }) as LoaderData;
  const Content = components[key];
  return (
    <article>
      <header className="mb-6 border-b pb-5">
        <h1 className="text-3xl font-semibold">{meta.title}</h1>
        <p className="text-muted-foreground mt-2">{meta.description}</p>
      </header>
      <Suspense fallback={<p>{m['dance.loading']()}</p>}>
        <Content />
      </Suspense>
    </article>
  );
}
