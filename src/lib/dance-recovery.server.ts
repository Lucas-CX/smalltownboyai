import { cloudDanceEnabled, danceD1 } from '@/core/cloudflare/dance';
import { danceDebitTimeSql } from '@/core/cloudflare/dance-recovery';
import { advanceDanceJobs } from '@/lib/dance-events.server';

// Existing (status,next_run_at) index skips completed jobs. Debit lookup uses
// credit's primary key. Unknown submissions wait for callback or compensation.
export const recoveryCandidatesSql = `SELECT id,user_id FROM dance_job
  WHERE status IN ('queued','generating','reconciling','failed') AND next_run_at<=?
  AND payment_mode IN ('credits-live','credits-test')
  AND (status='failed' OR expires_at<=?
    OR provider_id IS NOT NULL
    OR (provider_id IS NULL AND (
      (status='reconciling' AND error_code='SUBMISSION_PREPARING')
      OR ${danceDebitTimeSql}<=CASE WHEN status='queued' THEN ? ELSE ? END)))
  ORDER BY next_run_at,id LIMIT 4`;

// Platform scheduled hook only. No public HTTP trigger, loop, or DB heartbeat.
export async function sweepDanceRecovery() {
  if (!cloudDanceEnabled() || process.env.VITE_PREVIEW_ONLY === 'true') return;
  const d1 = danceD1();
  const startedAt = Date.now();
  const now = Math.floor(startedAt / 1000);
  const { results } = await d1
    .prepare(recoveryCandidatesSql)
    .bind(now, now, now - 300, now - 1800)
    .all();
  let errors = 0,
    checked = 0;
  // At most four jobs, two concurrently; do not start another pair after 25s.
  // Recovery status/download requests abort at 8s/20s, respectively.
  for (
    let i = 0;
    i < results.length && Date.now() - startedAt < 25000;
    i += 2
  ) {
    await Promise.all(
      results
        .slice(i, i + 2)
        .map(async (job: { id: string; user_id: string }) => {
          checked++;
          try {
            await advanceDanceJobs({
              userId: job.user_id,
              jobId: job.id,
              reason: 'recovery',
            });
          } catch {
            errors++;
            console.error('Dance recovery job failed');
          }
          // Rotate unresolved rows without shortening an active transfer lease.
          await d1
            .prepare(
              `UPDATE dance_job SET next_run_at=? WHERE id=?
        AND payment_mode IN ('credits-live','credits-test') AND next_run_at<=?`
            )
            .bind(now + 300, job.id, now)
            .run();
        })
    );
  }
  const summary = { checked, errors, deferred: results.length - checked };
  console.info('Dance recovery completed', JSON.stringify(summary));
  return summary;
}
