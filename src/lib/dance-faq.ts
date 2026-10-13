import { envConfigs } from '@/config';
import { DANCE_CREDITS_PER_VIDEO, dancePlans } from '@/lib/dance-plans';
import { m } from '@/paraglide/messages.js';

// One source for the visible homepage FAQ, JSON-LD and llms-full.txt.
export const danceFaq = [
  ...(envConfigs.preview_only === 'true'
    ? [[m['dance.preview.question'], m['dance.preview.answer']] as const]
    : []),
  [m['dance.q8'], m['dance.a8']],
  [m['dance.q1'], m['dance.a1']],
  [m['dance.q9'], m['dance.a9']],
  [m['dance.q5'], m['dance.a5']],
  [m['dance.q2'], m['dance.a2']],
  [m['dance.q10'], m['dance.a10']],
  [m['dance.q11'], m['dance.a11']],
  [
    m['dance.q12'],
    (_inputs = {}, options?: Parameters<(typeof m)['dance.q12']>[1]) =>
      m['dance.a12'](
        {
          price: (dancePlans[0].cents / 100).toFixed(2),
          credits: DANCE_CREDITS_PER_VIDEO,
        },
        options
      ),
  ],
  [m['dance.q13'], m['dance.a13']],
  [m['dance.q7'], m['dance.a7']],
  [m['dance.q17'], m['dance.a17']],
  [m['dance.q14'], m['dance.a14']],
  [m['dance.q15'], m['dance.a15']],
  [m['dance.q16'], m['dance.a16']],
  [m['dance.q4'], m['dance.a4']],
  [m['dance.q3'], m['dance.a3']],
] as const;
