// Shared by indexability, sitemap and AI discovery. Every path has EN/ZH content.
export const danceGuidePaths = [
  '/guides',
  '/how-to-make-smalltown-boy-ai-video',
  '/smalltown-boy-cat-dance',
  '/smalltown-boy-photo-guide',
  '/smalltown-boy-video-options',
  '/smalltown-boy-sample',
] as const;

export const dancePublicPaths: readonly string[] = [
  '/',
  '/pricing',
  '/about',
  '/privacy-policy',
  '/terms-of-service',
  '/refund-policy',
  '/contact',
  ...danceGuidePaths,
];
