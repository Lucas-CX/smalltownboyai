import { and, eq, isNull } from 'drizzle-orm';

import { danceCallbackUrl } from '@/core/ai/dance-callback';
import { DANCE_MODEL, KieDanceClient } from '@/core/ai/dance-kie';
import { recoverCloudDanceJob } from '@/core/cloudflare/dance-recovery';
import { db } from '@/core/db';
import { danceJob } from '@/config/db/schema';
import { restoreFailedDanceCredits } from '@/modules/ai-tasks/service';
import { getAllConfigs } from '@/modules/config/service';
import { owned, tick, type DanceRunScope } from '@/modules/dance/service';

// Route-level orchestration keeps business modules independent. Never run a
// global sweep from a public callback or from one customer's page refresh.
export async function advanceDanceJobs(
  scope: DanceRunScope & { userId: string }
) {
  if (process.env.VITE_PREVIEW_ONLY === 'true') return;
  try {
    if (scope.jobId) await recoverCloudDanceJob(scope.userId, scope.jobId);
    const config = await getAllConfigs();
    await tick(config.kie_api_key, scope);
  } finally {
    await restoreFailedDanceCredits(scope);
  }
}

export async function completeDanceCallback(jobId: string, taskId: string) {
  if (process.env.VITE_PREVIEW_ONLY === 'true')
    throw new Error('Preview paused');
  const [job] = await db()
    .select()
    .from(danceJob)
    .where(eq(danceJob.id, jobId))
    .limit(1);
  if (!job || job.generationMode !== 'kie')
    throw new Error('Unknown callback job');
  if (job.providerId && job.providerId !== taskId)
    throw new Error('Callback task mismatch');
  if (job.status === 'deleted') return;
  if (['succeeded', 'failed'].includes(job.status)) {
    await restoreFailedDanceCredits({ jobId, userId: job.userId });
    return;
  }
  if (job.expiresAt <= Math.floor(Date.now() / 1000)) {
    await advanceDanceJobs({ userId: job.userId, jobId, reason: 'callback' });
    return;
  }
  if (!job.providerId) {
    // A callback can arrive before createTask's response, or after its timeout.
    // Recover only a task whose authenticated provider record contains this
    // exact signed callback URL and expected model. Never submit it again.
    if (job.status !== 'reconciling') throw new Error('Submission not claimed');
    const config = await getAllConfigs();
    if (!config.kie_api_key) throw new Error('Provider unavailable');
    const detail = await new KieDanceClient(config.kie_api_key).status(taskId);
    if (
      detail.taskId !== taskId ||
      detail.model !== DANCE_MODEL ||
      detail.callbackUrl !== danceCallbackUrl(jobId)
    )
      throw new Error('Unmatched provider receipt');
    await db()
      .update(danceJob)
      .set({ providerId: taskId, nextRunAt: 0, errorCode: null })
      .where(
        and(
          eq(danceJob.id, jobId),
          isNull(danceJob.providerId),
          eq(danceJob.status, 'reconciling')
        )
      );
  }
  await advanceDanceJobs({ userId: job.userId, jobId, reason: 'callback' });
  const current = await owned(job.userId, jobId);
  if (!['succeeded', 'failed', 'deleted'].includes(current.status))
    throw new Error('Result not persisted yet');
}
