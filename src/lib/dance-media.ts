// Development preview fixture; replace together with the reference before launching a new template.
export const danceTrendPreview = {
  src: '/media/wan-reference-v1/example-faststart.mp4',
  poster: '/media/wan-reference-v1/poster.webp',
  width: 480,
  height: 854,
  duration: 'PT15.02S',
  cast: ['dancer', 'selfie', 'car-exit'].map(
    (role) => `/media/launch/input-${role}.webp`
  ),
  frames: ['dancer', 'selfie', 'car-exit', 'ending'].map(
    (role) => `/media/wan-reference-v1/${role}.webp`
  ),
} as const;
