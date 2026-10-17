// Keep Android X5 playback in the page's compositing layer.
export const inlineVideoProps = {
  playsInline: true,
  disablePictureInPicture: true,
  'webkit-playsinline': 'true',
  'x5-playsinline': 'true',
  'x5-video-player-type': 'h5-page',
} as const;
