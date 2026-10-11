import type { ComponentProps } from 'react';

import { Link } from '@/core/i18n/navigation';
import { dancePublicPaths } from '@/lib/dance-discovery';
import { danceMarketPageAvailable } from '@/lib/dance-market-scope';
import { getLocale } from '@/paraglide/runtime.js';

// Full navigation is intentional for articles outside the pilot's translated
// scope: the public English URL resets the locale, including an old cookie.
export function DanceContentLink(props: ComponentProps<typeof Link>) {
  const path = props.href.split(/[?#]/)[0];
  if (
    dancePublicPaths.includes(path) &&
    !danceMarketPageAvailable(path, getLocale())
  ) {
    const { locale: _locale, prefetch: _prefetch, children, ...rest } = props;
    return (
      <a {...rest} hrefLang="en">
        {children} <span lang="en">(English)</span>
      </a>
    );
  }
  return <Link {...props} />;
}
