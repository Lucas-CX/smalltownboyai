import { cloudDanceEnabled, danceD1 } from './dance';

export const DANCE_PREPARATION_SECONDS = 300;
export const DANCE_DELIVERY_SECONDS = 1800;

// Use the debit time, not upload time: an unpaid draft may be hours old.
export const danceDebitTimeSql = `COALESCE((SELECT CAST(c.created_at / 1000 AS INTEGER)
  FROM credit c WHERE c.id=substr(dance_job.payment_id,8)
  AND c.user_id=dance_job.user_id AND c.transaction_type='consume'), created_at)`;

export async function recoverCloudDanceJob(userId: string, jobId: string) {
  if (!cloudDanceEnabled() || process.env.VITE_PREVIEW_ONLY === 'true') return;
  const d1 = danceD1();
  const now = Math.floor(Date.now() / 1000);
  await d1.batch([
    d1
      .prepare(
        `UPDATE dance_job SET status='failed',
      error_code='PRE_SUBMISSION_INTERRUPTED',provider_cost_cents=0,support_requested=1
      WHERE id=? AND user_id=? AND payment_mode IN ('credits-live','credits-test')
      AND provider_id IS NULL AND next_run_at<=?
      AND ((status='queued' AND ${danceDebitTimeSql}<=?)
        OR (status='reconciling' AND error_code='SUBMISSION_PREPARING'))`
      )
      .bind(jobId, userId, now, now - DANCE_PREPARATION_SECONDS),
    // This is compensation for non-delivery, NOT proof of no provider charge.
    // Terminal status fences out late callbacks/downloads; never resubmit.
    d1
      .prepare(
        `UPDATE dance_job SET status='failed',
      error_code='GENERATION_DELIVERY_TIMEOUT',support_requested=1
      WHERE id=? AND user_id=? AND payment_mode IN ('credits-live','credits-test')
      AND status IN ('queued','generating','reconciling')
      AND (expires_at<=? OR ${danceDebitTimeSql}<=?)`
      )
      .bind(jobId, userId, now, now - DANCE_DELIVERY_SECONDS),
  ]);
}

// Compare-and-set immediately before the sole paid call. If recovery won the
// race, the old worker cannot submit even if it resumes after its lease expired.
export async function claimCloudDanceSubmission(jobId: string, userId: string) {
  const now = Math.floor(Date.now() / 1000);
  const row = await danceD1()
    .prepare(
      `UPDATE dance_job
    SET error_code='PROVIDER_SUBMISSION_STARTED'
    WHERE id=? AND user_id=? AND status='reconciling'
    AND error_code='SUBMISSION_PREPARING' AND provider_id IS NULL
    AND payment_mode IN ('credits-live','credits-test')
    AND next_run_at>? AND expires_at>? AND ${danceDebitTimeSql}>?
    RETURNING id`
    )
    .bind(jobId, userId, now, now, now - DANCE_DELIVERY_SECONDS)
    .first();
  if (!row) throw new Error('Submission lease expired');
}
