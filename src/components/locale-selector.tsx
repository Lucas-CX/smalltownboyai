import { useEffect, useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import { Check, ChevronDown, Globe, Languages } from 'lucide-react';

import { deLocalizeUrl, localizeHref } from '@/core/i18n/urls';
import { localeNames } from '@/config/locale';
import { danceLocaleHasIndexablePage } from '@/lib/dance-locales';
import { cn } from '@/lib/utils';
import { getLocale, locales } from '@/paraglide/runtime.js';

export function LocaleSelector({
  variant = 'icon',
  className,
}: {
  variant?: 'icon' | 'pill';
  className?: string;
}) {
  const locale = getLocale();
  const location = useLocation();
  const [fragment, setFragment] = useState('');
  useEffect(() => {
    const syncFragment = () => setFragment(window.location.hash);
    syncFragment();
    window.addEventListener('hashchange', syncFragment);
    return () => window.removeEventListener('hashchange', syncFragment);
  }, [location.href, location.hash]);
  // Fragments never reach SSR requests; restore them after hydration.
  const href = location.href.split('#')[0] + fragment;
  const path = deLocalizeUrl(
    new URL(location.href, 'https://locale.invalid')
  ).pathname;

  return (
    <details
      className="locale-selector relative inline-block"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          event.currentTarget.open = false;
      }}
    >
      <summary
        aria-label={localeNames[locale] || locale}
        className={cn(
          'focus-visible:ring-ring inline-flex cursor-pointer list-none items-center transition-colors outline-none focus-visible:ring-2',
          variant === 'icon'
            ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground size-10 justify-center rounded-md'
            : 'h-10 gap-2 rounded-full border px-4 text-sm',
          className
        )}
      >
        {variant === 'icon' ? (
          <>
            <Languages className="size-4" />
            <span className="sr-only">Switch language</span>
          </>
        ) : (
          <>
            <Globe className="size-4" />
            <span className="locale-selector-name">
              {localeNames[locale] || locale}
            </span>
            <span className="locale-selector-short-name">
              {locale === 'zh' ? '中文' : locale.toUpperCase()}
            </span>
            <ChevronDown className="size-4 opacity-70" />
          </>
        )}
      </summary>
      <div
        role="navigation"
        aria-label={localeNames[locale] || locale}
        className="bg-popover text-popover-foreground border-border absolute right-0 z-50 mt-2 min-w-44 rounded-md border p-1 shadow-md"
      >
        {locales
          .filter((loc) => danceLocaleHasIndexablePage(path, loc))
          .map((loc) => (
            <a
              key={loc}
              href={localizeHref(href, { locale: loc })}
              hrefLang={loc}
              lang={loc}
              aria-current={loc === locale ? 'true' : undefined}
              className="hover:bg-accent focus-visible:bg-accent flex min-h-10 items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm"
            >
              {localeNames[loc] || loc}
              {loc === locale && <Check className="size-3.5" />}
            </a>
          ))}
      </div>
    </details>
  );
}
