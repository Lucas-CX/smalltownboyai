// Wan 3.0 reference-image limits. Apply to decoded pixels, never just MIME labels.
export const MIN_DANCE_PHOTO_EDGE = 240;
export const MAX_DANCE_PHOTO_RATIO = 8;
export const DANCE_PHOTO_RULE_VERSION = 'wan3_photo_v3';

export function dancePhotoOutputSize(width: number, height: number) {
  // A fixed 1600px cap would turn an 8:1 photo into 1600×200, below Wan's minimum.
  const longest = Math.max(width, height);
  const shortest = Math.min(width, height);
  const target = Math.max(
    1600,
    Math.ceil((MIN_DANCE_PHOTO_EDGE * longest) / shortest)
  );
  const scale = Math.min(1, target / longest);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
