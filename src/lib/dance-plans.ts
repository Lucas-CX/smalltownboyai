import type { DanceResolution } from './dance-settings';

// Update when the public pricing explanation is reviewed, not on every build.
export const DANCE_PRICING_REVIEWED_AT = '2026-10-09';

export const DANCE_RESOLUTION_CREDITS = {
  '480P': 100,
  '720P': 150,
  '1080P': 250,
} as const;
export const DANCE_CREDITS_PER_VIDEO = DANCE_RESOLUTION_CREDITS['480P'];
export function danceCreditCost(
  resolution: string | null | undefined = '480P'
) {
  const quality = resolution ?? '480P';
  if (!Object.hasOwn(DANCE_RESOLUTION_CREDITS, quality))
    throw new Error('Unsupported resolution');
  return DANCE_RESOLUTION_CREDITS[quality as DanceResolution];
}
export const dancePlans = [
  { id: 'single', videos: 1, credits: 100, cents: 990 },
  { id: 'friends', videos: 4, credits: 400, cents: 3290 },
  { id: 'collection', videos: 10, credits: 1000, cents: 7490 },
] as const;
