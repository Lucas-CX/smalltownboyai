import { createFileRoute } from '@tanstack/react-router';

import { danceEntryLocales } from '@/lib/dance-market-scope';
import { dancePageSeo, danceSeo } from '@/lib/dance-seo';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { DanceMarketEntry } from '@/blocks/dance-market-entry';
import { DanceStudio } from '@/blocks/dance-studio';

export const Route = createFileRoute('/')({
  head: () =>
    danceEntryLocales.some((locale) => locale === getLocale())
      ? dancePageSeo(
          '/',
          m['market.seo.title'](),
          m['market.seo.description']()
        )
      : danceSeo(),
  component: () =>
    danceEntryLocales.some((locale) => locale === getLocale()) ? (
      <DanceMarketEntry />
    ) : (
      <DanceStudio />
    ),
});
