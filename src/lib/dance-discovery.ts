import { envConfigs } from '@/config';
import { danceFaq } from '@/lib/dance-faq';
import { DANCE_RESOLUTION_CREDITS, dancePlans } from '@/lib/dance-plans';
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
    '## Product and policies',
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
  lines.push('', '## Languages', '');
  for (const language of locales.filter((language) => language !== 'en'))
    lines.push('- [' + language + '](' + origin + '/' + language + ')');
  if (full) {
    lines.push(
      '',
      '## Pricing and delivery',
      '',
      'One-time packs; no subscription. Unused credits do not expire. Prices are in USD. Video counts below assume 720p.',
      ...dancePlans.map(
        (plan) =>
          `- $${(plan.cents / 100).toFixed(2)}: ${plan.credits} credits, enough for ${plan.videos} video(s) at 720p.`
      ),
      ...Object.entries(DANCE_RESOLUTION_CREDITS).map(
        ([resolution, credits]) =>
          `- ${resolution.toLowerCase()}: ${credits} credits per video.`
      ),
      'Videos use a fixed 14-second, vertical 9:16 template. Download within 24 hours of order creation.',
      'The original song was added to the sample after generation. Delivery uses generated audio; the original recording is not guaranteed.',
      '',
      '## Support',
      '',
      'Email support@smalltownboyai.video for account, order or privacy help. No login or order is required.',
      '',
      '## Questions and answers'
    );
    for (const [question, answer] of danceFaq)
      lines.push('', '### ' + question({}, locale), answer({}, locale));
  }
  return lines.join('\n') + '\n';
}
