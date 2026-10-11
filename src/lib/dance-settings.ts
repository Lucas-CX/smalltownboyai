export const danceResolutions = ['480P', '720P', '1080P'] as const;
export type DanceResolution = (typeof danceResolutions)[number];
export function isDanceResolution(value: unknown): value is DanceResolution {
  return danceResolutions.includes(value as DanceResolution);
}

// A convenience preference is never a requirement for selecting photos or paying.
export function loadDanceResolution(): DanceResolution | undefined {
  try {
    const value = localStorage.getItem('smalltown-resolution');
    return isDanceResolution(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
export function saveDanceResolution(value: DanceResolution) {
  try {
    localStorage.setItem('smalltown-resolution', value);
  } catch {
    /* keep the in-memory choice */
  }
}
