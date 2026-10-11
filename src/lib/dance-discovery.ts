import { envConfigs } from '@/config';
import { danceFaq } from '@/lib/dance-faq';
import { m } from '@/paraglide/messages.js';
import { locales } from '@/paraglide/runtime.js';

export const dancePublicPaths = [
  '/',
  '/pricing',
  '/about',
  '/privacy-policy',
  '/terms-of-service',
  '/refund-policy',
  '/contact',
];
export const danceChineseGuidePaths: string[] = [];
export function danceDiscoveryText(full = false) {
  const origin = envConfigs.seo_url.replace(/\/$/, '');
  const locale = { locale: 'en' as const };
  const lines = [
    '# ' + envConfigs.app_name,
    '',
    m['dance.seo.description']({}, locale),
    '',
    ...dancePublicPaths.map(
      (path) =>
        '- [' +
        (path === '/' ? 'Video generator' : path.slice(1)) +
        '](' +
        origin +
        path +
        ')'
    ),
  ];
  for (const language of locales.filter((language) => language !== 'en'))
    lines.push('- [' + language + '](' + origin + '/' + language + ')');
  if (full)
    for (const [question, answer] of danceFaq)
      lines.push('', '## ' + question({}, locale), answer({}, locale));
  return lines.join('\n') + '\n';
}
