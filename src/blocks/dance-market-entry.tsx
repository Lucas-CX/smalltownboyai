import { useEffect, useRef } from 'react';
import { Video } from 'lucide-react';

import { envConfigs } from '@/config';
import { trackDance } from '@/lib/dance-analytics';
import { flushDanceFunnel } from '@/lib/dance-funnel-client';
import { dancePlans } from '@/lib/dance-plans';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { LocaleSelector } from '@/components/locale-selector';

import '@/styles/dance.css';

// Acquisition-only pilot. The English destination and its paid nature are
// explicit; no translated generator or zero-price offer is implied.
export function DanceMarketEntry() {
  const locale = getLocale() === 'tr' ? 'tr' : 'ro';
  const viewed = useRef(false);
  useEffect(() => {
    if (!viewed.current) {
      viewed.current = true;
      trackDance('dance_market_landing_viewed', { entry_market: locale });
    }
  }, [locale]);
  const price = (dancePlans[0].cents / 100).toFixed(2);
  return (
    <div className="dance-page">
      <header className="dance-header">
        <a href={'/' + locale} className="dance-brand">
          <Video size={25} />
          <span>{envConfigs.app_name}</span>
        </a>
        <LocaleSelector variant="pill" className="dance-language-selector" />
      </header>
      <main className="dance-market-entry">
        <section className="dance-intro py-12 md:py-20">
          <p className="dance-eyebrow">{m['market.eyebrow']()}</p>
          <h1>
            <em>{envConfigs.app_name}</em>
            <br />
            {m['market.title']()}
          </h1>
          <p className="dance-lead">{m['market.lead']()}</p>
          <p className="mb-5 max-w-xl text-sm leading-relaxed">
            {m['market.price']({ price })}
          </p>
          <p className="mb-5 max-w-xl text-sm leading-relaxed">
            {m['market.language_notice']()}
          </p>
          <a
            href="/?market_entry=1#studio"
            hrefLang="en"
            className="inline-flex min-h-12 max-w-full items-center rounded-full bg-[#d0f66a] px-6 py-3 text-center font-semibold text-[#0d0e0c]"
            onClick={() => {
              trackDance('dance_market_entry_clicked', {
                entry_market: locale,
              });
              void flushDanceFunnel();
            }}
          >
            {m['market.cta']()} ↗
          </a>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#a0a397]">
            {m['market.permissions']()}
          </p>
        </section>
        <section className="dance-how">
          <h2>{m['market.how']()}</h2>
          <ol className="my-6 grid gap-6 md:grid-cols-3">
            <li>
              <h3>1. {m['market.step1']()}</h3>
              <p>{m['market.step1_body']()}</p>
            </li>
            <li>
              <h3>2. {m['market.step2']()}</h3>
              <p>{m['market.step2_body']()}</p>
            </li>
            <li>
              <h3>3. {m['market.step3']()}</h3>
              <p>{m['market.step3_body']()}</p>
            </li>
          </ol>
        </section>
        <section className="dance-faq pb-12">
          <h2>{m['market.limits_title']()}</h2>
          <p className="max-w-3xl leading-relaxed">{m['market.limits']()}</p>
          <div className="mt-6 flex flex-wrap gap-5 text-sm">
            <a href="/pricing" hrefLang="en">
              {m['market.pricing']()} <span lang="en">(English)</span>
            </a>
          </div>
        </section>
        <footer className="flex flex-wrap gap-5 border-t border-[#2b2e25] py-6 text-sm">
          <a href="/privacy-policy" hrefLang="en">
            {m['market.privacy']()} <span lang="en">(English)</span>
          </a>
          <a href="/terms-of-service" hrefLang="en">
            {m['market.terms']()} <span lang="en">(English)</span>
          </a>
          <a href="/refund-policy" hrefLang="en">
            {m['market.refunds']()} <span lang="en">(English)</span>
          </a>
        </footer>
      </main>
    </div>
  );
}
