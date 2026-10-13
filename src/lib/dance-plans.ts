import type { DanceResolution } from './dance-settings';

// Update when the public pricing explanation is reviewed, not on every build.
export const DANCE_PRICING_REVIEWED_AT = '2026-10-14';

export const DANCE_RESOLUTION_CREDITS = {
  '480P': 100,
  '720P': 150,
  '1080P': 250,
} as const;
export const DANCE_CREDITS_PER_VIDEO = DANCE_RESOLUTION_CREDITS['720P'];
export function danceCreditCost(
  resolution: string | null | undefined = '480P'
) {
  const quality = resolution ?? '480P';
  if (!Object.hasOwn(DANCE_RESOLUTION_CREDITS, quality))
    throw new Error('Unsupported resolution');
  return DANCE_RESOLUTION_CREDITS[quality as DanceResolution];
}
export const dancePlans = [
  { id: 'single', videos: 1, credits: 150, cents: 790 },
  { id: 'friends', videos: 3, credits: 450, cents: 1990 },
  { id: 'collection', videos: 5, credits: 750, cents: 2990 },
] as const;
