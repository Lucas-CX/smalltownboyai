import { apiGet } from './api-client';

export const videoFailureReasons = [
  'video_aborted',
  'video_network',
  'video_decode',
  'video_unsupported',
  'video_unknown',
  'video_missing',
  'video_expired',
  'video_not_ready',
  'video_unavailable',
  'authentication_required',
] as const;
export type VideoFailureReason = (typeof videoFailureReasons)[number];
export type VideoFileState =
  | 'ready'
  | 'video_network'
  | 'video_missing'
  | 'video_expired'
  | 'video_not_ready'
  | 'video_unavailable'
  | 'authentication_required';

export function videoMediaFailure(
  code?: number,
  online = true
): VideoFailureReason {
  if (!online) return 'video_network';
  switch (code) {
    case 1:
      return 'video_aborted';
    case 2:
      return 'video_network';
    case 3:
      return 'video_decode';
    case 4:
      return 'video_unsupported';
    default:
      return 'video_unknown';
  }
}

export function videoFailureFromState(
  media: VideoFailureReason,
  state: VideoFileState
): VideoFailureReason {
  return state === 'ready' ? media : state;
}

export async function readDanceVideoState(
  jobId: string
): Promise<VideoFileState> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const result = await apiGet<{ state: VideoFileState }>(
      `/api/dance/file?id=${encodeURIComponent(jobId)}&slot=video&status=1`,
      { signal: controller.signal }
    );
    if (result.state === 'ready' || videoFailureReasons.includes(result.state))
      return result.state;
    return 'video_unavailable';
  } catch {
    return 'video_network';
  } finally {
    clearTimeout(timeout);
  }
}
