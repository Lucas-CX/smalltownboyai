export function danceProgress(
  job: { status: string; createdAt: number; expired: boolean },
  now = Date.now()
) {
  if (
    job.expired ||
    !['queued', 'generating', 'reconciling'].includes(job.status)
  )
    return null;
  const minutes = Number.isFinite(job.createdAt)
    ? Math.max(0, Math.floor((now / 1000 - job.createdAt) / 60))
    : 0;
  return {
    stage: job.status as 'queued' | 'generating' | 'reconciling',
    minutes,
    delayed: minutes >= 15,
  };
}
